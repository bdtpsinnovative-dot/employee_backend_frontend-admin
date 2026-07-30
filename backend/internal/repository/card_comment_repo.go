package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/Nattamon123/employee/backend/internal/domain"
)

// ─── CardAssigneeRepo ─────────────────────────────────────────────────────────

type CardAssigneeRepo struct {
	db *sqlx.DB
}

func NewCardAssigneeRepo(db *sqlx.DB) *CardAssigneeRepo {
	return &CardAssigneeRepo{db: db}
}

// ListByCard returns all assignees (with user info) for a card.
func (r *CardAssigneeRepo) ListByCard(ctx context.Context, cardID uuid.UUID) ([]domain.UserSummary, error) {
	var users []domain.UserSummary
	err := r.db.SelectContext(ctx, &users, `
		SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.position
		FROM card_assignees ca
		JOIN users u ON u.id = ca.user_id
		WHERE ca.card_id = $1
		ORDER BY ca.created_at ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	return users, nil
}

// ListByCards returns assignees for multiple cards in a single query.
func (r *CardAssigneeRepo) ListByCards(ctx context.Context, cardIDs []uuid.UUID) (map[uuid.UUID][]domain.UserSummary, error) {
	res := make(map[uuid.UUID][]domain.UserSummary)
	for _, cid := range cardIDs {
		res[cid] = []domain.UserSummary{}
	}
	if len(cardIDs) == 0 {
		return res, nil
	}

	query, args, err := sqlx.In(`
		SELECT ca.card_id, u.id, u.first_name, u.last_name, u.avatar_url, u.position
		FROM card_assignees ca
		JOIN users u ON u.id = ca.user_id
		WHERE ca.card_id IN (?)
		ORDER BY ca.created_at ASC
	`, cardIDs)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)

	type row struct {
		CardID    uuid.UUID `db:"card_id"`
		ID        uuid.UUID `db:"id"`
		FirstName string    `db:"first_name"`
		LastName  string    `db:"last_name"`
		AvatarURL *string   `db:"avatar_url"`
		Position  string    `db:"position"`
	}
	var rows []row
	if err := r.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	for _, row := range rows {
		res[row.CardID] = append(res[row.CardID], domain.UserSummary{
			ID:        row.ID,
			FirstName: row.FirstName,
			LastName:  row.LastName,
			AvatarURL: row.AvatarURL,
			Position:  row.Position,
		})
	}
	return res, nil
}

// SetAssignees replaces all assignees for a card atomically.
func (r *CardAssigneeRepo) SetAssignees(ctx context.Context, cardID uuid.UUID, userIDs []uuid.UUID, assignedBy uuid.UUID) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM card_assignees WHERE card_id = $1`, cardID); err != nil {
		return err
	}

	for _, uid := range userIDs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO card_assignees (card_id, user_id, assigned_by, created_at)
			 VALUES ($1, $2, $3, now())
			 ON CONFLICT (card_id, user_id) DO NOTHING`,
			cardID, uid, assignedBy,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// ─── CardCommentRepo ──────────────────────────────────────────────────────────

type CardCommentRepo struct {
	db *sqlx.DB
}

func NewCardCommentRepo(db *sqlx.DB) *CardCommentRepo {
	return &CardCommentRepo{db: db}
}

// ListByCard returns paginated comments for a card, oldest-first.
// cursor is the created_at of the last seen comment (for forward pagination).
func (r *CardCommentRepo) ListByCard(ctx context.Context, cardID uuid.UUID, cursor *time.Time, limit int) ([]domain.CardComment, error) {
	var rows []struct {
		domain.CardComment
		AuthorFirstName string  `db:"author_first_name"`
		AuthorLastName  string  `db:"author_last_name"`
		AuthorAvatarURL *string `db:"author_avatar_url"`
		AuthorPosition  string  `db:"author_position"`
	}

	q := `
		SELECT
			cc.*,
			u.first_name AS author_first_name,
			u.last_name  AS author_last_name,
			u.avatar_url AS author_avatar_url,
			u.position   AS author_position
		FROM card_comments cc
		JOIN users u ON u.id = cc.author_id
		WHERE cc.card_id = $1
	`
	args := []any{cardID}
	if cursor != nil {
		q += ` AND cc.created_at > $2`
		args = append(args, cursor)
	}
	q += ` ORDER BY cc.created_at ASC LIMIT $` + itoa(len(args)+1)
	args = append(args, limit)

	if err := r.db.SelectContext(ctx, &rows, q, args...); err != nil {
		return nil, err
	}

	comments := make([]domain.CardComment, len(rows))
	for i, row := range rows {
		comments[i] = row.CardComment
		comments[i].Author = &domain.UserSummary{
			ID:        row.CardComment.AuthorID,
			FirstName: row.AuthorFirstName,
			LastName:  row.AuthorLastName,
			AvatarURL: row.AuthorAvatarURL,
			Position:  row.AuthorPosition,
		}
		// Load mentions
		var mentionIDs []uuid.UUID
		if err := r.db.SelectContext(ctx, &mentionIDs,
			`SELECT user_id FROM card_comment_mentions WHERE comment_id = $1`, comments[i].ID,
		); err == nil {
			comments[i].Mentions = mentionIDs
		}
		// Load attachments
		var attachments []domain.CommentAttachment
		if err := r.db.SelectContext(ctx, &attachments,
			`SELECT * FROM card_comment_attachments WHERE comment_id = $1 ORDER BY created_at ASC`, comments[i].ID,
		); err == nil {
			comments[i].Attachments = attachments
		}
	}
	return comments, nil
}

// Create inserts a new comment with mentions and attachments.
func (r *CardCommentRepo) Create(ctx context.Context, comment *domain.CardComment, mentionUserIDs []uuid.UUID, attachments []domain.CommentAttachment) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	deltaBytes, err := json.Marshal(comment.ContentDelta)
	if err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO card_comments (id, card_id, author_id, content_delta, plain_text, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		comment.ID, comment.CardID, comment.AuthorID, string(deltaBytes),
		comment.PlainText, comment.CreatedAt, comment.UpdatedAt,
	); err != nil {
		return err
	}

	for _, uid := range mentionUserIDs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO card_comment_mentions (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			comment.ID, uid,
		); err != nil {
			return err
		}
	}

	for _, a := range attachments {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO card_comment_attachments (id, comment_id, url, name, type, size_bytes, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			a.ID, comment.ID, a.URL, a.Name, a.Type, a.SizeBytes, a.CreatedAt,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Update modifies the content of a comment and marks it as edited.
func (r *CardCommentRepo) Update(ctx context.Context, commentID uuid.UUID, delta json.RawMessage, plainText string, newMentionIDs []uuid.UUID) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`UPDATE card_comments SET content_delta = $1, plain_text = $2, is_edited = true, updated_at = now() WHERE id = $3`,
		string(delta), plainText, commentID,
	); err != nil {
		return err
	}

	// Replace mentions
	if _, err := tx.ExecContext(ctx, `DELETE FROM card_comment_mentions WHERE comment_id = $1`, commentID); err != nil {
		return err
	}
	for _, uid := range newMentionIDs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO card_comment_mentions (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			commentID, uid,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Delete removes a comment (cascade deletes mentions and attachments).
func (r *CardCommentRepo) Delete(ctx context.Context, commentID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM card_comments WHERE id = $1`, commentID)
	return err
}

// GetByID returns a single comment for permission checks.
func (r *CardCommentRepo) GetByID(ctx context.Context, commentID uuid.UUID) (*domain.CardComment, error) {
	var c domain.CardComment
	err := r.db.GetContext(ctx, &c, `SELECT * FROM card_comments WHERE id = $1`, commentID)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// GetTaskIDByCard returns the task_id for a card (via task_lists join).
func (r *CardCommentRepo) GetTaskIDByCard(ctx context.Context, cardID uuid.UUID) (uuid.UUID, error) {
	var taskID uuid.UUID
	err := r.db.GetContext(ctx, &taskID, `
		SELECT tl.task_id FROM task_cards tc
		JOIN task_lists tl ON tl.id = tc.list_id
		WHERE tc.id = $1
	`, cardID)
	return taskID, err
}

func itoa(n int) string {
	return string(rune('0' + n))
}
