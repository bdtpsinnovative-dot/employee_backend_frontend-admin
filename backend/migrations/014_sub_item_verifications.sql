-- Migration 014: สร้างตารางเก็บประวัติการตรวจสอบของแต่ละรายการย่อย (Sub-item Verification Rounds)
CREATE TABLE IF NOT EXISTS sub_item_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_item_id UUID NOT NULL REFERENCES task_sub_items(id) ON DELETE CASCADE,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verifier_name TEXT NOT NULL,
    round INT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_item_verifications_sub_item_id ON sub_item_verifications(sub_item_id);
