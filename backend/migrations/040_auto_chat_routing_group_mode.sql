-- 040_auto_chat_routing_group_mode.sql
-- Adds Group Random Distribution mode ('routing_target_mode' = 'groups') with % deficit balancing
-- using named care groups from settings.chat_care_groups and settings.chat_system_config.group_weights.

CREATE INDEX IF NOT EXISTS idx_chat_conversations_active_group_id
  ON public.chat_conversations ((metadata->>'assigned_group_id'))
  WHERE status = 'active' AND metadata->>'assigned_group_id' IS NOT NULL;

CREATE OR REPLACE FUNCTION private.pick_agent_for_conversation(
  p_conv_id UUID,
  p_brand TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_cfg JSONB;
  v_groups JSONB;
  v_care_groups JSONB;
  v_access JSONB;
  v_weights JSONB;
  v_group_weights JSONB;
  v_target_mode TEXT;
  v_epoch TIMESTAMPTZ := NULL;
  v_now_hhmm TEXT;
  v_start TEXT;
  v_end TEXT;
  v_brand_norm TEXT;
  v_group JSONB := NULL;
  v_group_mode TEXT;
  v_candidate_ids UUID[];
  v_picked_id UUID;
  v_picked_name TEXT;
  v_picked_group_id TEXT;
  v_picked_group_name TEXT;
  v_picked_member_ids JSONB;
  v_rr_index INT;
  v_next_rr_index INT;
  v_shared_limit INT;
  v_shared_ids JSONB;
  v_updated_groups JSONB;
BEGIN
  -- Serialize routing selection per transaction so simultaneous chats never collide
  PERFORM pg_advisory_xact_lock(hashtext('chat_auto_routing_lock'));

  -- 1. Load system config
  SELECT private.try_parse_jsonb(value) INTO v_cfg
  FROM public.settings
  WHERE key = 'chat_system_config'
  LIMIT 1;

  IF v_cfg IS NULL THEN
    RETURN NULL;
  END IF;

  IF COALESCE((v_cfg->>'auto_routing_enabled')::boolean, true) = false THEN
    RETURN NULL;
  END IF;

  -- 2. Check Bangkok working hours restriction if enabled
  IF COALESCE((v_cfg->>'routing_working_hours_only')::boolean, false) = true THEN
    v_now_hhmm := to_char(NOW() AT TIME ZONE 'Asia/Bangkok', 'HH24:MI');
    v_start := COALESCE(NULLIF(v_cfg->>'working_hours_start', ''), '08:30');
    v_end := COALESCE(NULLIF(v_cfg->>'working_hours_end', ''), '18:00');
    IF v_start <= v_end THEN
      IF v_now_hhmm < v_start OR v_now_hhmm > v_end THEN
        RETURN NULL;
      END IF;
    ELSE
      IF v_now_hhmm < v_start AND v_now_hhmm > v_end THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  v_weights := COALESCE(v_cfg->'agent_weights', '{}'::jsonb);
  v_group_weights := COALESCE(v_cfg->'group_weights', '{}'::jsonb);
  v_target_mode := COALESCE(NULLIF(v_cfg->>'routing_target_mode', ''), 'agents');

  IF NULLIF(v_cfg->>'routing_epoch_at', '') ~ '^\d{4}-\d{2}-\d{2}T' THEN
    v_epoch := (v_cfg->>'routing_epoch_at')::timestamptz;
  END IF;

  SELECT COALESCE(private.try_parse_jsonb(value), '[]'::jsonb) INTO v_groups
  FROM public.settings
  WHERE key = 'chat_routing_groups'
  LIMIT 1;
  IF v_groups IS NULL OR jsonb_typeof(v_groups) <> 'array' THEN
    v_groups := '[]'::jsonb;
  END IF;

  SELECT COALESCE(private.try_parse_jsonb(value), '[]'::jsonb) INTO v_access
  FROM public.settings
  WHERE key = 'chat_access_users'
  LIMIT 1;
  IF v_access IS NULL OR jsonb_typeof(v_access) <> 'array' THEN
    v_access := '[]'::jsonb;
  END IF;

  -- 3. Check for matching active brand-level routing override
  v_brand_norm := private.normalize_brand_slug(p_brand);

  SELECT g INTO v_group
  FROM jsonb_array_elements(v_groups) AS g
  WHERE COALESCE((g->>'is_active')::boolean, false) = true
    AND jsonb_typeof(g->'agent_ids') = 'array'
    AND jsonb_array_length(g->'agent_ids') > 0
    AND private.normalize_brand_slug(g->>'brand') = v_brand_norm
  LIMIT 1;

  IF v_group IS NULL THEN
    SELECT g INTO v_group
    FROM jsonb_array_elements(v_groups) AS g
    WHERE COALESCE((g->>'is_active')::boolean, false) = true
      AND jsonb_typeof(g->'agent_ids') = 'array'
      AND jsonb_array_length(g->'agent_ids') > 0
      AND (g->>'brand') = 'all'
    LIMIT 1;
  END IF;

  -- 4A. Explicit routing group rule
  IF v_group IS NOT NULL THEN
    SELECT ARRAY_AGG(u.id ORDER BY elem.ord) INTO v_candidate_ids
    FROM jsonb_array_elements_text(v_group->'agent_ids') WITH ORDINALITY AS elem(val, ord)
    JOIN public.users u
      ON u.id::text = elem.val
    WHERE u.status = 'active'
      AND COALESCE((v_weights -> u.id::text ->> 'is_paused')::boolean, false) = false;

    IF v_candidate_ids IS NULL OR array_length(v_candidate_ids, 1) IS NULL THEN
      RETURN NULL;
    END IF;

    v_group_mode := COALESCE(v_group->>'mode', 'random');

    IF v_group_mode = 'shared' THEN
      SELECT ARRAY_AGG(u_id ORDER BY ord) INTO v_candidate_ids
      FROM unnest(v_candidate_ids) WITH ORDINALITY AS t(u_id, ord)
      WHERE (
        COALESCE((v_weights -> u_id::text ->> 'max_active_chats')::int, 0) = 0
        OR (
          SELECT COUNT(*)
          FROM public.chat_conversations c
          WHERE c.status = 'active'
            AND c.id <> p_conv_id
            AND (
              c.assigned_to = u_id
              OR COALESCE(c.metadata->'assigned_agent_ids', '[]'::jsonb) ? u_id::text
            )
        ) < COALESCE((v_weights -> u_id::text ->> 'max_active_chats')::int, 0)
      );

      IF v_candidate_ids IS NULL OR array_length(v_candidate_ids, 1) IS NULL THEN
        RETURN NULL;
      END IF;

      IF (v_group->>'agents_per_customer') ~ '^\d+$' AND (v_group->>'agents_per_customer')::int > 0 THEN
        v_shared_limit := (v_group->>'agents_per_customer')::int;
        v_candidate_ids := v_candidate_ids[1:LEAST(v_shared_limit, array_length(v_candidate_ids, 1))];
      END IF;

      SELECT jsonb_agg(x::text) INTO v_shared_ids FROM unnest(v_candidate_ids) AS x;

      RETURN jsonb_build_object(
        'agent_id', v_candidate_ids[1]::text,
        'agent_name', 'กลุ่ม: ' || COALESCE(v_group->>'name', ''),
        'assigned_agent_ids', COALESCE(v_shared_ids, '[]'::jsonb),
        'group_id', COALESCE(v_group->>'id', ''),
        'group_name', COALESCE(v_group->>'name', ''),
        'is_shared', true
      );
    END IF;

    IF v_group_mode = 'round_robin' THEN
      SELECT ARRAY_AGG(u_id ORDER BY ord) INTO v_candidate_ids
      FROM unnest(v_candidate_ids) WITH ORDINALITY AS t(u_id, ord)
      WHERE (
        COALESCE((v_weights -> u_id::text ->> 'max_active_chats')::int, 0) = 0
        OR (
          SELECT COUNT(*)
          FROM public.chat_conversations c
          WHERE c.status = 'active'
            AND c.id <> p_conv_id
            AND (
              c.assigned_to = u_id
              OR COALESCE(c.metadata->'assigned_agent_ids', '[]'::jsonb) ? u_id::text
            )
        ) < COALESCE((v_weights -> u_id::text ->> 'max_active_chats')::int, 0)
      );

      IF v_candidate_ids IS NULL OR array_length(v_candidate_ids, 1) IS NULL THEN
        RETURN NULL;
      END IF;

      v_rr_index := COALESCE((v_group->>'last_assigned_index')::int, -1);
      v_next_rr_index := (v_rr_index + 1) % array_length(v_candidate_ids, 1);
      v_picked_id := v_candidate_ids[v_next_rr_index + 1];

      SELECT COALESCE(NULLIF(nickname, ''), NULLIF(first_name, ''), 'แอดมิน') INTO v_picked_name
      FROM public.users WHERE id = v_picked_id;

      SELECT jsonb_agg(
        CASE WHEN (elem->>'id') = (v_group->>'id')
             THEN elem || jsonb_build_object('last_assigned_index', v_next_rr_index)
             ELSE elem
        END
      ) INTO v_updated_groups
      FROM jsonb_array_elements(v_groups) AS elem;

      IF v_updated_groups IS NOT NULL THEN
        UPDATE public.settings
        SET value = v_updated_groups::text
        WHERE key = 'chat_routing_groups';
      END IF;

      RETURN jsonb_build_object(
        'agent_id', v_picked_id::text,
        'agent_name', v_picked_name,
        'assigned_agent_ids', jsonb_build_array(v_picked_id::text),
        'group_id', COALESCE(v_group->>'id', ''),
        'group_name', COALESCE(v_group->>'name', ''),
        'is_shared', false
      );
    END IF;

  -- 4B. Care Group Distribution Mode (Target Percentage Deficit Balancing across ChatCareGroups)
  ELSIF v_target_mode = 'groups' THEN
    SELECT COALESCE(private.try_parse_jsonb(value), '[]'::jsonb) INTO v_care_groups
    FROM public.settings
    WHERE key = 'chat_care_groups'
    LIMIT 1;

    IF v_care_groups IS NULL OR jsonb_typeof(v_care_groups) <> 'array' THEN
      RETURN NULL;
    END IF;

    WITH parsed_groups AS (
      SELECT
        (g->>'id') AS gid,
        COALESCE(NULLIF(trim(g->>'name'), ''), 'กลุ่มแชท') AS gname,
        GREATEST(1, COALESCE((v_group_weights -> (g->>'id') ->> 'weight')::int, 1)) AS weight,
        COALESCE((v_group_weights -> (g->>'id') ->> 'max_active_chats')::int, 0) AS max_active,
        COALESCE((v_group_weights -> (g->>'id') ->> 'is_paused')::boolean, false) AS is_paused,
        (
          SELECT jsonb_agg(u.id::text ORDER BY elem.ord)
          FROM jsonb_array_elements_text(COALESCE(g->'agent_ids', '[]'::jsonb)) WITH ORDINALITY AS elem(val, ord)
          JOIN public.users u
            ON u.id::text = elem.val
          WHERE u.status = 'active'
        ) AS member_ids,
        (
          SELECT COUNT(*)
          FROM public.chat_conversations c
          WHERE c.status = 'active'
            AND c.id <> p_conv_id
            AND c.metadata->>'assigned_group_id' = (g->>'id')
        ) AS active_cnt,
        (
          SELECT COUNT(*)
          FROM public.chat_conversations c
          WHERE c.id <> p_conv_id
            AND c.metadata->>'assigned_group_id' = (g->>'id')
            AND COALESCE((c.metadata->>'auto_routed')::boolean, false) = true
            AND (
              v_epoch IS NULL
              OR COALESCE(
                CASE WHEN (c.metadata->>'assigned_at') ~ '^\d{4}-\d{2}-\d{2}T'
                     THEN (c.metadata->>'assigned_at')::timestamptz
                     ELSE NULL END,
                c.updated_at
              ) >= v_epoch
            )
        ) AS epoch_cnt
      FROM jsonb_array_elements(v_care_groups) AS g
      WHERE NULLIF(g->>'id', '') IS NOT NULL
        AND jsonb_typeof(g->'agent_ids') = 'array'
        AND jsonb_array_length(g->'agent_ids') > 0
    ),
    eligible_groups AS (
      SELECT *
      FROM parsed_groups
      WHERE is_paused = false
        AND member_ids IS NOT NULL
        AND jsonb_array_length(member_ids) > 0
        AND (max_active = 0 OR active_cnt < max_active)
    ),
    group_totals AS (
      SELECT
        GREATEST(1, SUM(weight))::numeric AS total_weight,
        SUM(epoch_cnt)::numeric AS total_epoch_cnt
      FROM eligible_groups
    )
    SELECT
      eg.gid,
      eg.gname,
      eg.member_ids
    INTO v_picked_group_id, v_picked_group_name, v_picked_member_ids
    FROM eligible_groups eg
    CROSS JOIN group_totals gt
    ORDER BY
      ((eg.weight::numeric / gt.total_weight) * (gt.total_epoch_cnt + 1) - eg.epoch_cnt::numeric) DESC,
      (eg.epoch_cnt::numeric / eg.weight::numeric) ASC,
      eg.active_cnt ASC,
      eg.gid ASC
    LIMIT 1;

    IF v_picked_group_id IS NULL OR v_picked_member_ids IS NULL OR jsonb_array_length(v_picked_member_ids) = 0 THEN
      RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
      'agent_id', v_picked_member_ids->>0,
      'agent_name', v_picked_group_name,
      'assigned_agent_ids', v_picked_member_ids,
      'group_id', v_picked_group_id,
      'group_name', v_picked_group_name,
      'is_shared', true
    );

  -- 4C. Individual Agent Pool Mode (Default)
  ELSE
    SELECT ARRAY_AGG(u.id ORDER BY u.created_at ASC, u.id ASC) INTO v_candidate_ids
    FROM public.users u
    WHERE u.status = 'active'
      AND COALESCE((v_weights -> u.id::text ->> 'is_paused')::boolean, false) = false
      AND (
        u.role = 'admin'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_access) AS elem
          WHERE COALESCE((elem->>'is_enabled')::boolean, true) = true
            AND (
              (elem->>'user_id') = u.id::text
              OR (u.auth_id IS NOT NULL AND (elem->>'user_id') = u.auth_id::text)
            )
        )
      );
  END IF;

  IF v_candidate_ids IS NULL OR array_length(v_candidate_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- 5. Target Percentage Deficit Balancing for individual agents
  WITH candidate_stats AS (
    SELECT
      u.id,
      COALESCE(NULLIF(u.nickname, ''), NULLIF(u.first_name, ''), 'แอดมิน') AS display_name,
      GREATEST(1, COALESCE((v_weights -> u.id::text ->> 'weight')::int, 1)) AS weight,
      COALESCE((v_weights -> u.id::text ->> 'max_active_chats')::int, 0) AS max_active,
      (
        SELECT COUNT(*)
        FROM public.chat_conversations c
        WHERE c.status = 'active'
          AND c.id <> p_conv_id
          AND (
            c.assigned_to = u.id
            OR COALESCE(c.metadata->'assigned_agent_ids', '[]'::jsonb) ? u.id::text
          )
      ) AS active_cnt,
      (
        SELECT COUNT(*)
        FROM public.chat_conversations c
        WHERE c.assigned_to = u.id
          AND c.id <> p_conv_id
          AND COALESCE((c.metadata->>'auto_routed')::boolean, false) = true
          AND (
            v_epoch IS NULL
            OR COALESCE(
              CASE WHEN (c.metadata->>'assigned_at') ~ '^\d{4}-\d{2}-\d{2}T'
                   THEN (c.metadata->>'assigned_at')::timestamptz
                   ELSE NULL END,
              c.updated_at
            ) >= v_epoch
          )
      ) AS epoch_cnt
    FROM public.users u
    WHERE u.id = ANY(v_candidate_ids)
      AND u.status = 'active'
  ),
  eligible AS (
    SELECT *
    FROM candidate_stats
    WHERE max_active = 0 OR active_cnt < max_active
  ),
  totals AS (
    SELECT
      GREATEST(1, SUM(weight))::numeric AS total_weight,
      SUM(epoch_cnt)::numeric AS total_epoch_cnt
    FROM eligible
  )
  SELECT
    e.id,
    e.display_name
  INTO v_picked_id, v_picked_name
  FROM eligible e
  CROSS JOIN totals t
  ORDER BY
    ((e.weight::numeric / t.total_weight) * (t.total_epoch_cnt + 1) - e.epoch_cnt::numeric) DESC,
    (e.epoch_cnt::numeric / e.weight::numeric) ASC,
    e.active_cnt ASC,
    e.id ASC
  LIMIT 1;

  IF v_picked_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'agent_id', v_picked_id::text,
    'agent_name', v_picked_name,
    'assigned_agent_ids', jsonb_build_array(v_picked_id::text),
    'group_id', COALESCE(v_group->>'id', ''),
    'group_name', COALESCE(v_group->>'name', ''),
    'is_shared', false
  );
END;
$$;

REVOKE ALL ON FUNCTION private.pick_agent_for_conversation(UUID, TEXT) FROM PUBLIC;
