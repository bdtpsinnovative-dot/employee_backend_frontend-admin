-- 043_chat_deal_orders_repeat_purchase.sql
-- Tracks multiple orders per customer conversation (First-time Won vs Repeat Purchase / ซื้อซ้ำ)
-- and updates get_chat_response_analytics with repeat purchase metrics across Summary, Agents, Teams, and Daily Trend.

-- 1. Child ledger table: 1 conversation (customer) -> 1..N deal orders (New + Repeat Purchases)
CREATE TABLE IF NOT EXISTS public.chat_deal_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  is_repeat BOOLEAN NOT NULL DEFAULT false,
  amount NUMERIC(12, 2) DEFAULT NULL,
  pi_no TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_deal_orders_conv_closed
  ON public.chat_deal_orders(conversation_id, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_deal_orders_closed_by
  ON public.chat_deal_orders(closed_by, closed_at DESC)
  WHERE closed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_deal_orders_repeat
  ON public.chat_deal_orders(is_repeat, closed_at DESC)
  WHERE is_repeat = true;

ALTER TABLE public.chat_deal_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_deal_orders FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_deal_orders TO authenticated;

DROP POLICY IF EXISTS "allow_active_staff_chat_deal_orders" ON public.chat_deal_orders;
CREATE POLICY "allow_active_staff_chat_deal_orders"
ON public.chat_deal_orders
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_id = (SELECT auth.uid())
      AND u.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_id = (SELECT auth.uid())
      AND u.status = 'active'
  )
);

-- 2. Backfill any existing Won conversations into chat_deal_orders once
INSERT INTO public.chat_deal_orders (
  conversation_id,
  is_repeat,
  amount,
  pi_no,
  notes,
  closed_by,
  closed_at
)
SELECT
  c.id,
  false,
  c.deal_amount,
  COALESCE(c.deal_pi_no, ''),
  COALESCE(c.deal_note, ''),
  COALESCE(c.closed_by, c.assigned_to),
  COALESCE(c.closed_at, c.updated_at, NOW())
FROM public.chat_conversations c
WHERE c.deal_status = 'won'
  AND NOT EXISTS (
    SELECT 1 FROM public.chat_deal_orders o WHERE o.conversation_id = c.id
  );

-- 3. Upgrade analytics RPC to aggregate New Won vs Repeat Purchases cleanly
CREATE OR REPLACE FUNCTION public.get_chat_response_analytics(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_brand TEXT DEFAULT 'all'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_brand_norm TEXT;
  v_summary JSONB;
  v_agents JSONB;
  v_convs JSONB;
  v_daily JSONB;
  v_teams JSONB;
BEGIN
  v_brand_norm := CASE
    WHEN p_brand IS NULL OR lower(btrim(p_brand)) IN ('', 'all') THEN ''
    ELSE (
      CASE regexp_replace(lower(COALESCE(trim(p_brand), '')), '[^a-z0-9]', '', 'g')
        WHEN 'terra' THEN 'terrahome'
        WHEN 'terrahome' THEN 'terrahome'
        WHEN 'ember' THEN 'emberandash'
        WHEN 'emberandashliving' THEN 'emberandash'
        WHEN 'emberandash' THEN 'emberandash'
        ELSE regexp_replace(lower(COALESCE(trim(p_brand), '')), '[^a-z0-9]', '', 'g')
      END
    )
  END;

  WITH filtered_convs AS (
    SELECT c.*
    FROM public.chat_conversations c
    WHERE v_brand_norm = ''
       OR (
         CASE regexp_replace(lower(COALESCE(trim(c.brand), '')), '[^a-z0-9]', '', 'g')
           WHEN 'terra' THEN 'terrahome'
           WHEN 'terrahome' THEN 'terrahome'
           WHEN 'ember' THEN 'emberandash'
           WHEN 'emberandashliving' THEN 'emberandash'
           WHEN 'emberandash' THEN 'emberandash'
           ELSE regexp_replace(lower(COALESCE(trim(c.brand), '')), '[^a-z0-9]', '', 'g')
         END
       ) = v_brand_norm
  ),
  ordered_msgs AS (
    SELECT
      m.id,
      m.conversation_id,
      m.sender_type,
      m.sender_id,
      m.sender_name,
      m.metadata,
      m.created_at,
      LAG(m.sender_type) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at ASC, m.id ASC) AS prev_sender_type,
      LAG(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at ASC, m.id ASC) AS prev_created_at
    FROM public.chat_messages m
    JOIN filtered_convs fc ON fc.id = m.conversation_id
  ),
  resolved_agent_msgs AS (
    SELECT
      om.conversation_id,
      om.created_at,
      om.prev_sender_type,
      om.prev_created_at,
      COALESCE(
        CASE WHEN om.sender_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users u0 WHERE u0.id = om.sender_id) THEN om.sender_id END,
        (
          SELECT u1.id
          FROM public.users u1
          WHERE NULLIF(om.metadata->>'sender_id', '') IS NOT NULL
            AND (u1.id::text = (om.metadata->>'sender_id') OR (u1.auth_id IS NOT NULL AND u1.auth_id::text = (om.metadata->>'sender_id')))
          LIMIT 1
        ),
        (
          SELECT u2.id
          FROM public.users u2
          WHERE NULLIF(btrim(om.sender_name), '') IS NOT NULL
            AND btrim(om.sender_name) NOT IN ('แอดมิน', 'AI Bot')
            AND (
              u2.nickname = btrim(om.sender_name)
              OR u2.first_name = btrim(om.sender_name)
              OR btrim(COALESCE(u2.first_name, '') || ' ' || COALESCE(u2.last_name, '')) = btrim(om.sender_name)
            )
          ORDER BY (u2.status = 'active') DESC
          LIMIT 1
        ),
        fc.assigned_to
      ) AS resolved_agent_id
    FROM ordered_msgs om
    JOIN filtered_convs fc ON fc.id = om.conversation_id
    WHERE om.sender_type = 'agent'
      AND (p_from IS NULL OR om.created_at >= p_from)
      AND (p_to IS NULL OR om.created_at <= p_to)
  ),
  response_turns AS (
    SELECT
      resolved_agent_id,
      conversation_id,
      GREATEST(0, EXTRACT(EPOCH FROM (created_at - prev_created_at))) AS response_seconds
    FROM resolved_agent_msgs
    WHERE resolved_agent_id IS NOT NULL
      AND prev_sender_type = 'customer'
      AND prev_created_at IS NOT NULL
      AND created_at >= prev_created_at
  ),
  orders_in_scope AS (
    SELECT
      o.id,
      o.conversation_id,
      o.is_repeat,
      COALESCE(o.amount, 0)::numeric(12, 2) AS amount,
      o.pi_no,
      o.notes,
      COALESCE(o.closed_by, fc.closed_by, fc.assigned_to) AS attributed_agent_id,
      o.closed_at
    FROM public.chat_deal_orders o
    JOIN filtered_convs fc ON fc.id = o.conversation_id
    WHERE (p_from IS NULL OR o.closed_at >= p_from)
      AND (p_to IS NULL OR o.closed_at <= p_to)
  ),
  period_convs AS (
    SELECT fc.*
    FROM filtered_convs fc
    WHERE (
      p_from IS NULL
      OR COALESCE(fc.closed_at, fc.last_message_at, fc.created_at) >= p_from
      OR EXISTS (SELECT 1 FROM resolved_agent_msgs ram WHERE ram.conversation_id = fc.id)
      OR EXISTS (SELECT 1 FROM orders_in_scope ois WHERE ois.conversation_id = fc.id)
    )
    AND (
      p_to IS NULL
      OR fc.created_at <= p_to
    )
  ),
  qa_in_scope AS (
    SELECT q.*
    FROM public.chat_qa_reviews q
    JOIN period_convs pc ON pc.id = q.conversation_id
  ),
  agent_msg_stats AS (
    SELECT
      resolved_agent_id AS agent_id,
      COUNT(*)::int AS msg_count,
      COUNT(DISTINCT conversation_id)::int AS replied_conv_count
    FROM resolved_agent_msgs
    WHERE resolved_agent_id IS NOT NULL
    GROUP BY resolved_agent_id
  ),
  agent_speed_stats AS (
    SELECT
      resolved_agent_id AS agent_id,
      COUNT(*)::int AS reply_turns,
      ROUND((AVG(response_seconds) / 60.0)::numeric, 1) AS avg_reply_minutes,
      ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_seconds) / 60.0)::numeric, 1) AS median_reply_minutes,
      ROUND((COUNT(*) FILTER (WHERE response_seconds <= 900) * 100.0 / NULLIF(COUNT(*), 0))::numeric, 1) AS sla_15m_pct
    FROM response_turns
    GROUP BY resolved_agent_id
  ),
  agent_order_stats AS (
    SELECT
      attributed_agent_id AS agent_id,
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (WHERE NOT is_repeat)::int AS new_won_count,
      COUNT(*) FILTER (WHERE is_repeat)::int AS repeat_won_count,
      COALESCE(SUM(amount), 0)::numeric(12, 2) AS won_amount,
      COALESCE(SUM(amount) FILTER (WHERE is_repeat), 0)::numeric(12, 2) AS repeat_won_amount
    FROM orders_in_scope
    WHERE attributed_agent_id IS NOT NULL
    GROUP BY attributed_agent_id
  ),
  agent_conv_deal_stats AS (
    SELECT
      COALESCE(pc.closed_by, pc.assigned_to) AS agent_id,
      COUNT(*) FILTER (WHERE pc.deal_status = 'won' OR EXISTS (SELECT 1 FROM orders_in_scope ois WHERE ois.conversation_id = pc.id))::int AS won_conv_count,
      COUNT(*) FILTER (WHERE pc.deal_status = 'lost')::int AS lost_count,
      COUNT(*) FILTER (WHERE pc.status = 'resolved')::int AS resolved_count
    FROM period_convs pc
    WHERE COALESCE(pc.closed_by, pc.assigned_to) IS NOT NULL
    GROUP BY COALESCE(pc.closed_by, pc.assigned_to)
  ),
  agent_assigned_stats AS (
    SELECT
      u.id AS agent_id,
      COUNT(DISTINCT pc.id)::int AS assigned_conv_count
    FROM public.users u
    JOIN period_convs pc
      ON pc.assigned_to = u.id
      OR COALESCE(pc.metadata->'assigned_agent_ids', '[]'::jsonb) ? u.id::text
    GROUP BY u.id
  ),
  agent_qa_stats AS (
    SELECT
      q.agent_id,
      COUNT(*)::int AS qa_count,
      ROUND(AVG(q.politeness_score)::numeric, 1) AS avg_politeness,
      ROUND(AVG(q.accuracy_score)::numeric, 1) AS avg_accuracy,
      ROUND(AVG(COALESCE(q.overall_score, ROUND(((COALESCE(q.politeness_score, 0) + COALESCE(q.accuracy_score, 0)) / 2.0)::numeric)))::numeric, 1) AS avg_overall_qa
    FROM qa_in_scope q
    GROUP BY q.agent_id
  ),
  total_team AS (
    SELECT
      GREATEST(0, COALESCE(SUM(msg_count), 0))::int AS total_msgs
    FROM agent_msg_stats
  ),
  involved_agents AS (
    SELECT agent_id FROM agent_msg_stats
    UNION
    SELECT agent_id FROM agent_order_stats
    UNION
    SELECT agent_id FROM agent_conv_deal_stats
    UNION
    SELECT agent_id FROM agent_assigned_stats
    UNION
    SELECT agent_id FROM agent_qa_stats
  ),
  care_groups_raw AS (
    SELECT
      g->>'id' AS group_id,
      COALESCE(NULLIF(btrim(g->>'name'), ''), 'กลุ่มดูแลไม่มีชื่อ') AS group_name,
      COALESCE(g->'agent_ids', '[]'::jsonb) AS agent_ids,
      COALESCE(g->'customer_ids', '[]'::jsonb) AS customer_ids,
      COALESCE((g->>'is_auto')::boolean, false) AS is_auto
    FROM public.settings s,
    LATERAL jsonb_array_elements(
      CASE
        WHEN left(btrim(COALESCE(s.value, '')), 1) = '[' THEN s.value::jsonb
        ELSE '[]'::jsonb
      END
    ) AS g
    WHERE s.key = 'chat_care_groups'
  ),
  conv_team_map AS (
    SELECT
      pc.id AS conversation_id,
      COALESCE(
        cg_match.group_id,
        CASE WHEN NULLIF(btrim(pc.metadata->>'assigned_group_name'), '') IS NOT NULL
          THEN 'named_' || md5(btrim(pc.metadata->>'assigned_group_name'))
        END,
        CASE WHEN jsonb_typeof(pc.metadata->'assigned_agent_ids') = 'array'
              AND jsonb_array_length(pc.metadata->'assigned_agent_ids') > 1
          THEN 'auto_' || COALESCE((
            SELECT string_agg(elem, '_' ORDER BY elem)
            FROM jsonb_array_elements_text(pc.metadata->'assigned_agent_ids') AS elem
          ), pc.id::text)
        END,
        CASE WHEN pc.assigned_to IS NOT NULL THEN 'solo_care' ELSE 'unassigned_pool' END
      ) AS team_id,
      COALESCE(
        cg_match.group_name,
        NULLIF(btrim(pc.metadata->>'assigned_group_name'), ''),
        CASE WHEN jsonb_typeof(pc.metadata->'assigned_agent_ids') = 'array'
              AND jsonb_array_length(pc.metadata->'assigned_agent_ids') > 1
          THEN 'ทีมดูแลร่วม (' || jsonb_array_length(pc.metadata->'assigned_agent_ids')::text || ' คน)'
        END,
        CASE WHEN pc.assigned_to IS NOT NULL THEN 'ดูแลเดี่ยว (1 ต่อ 1)' ELSE 'ยังไม่มอบหมายทีม' END
      ) AS team_name,
      COALESCE(
        cg_match.team_type,
        CASE WHEN NULLIF(btrim(pc.metadata->>'assigned_group_name'), '') IS NOT NULL THEN 'care_group'
             WHEN jsonb_typeof(pc.metadata->'assigned_agent_ids') = 'array'
              AND jsonb_array_length(pc.metadata->'assigned_agent_ids') > 1 THEN 'auto_team'
             WHEN pc.assigned_to IS NOT NULL THEN 'solo'
             ELSE 'unassigned'
        END
      ) AS team_type,
      COALESCE(
        cg_match.agent_ids,
        CASE WHEN jsonb_typeof(pc.metadata->'assigned_agent_ids') = 'array'
          THEN pc.metadata->'assigned_agent_ids'
          WHEN pc.assigned_to IS NOT NULL THEN jsonb_build_array(pc.assigned_to::text)
          ELSE '[]'::jsonb
        END
      ) AS member_ids
    FROM period_convs pc
    LEFT JOIN LATERAL (
      SELECT
        cg.group_id,
        cg.group_name,
        CASE WHEN cg.is_auto THEN 'auto_team' ELSE 'care_group' END AS team_type,
        cg.agent_ids
      FROM care_groups_raw cg
      WHERE cg.group_id = NULLIF(pc.metadata->>'assigned_group_id', '')
         OR cg.customer_ids ? pc.id::text
      ORDER BY (cg.group_id = NULLIF(pc.metadata->>'assigned_group_id', '')) DESC
      LIMIT 1
    ) cg_match ON true
  ),
  all_team_defs AS (
    SELECT
      cg.group_id AS team_id,
      cg.group_name AS team_name,
      CASE WHEN cg.is_auto THEN 'auto_team' ELSE 'care_group' END AS team_type,
      cg.agent_ids AS member_ids
    FROM care_groups_raw cg
    UNION
    SELECT DISTINCT ON (ctm.team_id)
      ctm.team_id,
      ctm.team_name,
      ctm.team_type,
      ctm.member_ids
    FROM conv_team_map ctm
    WHERE NOT EXISTS (SELECT 1 FROM care_groups_raw cg WHERE cg.group_id = ctm.team_id)
  ),
  team_conv_stats AS (
    SELECT
      ctm.team_id,
      COUNT(*)::int AS conv_count,
      COUNT(*) FILTER (WHERE pc.status = 'resolved')::int AS resolved_count,
      COUNT(*) FILTER (WHERE pc.deal_status = 'won' OR EXISTS (SELECT 1 FROM orders_in_scope ois WHERE ois.conversation_id = pc.id))::int AS won_conv_count,
      COUNT(*) FILTER (WHERE pc.deal_status = 'lost')::int AS lost_count
    FROM conv_team_map ctm
    JOIN period_convs pc ON pc.id = ctm.conversation_id
    GROUP BY ctm.team_id
  ),
  team_order_stats AS (
    SELECT
      ctm.team_id,
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (WHERE NOT ois.is_repeat)::int AS new_won_count,
      COUNT(*) FILTER (WHERE ois.is_repeat)::int AS repeat_won_count,
      COALESCE(SUM(ois.amount), 0)::numeric(12, 2) AS won_amount,
      COALESCE(SUM(ois.amount) FILTER (WHERE ois.is_repeat), 0)::numeric(12, 2) AS repeat_won_amount
    FROM orders_in_scope ois
    JOIN conv_team_map ctm ON ctm.conversation_id = ois.conversation_id
    GROUP BY ctm.team_id
  ),
  team_msg_stats AS (
    SELECT
      ctm.team_id,
      COUNT(*)::int AS msg_count,
      COUNT(DISTINCT ram.conversation_id)::int AS replied_conv_count
    FROM resolved_agent_msgs ram
    JOIN conv_team_map ctm ON ctm.conversation_id = ram.conversation_id
    GROUP BY ctm.team_id
  ),
  team_speed_stats AS (
    SELECT
      ctm.team_id,
      COUNT(*)::int AS reply_turns,
      ROUND((AVG(rt.response_seconds) / 60.0)::numeric, 1) AS avg_reply_minutes,
      ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rt.response_seconds) / 60.0)::numeric, 1) AS median_reply_minutes,
      ROUND((COUNT(*) FILTER (WHERE rt.response_seconds <= 900) * 100.0 / NULLIF(COUNT(*), 0))::numeric, 1) AS sla_15m_pct
    FROM response_turns rt
    JOIN conv_team_map ctm ON ctm.conversation_id = rt.conversation_id
    GROUP BY ctm.team_id
  ),
  team_qa_stats AS (
    SELECT
      ctm.team_id,
      COUNT(*)::int AS qa_count,
      ROUND(AVG(q.politeness_score)::numeric, 1) AS avg_politeness,
      ROUND(AVG(q.accuracy_score)::numeric, 1) AS avg_accuracy,
      ROUND(AVG(COALESCE(q.overall_score, ROUND(((COALESCE(q.politeness_score, 0) + COALESCE(q.accuracy_score, 0)) / 2.0)::numeric)))::numeric, 1) AS avg_overall_qa
    FROM qa_in_scope q
    JOIN conv_team_map ctm ON ctm.conversation_id = q.conversation_id
    GROUP BY ctm.team_id
  ),
  team_dynamic_members AS (
    SELECT
      ctm.team_id,
      COALESCE(jsonb_agg(DISTINCT mid), '[]'::jsonb) AS member_ids
    FROM conv_team_map ctm
    JOIN period_convs pc ON pc.id = ctm.conversation_id
    CROSS JOIN LATERAL (
      SELECT pc.assigned_to::text AS mid WHERE pc.assigned_to IS NOT NULL
      UNION
      SELECT ram.resolved_agent_id::text AS mid
      FROM resolved_agent_msgs ram
      WHERE ram.conversation_id = pc.id AND ram.resolved_agent_id IS NOT NULL
    ) m
    GROUP BY ctm.team_id
  )
  SELECT
    jsonb_build_object(
      'total_conversations', (SELECT COUNT(*)::int FROM period_convs),
      'resolved_conversations', (SELECT COUNT(*)::int FROM period_convs WHERE status = 'resolved'),
      'won_conversations', (SELECT COUNT(DISTINCT pc.id)::int FROM period_convs pc WHERE pc.deal_status = 'won' OR EXISTS (SELECT 1 FROM orders_in_scope ois WHERE ois.conversation_id = pc.id)),
      'lost_conversations', (SELECT COUNT(*)::int FROM period_convs WHERE deal_status = 'lost'),
      'open_conversations', (SELECT COUNT(*)::int FROM period_convs WHERE deal_status = 'open'),
      'total_won_orders', (SELECT COUNT(*)::int FROM orders_in_scope),
      'new_won_orders', (SELECT COUNT(*) FILTER (WHERE NOT is_repeat)::int FROM orders_in_scope),
      'repeat_won_orders', (SELECT COUNT(*) FILTER (WHERE is_repeat)::int FROM orders_in_scope),
      'repeat_customer_count', (SELECT COUNT(DISTINCT conversation_id) FILTER (WHERE is_repeat)::int FROM orders_in_scope),
      'new_won_amount', (SELECT COALESCE(SUM(amount) FILTER (WHERE NOT is_repeat), 0)::numeric(12, 2) FROM orders_in_scope),
      'repeat_won_amount', (SELECT COALESCE(SUM(amount) FILTER (WHERE is_repeat), 0)::numeric(12, 2) FROM orders_in_scope),
      'total_won_amount', (SELECT COALESCE(SUM(amount), 0)::numeric(12, 2) FROM orders_in_scope),
      'total_agent_messages', (SELECT total_msgs FROM total_team),
      'median_reply_minutes', (SELECT ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_seconds) / 60.0)::numeric, 1) FROM response_turns),
      'avg_reply_minutes', (SELECT ROUND((AVG(response_seconds) / 60.0)::numeric, 1) FROM response_turns),
      'sla_15m_pct', (SELECT ROUND((COUNT(*) FILTER (WHERE response_seconds <= 900) * 100.0 / NULLIF(COUNT(*), 0))::numeric, 1) FROM response_turns),
      'qa_reviewed_count', (SELECT COUNT(*)::int FROM qa_in_scope)
    ),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'agent_id', u.id,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'nickname', u.nickname,
          'avatar_url', u.avatar_url,
          'role', u.role,
          'status', u.status,
          'msg_count', COALESCE(ams.msg_count, 0),
          'reply_share_pct', COALESCE(ROUND((COALESCE(ams.msg_count, 0) * 100.0 / NULLIF(tt.total_msgs, 0))::numeric, 1), 0),
          'replied_conv_count', COALESCE(ams.replied_conv_count, 0),
          'assigned_conv_count', COALESCE(aas.assigned_conv_count, 0),
          'reply_turns', COALESCE(ass.reply_turns, 0),
          'avg_reply_minutes', ass.avg_reply_minutes,
          'median_reply_minutes', ass.median_reply_minutes,
          'sla_15m_pct', ass.sla_15m_pct,
          'won_count', GREATEST(COALESCE(aos.total_orders, 0), COALESCE(acds.won_conv_count, 0)),
          'new_won_count', COALESCE(aos.new_won_count, 0),
          'repeat_won_count', COALESCE(aos.repeat_won_count, 0),
          'repeat_won_amount', COALESCE(aos.repeat_won_amount, 0),
          'lost_count', COALESCE(acds.lost_count, 0),
          'resolved_count', COALESCE(acds.resolved_count, 0),
          'won_amount', COALESCE(aos.won_amount, 0),
          'win_rate_pct', ROUND((COALESCE(acds.won_conv_count, 0) * 100.0 / NULLIF(COALESCE(acds.won_conv_count, 0) + COALESCE(acds.lost_count, 0), 0))::numeric, 1),
          'qa_count', COALESCE(aqs.qa_count, 0),
          'avg_politeness', aqs.avg_politeness,
          'avg_accuracy', aqs.avg_accuracy,
          'avg_overall_qa', aqs.avg_overall_qa
        )
        ORDER BY (u.role = 'admin') ASC, COALESCE(ams.msg_count, 0) DESC, COALESCE(aos.total_orders, 0) DESC, u.first_name ASC
      )
      FROM involved_agents ia
      JOIN public.users u ON u.id = ia.agent_id
      CROSS JOIN total_team tt
      LEFT JOIN agent_msg_stats ams ON ams.agent_id = u.id
      LEFT JOIN agent_speed_stats ass ON ass.agent_id = u.id
      LEFT JOIN agent_order_stats aos ON aos.agent_id = u.id
      LEFT JOIN agent_conv_deal_stats acds ON acds.agent_id = u.id
      LEFT JOIN agent_assigned_stats aas ON aas.agent_id = u.id
      LEFT JOIN agent_qa_stats aqs ON aqs.agent_id = u.id
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(conv_row ORDER BY conv_sort DESC)
      FROM (
        SELECT
          COALESCE(pc.closed_at, pc.last_message_at, pc.created_at) AS conv_sort,
          jsonb_build_object(
            'id', pc.id,
            'platform', pc.platform,
            'brand', pc.brand,
            'customer_name', pc.customer_name,
            'customer_avatar', pc.customer_avatar,
            'last_message', pc.last_message,
            'last_message_at', pc.last_message_at,
            'status', pc.status,
            'deal_status', pc.deal_status,
            'deal_amount', pc.deal_amount,
            'deal_pi_no', pc.deal_pi_no,
            'deal_note', pc.deal_note,
            'assigned_to', pc.assigned_to,
            'closed_by', pc.closed_by,
            'closed_at', pc.closed_at,
            'team_id', ctm.team_id,
            'team_name', ctm.team_name,
            'won_order_count', COALESCE((SELECT COUNT(*)::int FROM public.chat_deal_orders do_all WHERE do_all.conversation_id = pc.id), 0),
            'repeat_won_count', COALESCE((SELECT COUNT(*) FILTER (WHERE do_all.is_repeat)::int FROM public.chat_deal_orders do_all WHERE do_all.conversation_id = pc.id), 0),
            'deal_orders', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', do_all.id,
                  'conversation_id', do_all.conversation_id,
                  'is_repeat', do_all.is_repeat,
                  'amount', do_all.amount,
                  'pi_no', do_all.pi_no,
                  'notes', do_all.notes,
                  'closed_by', do_all.closed_by,
                  'closed_at', do_all.closed_at
                )
                ORDER BY do_all.closed_at ASC, do_all.created_at ASC
              )
              FROM public.chat_deal_orders do_all
              WHERE do_all.conversation_id = pc.id
            ), '[]'::jsonb),
            'msg_count', COALESCE((SELECT COUNT(*)::int FROM public.chat_messages cm WHERE cm.conversation_id = pc.id), 0),
            'responder_ids', COALESCE((
              SELECT jsonb_agg(DISTINCT ram.resolved_agent_id)
              FROM resolved_agent_msgs ram
              WHERE ram.conversation_id = pc.id
                AND ram.resolved_agent_id IS NOT NULL
            ), '[]'::jsonb),
            'median_reply_minutes', (
              SELECT ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rt.response_seconds) / 60.0)::numeric, 1)
              FROM response_turns rt
              WHERE rt.conversation_id = pc.id
            ),
            'qa_reviews', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', qr.id,
                  'agent_id', qr.agent_id,
                  'reviewer_id', qr.reviewer_id,
                  'source', qr.source,
                  'politeness_score', qr.politeness_score,
                  'accuracy_score', qr.accuracy_score,
                  'overall_score', qr.overall_score,
                  'notes', qr.notes,
                  'updated_at', qr.updated_at
                )
              )
              FROM public.chat_qa_reviews qr
              WHERE qr.conversation_id = pc.id
            ), '[]'::jsonb)
          ) AS conv_row
        FROM period_convs pc
        LEFT JOIN conv_team_map ctm ON ctm.conversation_id = pc.id
        ORDER BY COALESCE(pc.closed_at, pc.last_message_at, pc.created_at) DESC
        LIMIT 250
      ) sub
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'day', to_char(d.day, 'YYYY-MM-DD'),
          'conv_count', d.conv_count,
          'won_count', d.won_count,
          'repeat_won_count', d.repeat_won_count,
          'lost_count', d.lost_count,
          'msg_count', d.msg_count
        )
        ORDER BY d.day ASC
      )
      FROM (
        SELECT
          day,
          SUM(conv_count)::int AS conv_count,
          SUM(won_count)::int AS won_count,
          SUM(repeat_won_count)::int AS repeat_won_count,
          SUM(lost_count)::int AS lost_count,
          SUM(msg_count)::int AS msg_count
        FROM (
          SELECT
            (COALESCE(pc.last_message_at, pc.created_at) AT TIME ZONE 'Asia/Bangkok')::date AS day,
            COUNT(*)::int AS conv_count,
            0::int AS won_count,
            0::int AS repeat_won_count,
            COUNT(*) FILTER (WHERE pc.deal_status = 'lost')::int AS lost_count,
            0::int AS msg_count
          FROM period_convs pc
          GROUP BY 1
          UNION ALL
          SELECT
            (ois.closed_at AT TIME ZONE 'Asia/Bangkok')::date AS day,
            0::int AS conv_count,
            COUNT(*)::int AS won_count,
            COUNT(*) FILTER (WHERE ois.is_repeat)::int AS repeat_won_count,
            0::int AS lost_count,
            0::int AS msg_count
          FROM orders_in_scope ois
          GROUP BY 1
          UNION ALL
          SELECT
            (ram.created_at AT TIME ZONE 'Asia/Bangkok')::date AS day,
            0::int AS conv_count,
            0::int AS won_count,
            0::int AS repeat_won_count,
            0::int AS lost_count,
            COUNT(*)::int AS msg_count
          FROM resolved_agent_msgs ram
          GROUP BY 1
        ) combined_days
        GROUP BY day
        ORDER BY day DESC
        LIMIT 31
      ) d
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'team_id', atd.team_id,
          'team_name', atd.team_name,
          'team_type', atd.team_type,
          'member_ids', CASE
            WHEN jsonb_typeof(atd.member_ids) = 'array' AND jsonb_array_length(atd.member_ids) > 0 THEN atd.member_ids
            ELSE COALESCE(tdm.member_ids, '[]'::jsonb)
          END,
          'conv_count', COALESCE(tcs.conv_count, 0),
          'resolved_count', COALESCE(tcs.resolved_count, 0),
          'won_count', GREATEST(COALESCE(tos.total_orders, 0), COALESCE(tcs.won_conv_count, 0)),
          'new_won_count', COALESCE(tos.new_won_count, 0),
          'repeat_won_count', COALESCE(tos.repeat_won_count, 0),
          'repeat_won_amount', COALESCE(tos.repeat_won_amount, 0),
          'lost_count', COALESCE(tcs.lost_count, 0),
          'won_amount', COALESCE(tos.won_amount, 0),
          'win_rate_pct', ROUND((COALESCE(tcs.won_conv_count, 0) * 100.0 / NULLIF(COALESCE(tcs.won_conv_count, 0) + COALESCE(tcs.lost_count, 0), 0))::numeric, 1),
          'msg_count', COALESCE(tms.msg_count, 0),
          'replied_conv_count', COALESCE(tms.replied_conv_count, 0),
          'reply_share_pct', COALESCE(ROUND((COALESCE(tms.msg_count, 0) * 100.0 / NULLIF((SELECT SUM(t_all.msg_count) FROM team_msg_stats t_all), 0))::numeric, 1), 0),
          'reply_turns', COALESCE(tss.reply_turns, 0),
          'avg_reply_minutes', tss.avg_reply_minutes,
          'median_reply_minutes', tss.median_reply_minutes,
          'sla_15m_pct', tss.sla_15m_pct,
          'qa_count', COALESCE(tqs.qa_count, 0),
          'avg_politeness', tqs.avg_politeness,
          'avg_accuracy', tqs.avg_accuracy,
          'avg_overall_qa', tqs.avg_overall_qa
        )
        ORDER BY (atd.team_type = 'unassigned') ASC, (atd.team_type = 'solo') ASC, COALESCE(tcs.conv_count, 0) DESC, atd.team_name ASC
      )
      FROM all_team_defs atd
      LEFT JOIN team_conv_stats tcs ON tcs.team_id = atd.team_id
      LEFT JOIN team_order_stats tos ON tos.team_id = atd.team_id
      LEFT JOIN team_msg_stats tms ON tms.team_id = atd.team_id
      LEFT JOIN team_speed_stats tss ON tss.team_id = atd.team_id
      LEFT JOIN team_qa_stats tqs ON tqs.team_id = atd.team_id
      LEFT JOIN team_dynamic_members tdm ON tdm.team_id = atd.team_id
    ), '[]'::jsonb)
  INTO v_summary, v_agents, v_convs, v_daily, v_teams;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'agents', v_agents,
    'conversations', v_convs,
    'daily_trend', v_daily,
    'teams', v_teams
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_response_analytics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_response_analytics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
