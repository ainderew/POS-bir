-- 008_credit_dashboard.sql

CREATE TABLE IF NOT EXISTS collection_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) NOT NULL,
    user_id UUID REFERENCES users(id), -- Who made the note (if available)
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    pos_id UUID,
    is_synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_collection_logs_customer ON collection_logs(customer_id, created_at DESC);
