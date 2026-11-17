-- ============================================================================
-- Avasa Realty CRM — Indexes, Row-Level Security, Retention & Consent Triggers
-- Migration 002
-- ============================================================================

-- 1. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_leads_assigned_stage ON leads (assigned_to, stage, temperature);
CREATE INDEX IF NOT EXISTS idx_leads_created_at_ist ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_source_city ON leads (source, preferred_city);
CREATE INDEX IF NOT EXISTS idx_leads_project ON leads (project_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads (phone);

CREATE INDEX IF NOT EXISTS idx_properties_filter ON properties (category, transaction_type, status, city);
CREATE INDEX IF NOT EXISTS idx_properties_project ON properties (project_id);

CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations (lead_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_consent_phone_status ON consent (phone, status, channel);

CREATE INDEX IF NOT EXISTS idx_site_visits_schedule ON site_visits (assigned_to, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_followups_due ON follow_ups (assigned_to, status, due_at);
CREATE INDEX IF NOT EXISTS idx_bookings_project_date ON bookings (project_id, booking_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status_due ON payments (status, due_date);
CREATE INDEX IF NOT EXISTS idx_commissions_employee ON commissions (employee_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time ON audit_logs (actor_user_id, created_at DESC);

-- 2. ROW-LEVEL SECURITY (RLS) POLICIES
-- Application sets session GUCs per authenticated API request:
--   SET LOCAL app.current_user_id = '<uuid>';
--   SET LOCAL app.current_user_role = 'sales_exec' | 'sales_manager' | 'admin' | 'finance';

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- Leads: Admin & Sales Manager see all; Sales Exec sees only assigned leads
CREATE POLICY leads_isolation_policy ON leads
  USING (
    current_setting('app.current_user_role', TRUE) IN ('admin', 'sales_manager')
    OR assigned_to::text = current_setting('app.current_user_id', TRUE)
  );

-- Customers (Protected PII): Admin & Finance see all; Sales Exec sees only assigned customers
CREATE POLICY customers_pii_isolation_policy ON customers
  USING (
    current_setting('app.current_user_role', TRUE) IN ('admin', 'sales_manager', 'finance')
    OR assigned_to::text = current_setting('app.current_user_id', TRUE)
  );

-- Conversations: Sales Exec can read/reply only to assigned leads' chats
CREATE POLICY conversations_isolation_policy ON conversations
  USING (
    current_setting('app.current_user_role', TRUE) IN ('admin', 'sales_manager')
    OR assigned_to::text = current_setting('app.current_user_id', TRUE)
  );

-- Commissions: Sales Exec can view only their own commissions
CREATE POLICY commissions_isolation_policy ON commissions
  USING (
    current_setting('app.current_user_role', TRUE) IN ('admin', 'finance')
    OR employee_id::text = current_setting('app.current_user_id', TRUE)
  );

-- 3. AUTOMATIC CONSENT WITHDRAWAL & OPT-OUT ENFORCEMENT TRIGGER
CREATE OR REPLACE FUNCTION enforce_consent_withdrawal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('withdrawn', 'opted_out') AND OLD.status = 'granted' THEN
    NEW.withdrawn_at := COALESCE(NEW.withdrawn_at, NOW());

    -- Immediately pause AI/automated WhatsApp conversations for this phone/lead
    UPDATE conversations
       SET ai_enabled = FALSE,
           status = 'opted_out'
     WHERE wa_phone = NEW.phone
        OR (NEW.lead_id IS NOT NULL AND lead_id = NEW.lead_id);

    -- Cancel any automated follow-ups
    IF NEW.lead_id IS NOT NULL THEN
      UPDATE follow_ups
         SET status = 'cancelled'
       WHERE lead_id = NEW.lead_id
         AND is_automated = TRUE
         AND status = 'pending';
    END IF;

    INSERT INTO audit_logs (action, entity_type, entity_id, details)
    VALUES (
      'CONSENT_WITHDRAWN',
      'consent',
      NEW.id::text,
      jsonb_build_object('phone', NEW.phone, 'channel', NEW.channel, 'new_status', NEW.status)
    );
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consent_withdrawal ON consent;
CREATE TRIGGER trg_consent_withdrawal
  BEFORE UPDATE ON consent
  FOR EACH ROW
  EXECUTE FUNCTION enforce_consent_withdrawal();

-- 4. DATA RETENTION & ANONYMIZATION POLICY (DPDP Act 2023)
-- Anonymizes cold/lost leads past retention_expires_at while preserving financial booking records (8 yrs RERA)
CREATE OR REPLACE FUNCTION purge_expired_cold_leads()
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE leads l
     SET full_name = 'Anonymized Contact',
         phone = CONCAT('ANON-', SUBSTRING(l.id::text, 1, 8)),
         email = NULL,
         ai_summary = 'PII purged per DPDP retention policy'
   WHERE l.retention_expires_at < NOW()
     AND l.stage = 'lost'
     AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id)
     AND l.full_name <> 'Anonymized Contact';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  INSERT INTO audit_logs (action, entity_type, details)
  VALUES ('RETENTION_PURGE_EXECUTED', 'leads', jsonb_build_object('anonymized_count', affected_rows));

  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;
