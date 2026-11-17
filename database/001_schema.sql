-- ============================================================================
-- Avasa Realty CRM — PostgreSQL 16 Production Schema (Migration 001)
-- Target Market: India | Currency: INR (₹) | Timezone: Asia/Kolkata (IST)
-- Compliance: DPDP Act 2023 (Consent & Opt-out), RERA Financial Audit Trail
-- ============================================================================

SET timezone = 'Asia/Kolkata';

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ROLES
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE, -- 'admin', 'sales_manager', 'sales_exec', 'finance'
  name VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PERMISSIONS
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE, -- e.g. 'leads:read_all', 'customers:read_pii', 'reports:export'
  module VARCHAR(40) NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- 3. USERS (Employees & Admins: 5-15 sales team capacity)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id INTEGER NOT NULL REFERENCES roles(id),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL,
  password_hash TEXT NOT NULL,
  city VARCHAR(60) NOT NULL DEFAULT 'Bengaluru',
  monthly_target_inr NUMERIC(14, 2) NOT NULL DEFAULT 25000000.00,
  commission_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 1.50,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PROJECTS (Real Estate Development Projects)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  developer_name VARCHAR(140) NOT NULL,
  rera_id VARCHAR(80) NOT NULL UNIQUE,
  project_type VARCHAR(40) NOT NULL CHECK (project_type IN ('residential', 'commercial', 'plotted_development', 'mixed_use')),
  city VARCHAR(60) NOT NULL,
  micro_market VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  total_units INTEGER NOT NULL CHECK (total_units > 0),
  available_units INTEGER NOT NULL CHECK (available_units >= 0),
  base_price_min_inr NUMERIC(14, 2) NOT NULL,
  base_price_max_inr NUMERIC(14, 2) NOT NULL,
  possession_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('pre_launch', 'under_construction', 'ready_to_move', 'sold_out')),
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PROPERTIES (Apartments, Villas, Plots/Land, Commercial, Rental, Resale)
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  unit_code VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(32) NOT NULL CHECK (category IN ('residential', 'commercial', 'plot_land', 'villa', 'apartment')),
  transaction_type VARCHAR(24) NOT NULL CHECK (transaction_type IN ('primary_sale', 'resale', 'rental')),
  city VARCHAR(60) NOT NULL,
  locality VARCHAR(100) NOT NULL,
  configuration VARCHAR(40) NOT NULL, -- '3 BHK', '4 BHK Villa', '2400 sq.ft Plot', 'Grade-A Office'
  carpet_area_sqft INTEGER NOT NULL CHECK (carpet_area_sqft > 0),
  super_builtup_sqft INTEGER NOT NULL CHECK (super_builtup_sqft >= carpet_area_sqft),
  facing VARCHAR(24) NOT NULL DEFAULT 'East',
  floor_number INTEGER,
  price_inr NUMERIC(14, 2) NOT NULL CHECK (price_inr > 0),
  monthly_rent_inr NUMERIC(12, 2), -- populated for rental properties
  security_deposit_inr NUMERIC(12, 2),
  furnishing VARCHAR(24) NOT NULL DEFAULT 'unfurnished' CHECK (furnishing IN ('unfurnished', 'semi_furnished', 'fully_furnished')),
  status VARCHAR(24) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'booked', 'sold', 'rented')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. LEADS (100-500 leads/month pipeline)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(160),
  preferred_language VARCHAR(32) NOT NULL DEFAULT 'en',
  source VARCHAR(40) NOT NULL CHECK (source IN ('whatsapp', 'website', 'magicbricks', '99acres', 'housing_com', 'meta_ads', 'google_ads', 'referral', 'walk_in')),
  temperature VARCHAR(16) NOT NULL DEFAULT 'warm' CHECK (temperature IN ('hot', 'warm', 'cold')),
  stage VARCHAR(32) NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visit_done', 'negotiation', 'booked', 'lost')),
  interested_category VARCHAR(32) NOT NULL CHECK (interested_category IN ('residential', 'commercial', 'plot_land', 'villa', 'apartment')),
  transaction_intent VARCHAR(24) NOT NULL DEFAULT 'primary_sale' CHECK (transaction_intent IN ('primary_sale', 'resale', 'rental')),
  preferred_city VARCHAR(60) NOT NULL,
  preferred_locality VARCHAR(100),
  budget_min_inr NUMERIC(14, 2) NOT NULL,
  budget_max_inr NUMERIC(14, 2) NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  ai_summary TEXT,
  last_contacted_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '365 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. CUSTOMERS (Converted buyers / tenants with protected PII)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID UNIQUE REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(160) NOT NULL,
  pan_masked VARCHAR(16), -- Stored masked e.g. 'ABCDE****F'
  city VARCHAR(60) NOT NULL,
  correspondence_address TEXT NOT NULL,
  kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. CONSENT (DPDP Act 2023 & WhatsApp Opt-in/Opt-out Ledger)
CREATE TABLE IF NOT EXISTS consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email', 'voice')),
  purpose VARCHAR(60) NOT NULL CHECK (purpose IN ('sales_followup', 'marketing_campaigns', 'ai_chatbot', 'kyc_processing')),
  status VARCHAR(24) NOT NULL CHECK (status IN ('granted', 'withdrawn', 'opted_out')),
  source_proof TEXT NOT NULL,
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (lead_id IS NOT NULL OR customer_id IS NOT NULL)
);

-- 9. CONVERSATIONS (WhatsApp Business & Web AI Chat Sessions)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  channel VARCHAR(24) NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'web_chat')),
  wa_phone VARCHAR(20) NOT NULL,
  detected_language VARCHAR(32) NOT NULL DEFAULT 'en',
  ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handed_over', 'closed', 'opted_out')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. MESSAGES (Inbound / Outbound WhatsApp & Gemini AI Responses)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type VARCHAR(16) NOT NULL CHECK (sender_type IN ('customer', 'ai_bot', 'employee')),
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  language_code VARCHAR(16) NOT NULL DEFAULT 'en',
  wa_message_id VARCHAR(120),
  delivery_status VARCHAR(24) NOT NULL DEFAULT 'delivered' CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'blocked_opt_out', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. SITE VISITS
CREATE TABLE IF NOT EXISTS site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(24) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'rescheduled', 'cancelled', 'no_show')),
  pickup_required BOOLEAN NOT NULL DEFAULT FALSE,
  feedback TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code VARCHAR(32) NOT NULL UNIQUE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  closed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  agreement_value_inr NUMERIC(14, 2) NOT NULL CHECK (agreement_value_inr > 0),
  gst_amount_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_payable_inr NUMERIC(14, 2) NOT NULL CHECK (total_payable_inr >= agreement_value_inr),
  booking_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(24) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending_token', 'confirmed', 'registered', 'cancelled')),
  retention_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '8 years'), -- RERA / Tax retention
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  milestone_name VARCHAR(80) NOT NULL,
  amount_inr NUMERIC(14, 2) NOT NULL CHECK (amount_inr > 0),
  due_date DATE NOT NULL,
  paid_date DATE,
  payment_mode VARCHAR(32) CHECK (payment_mode IN ('neft_rtgs', 'upi', 'cheque', 'demand_draft', 'home_loan_disbursement')),
  utr_reference VARCHAR(80),
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. COMMISSIONS
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  commission_rate_pct NUMERIC(5, 2) NOT NULL,
  gross_amount_inr NUMERIC(14, 2) NOT NULL,
  tds_deducted_inr NUMERIC(14, 2) NOT NULL, -- 5% Sec 194H TDS India
  net_payable_inr NUMERIC(14, 2) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'clawback')),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. FOLLOW-UPS
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('call', 'whatsapp', 'email', 'in_person')),
  due_at TIMESTAMPTZ NOT NULL,
  notes TEXT NOT NULL,
  is_automated BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. CAMPAIGNS (Marketing Automation)
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(140) NOT NULL,
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
  target_temperature VARCHAR(16) CHECK (target_temperature IN ('all', 'hot', 'warm', 'cold')),
  target_city VARCHAR(60),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  template_message TEXT NOT NULL,
  language_code VARCHAR(16) NOT NULL DEFAULT 'en',
  status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'paused')),
  sent_count INTEGER NOT NULL DEFAULT 0,
  skipped_opt_out_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. AUDIT LOGS (Immutable Security & Compliance Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(40),
  action VARCHAR(80) NOT NULL, -- e.g. 'PII_ACCESS_DENIED', 'CONSENT_WITHDRAWN', 'LEAD_ASSIGNED', 'BACKUP_CREATED'
  entity_type VARCHAR(40) NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. INVOICES (GST Billing & Demand Notes)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  billed_to_name VARCHAR(140) NOT NULL,
  billed_to_phone VARCHAR(20) NOT NULL,
  billed_to_address TEXT NOT NULL,
  buyer_gst_or_pan VARCHAR(32),
  bill_category VARCHAR(32) NOT NULL CHECK (bill_category IN ('booking_milestone', 'brokerage_fee', 'legal_documentation', 'maintenance_deposit', 'rental_invoice')),
  line_items JSONB NOT NULL,
  subtotal_inr NUMERIC(14, 2) NOT NULL CHECK (subtotal_inr > 0),
  cgst_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 2.50,
  sgst_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 2.50,
  cgst_amount_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sgst_amount_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount_inr NUMERIC(14, 2) NOT NULL CHECK (total_amount_inr >= subtotal_inr),
  paid_amount_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'issued' CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. ADVANCE TOKEN RECEIPTS (EOI & Booking Token Receipts)
CREATE TABLE IF NOT EXISTS advance_token_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number VARCHAR(40) NOT NULL UNIQUE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  payer_name VARCHAR(140) NOT NULL,
  payer_phone VARCHAR(20) NOT NULL,
  payer_email VARCHAR(160),
  pan_masked VARCHAR(16),
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('booking_token', 'eoi_priority', 'unit_hold_deposit', 'rental_token')),
  token_amount_inr NUMERIC(14, 2) NOT NULL CHECK (token_amount_inr > 0),
  payment_mode VARCHAR(24) NOT NULL CHECK (payment_mode IN ('upi', 'neft_rtgs', 'cheque', 'demand_draft', 'card')),
  reference_number VARCHAR(80) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until_date DATE NOT NULL,
  unit_reserved BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'cleared', 'adjusted_to_booking', 'refunded')),
  remarks TEXT,
  received_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

