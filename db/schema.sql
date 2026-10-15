-- AI Reply schema (multi-tenant). Safe to run more than once.
-- Every tenant-owned row carries client_id (and agency_id) so queries can always be scoped.
-- Note: scripts/migrate.mjs splits on ";" at end of line, so no DO blocks or functions here.

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0,
  included_agents integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  email text,
  mobile text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id),
  plan_id uuid REFERENCES plans(id),
  company_name text NOT NULL,
  legal_name text,
  business_type text,
  website text,
  gst_number text,
  pan text,
  address text,
  state text,
  source text,
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','suspended','closed')),
  suspend_reason text,
  onboarding_stage text NOT NULL DEFAULT 'documents',
  wallet_balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('super_admin','staff_support','staff_sales','staff_billing','staff_developer','agency_admin','client_admin','agent_head','agent')),
  name text NOT NULL,
  email text NOT NULL,
  mobile text,
  password_hash text NOT NULL,
  agency_id uuid REFERENCES agencies(id),
  client_id uuid REFERENCES clients(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_client_idx ON users (client_id);
CREATE INDEX IF NOT EXISTS users_agency_idx ON users (agency_id);
CREATE INDEX IF NOT EXISTS clients_agency_idx ON clients (agency_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  actor_name text,
  actor_role text,
  agency_id uuid,
  client_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_client_idx ON audit_logs (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_agency_idx ON audit_logs (agency_id, created_at DESC);

-- ===== Phase 2: platform, portal, messaging =====
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin','staff_support','staff_sales','staff_billing','staff_developer','agency_admin','client_admin','agent_head','agent'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS dist_percent integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS low_balance_alert numeric(12,2) NOT NULL DEFAULT 100;

CREATE TABLE IF NOT EXISTS rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('marketing','utility','authentication','service')),
  meta_cost numeric(10,4) NOT NULL DEFAULT 0,
  markup numeric(10,4) NOT NULL DEFAULT 0,
  UNIQUE (plan_id, category)
);

CREATE TABLE IF NOT EXISTS client_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('marketing','utility','authentication','service')),
  rate numeric(10,4) NOT NULL,
  UNIQUE (client_id, category)
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id bigserial PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id),
  type text NOT NULL CHECK (type IN ('credit','debit','refund','adjustment')),
  amount numeric(12,4) NOT NULL,
  balance_after numeric(12,4) NOT NULL,
  meta_cost numeric(12,4) NOT NULL DEFAULT 0,
  reference text,
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_client_idx ON wallet_ledger (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  number text NOT NULL,
  period text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due','paid','void')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS website_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  company text,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','won','lost')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'whatsapp' CHECK (type IN ('whatsapp','facebook','instagram','sms','rcs')),
  display_name text NOT NULL,
  phone_number text,
  waba_id text,
  phone_number_id text,
  token_enc text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','disconnected','banned','restricted')),
  tier text,
  quality_rating text,
  verification text,
  webhook_ok boolean NOT NULL DEFAULT false,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channels_client_idx ON channels (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS channels_phone_id_unique ON channels (phone_number_id) WHERE phone_number_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#16a34a',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  phone text NOT NULL,
  name text,
  agent_id uuid REFERENCES users(id) ON DELETE SET NULL,
  opted_out boolean NOT NULL DEFAULT false,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, phone)
);
CREATE INDEX IF NOT EXISTS contacts_client_idx ON contacts (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contacts_agent_idx ON contacts (agent_id);

CREATE TABLE IF NOT EXISTS contact_labels (
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, label_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','history')),
  bot_active boolean NOT NULL DEFAULT true,
  unread integer NOT NULL DEFAULT 0,
  last_inbound_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, contact_id)
);
CREATE INDEX IF NOT EXISTS conv_client_idx ON conversations (client_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out','system','note')),
  kind text NOT NULL DEFAULT 'text',
  body text,
  sender_user_id uuid,
  sender_name text,
  is_bot boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('queued','sent','delivered','read','failed','received')),
  wa_message_id text,
  error text,
  campaign_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS msg_conv_idx ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS msg_wa_idx ON messages (wa_message_id);

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'utility' CHECK (category IN ('marketing','utility','authentication')),
  language text NOT NULL DEFAULT 'en',
  header_text text,
  body text NOT NULL,
  footer text,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','rejected','paused','disabled')),
  quality text,
  rejection_reason text,
  meta_template_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, name, language)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  template_id uuid REFERENCES templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'utility',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','completed','paused','failed')),
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  total integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','failed')),
  error text,
  wa_message_id text,
  cost numeric(10,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cm_campaign_idx ON campaign_messages (campaign_id, status);
CREATE INDEX IF NOT EXISTS cm_wa_idx ON campaign_messages (wa_message_id);

CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('keyword_reply','welcome','out_of_office','ai_bot','feedback','quick_reply','auto_assign','icebreaker','keyword_alert','opt_out')),
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auto_client_idx ON automations (client_id, type);

CREATE TABLE IF NOT EXISTS flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_keyword text,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('new_contact','keyword','inbound_message')),
  trigger_value text,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_logs (
  id bigserial PRIMARY KEY,
  client_id uuid NOT NULL,
  workflow_id uuid,
  workflow_name text,
  contact_phone text,
  result text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  key_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS api_key_hash_unique ON api_keys (key_hash);

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, kind)
);

CREATE TABLE IF NOT EXISTS short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  target_url text NOT NULL,
  title text,
  clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Inbound media (photos, voice notes, documents) =====
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_id text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_mime text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_name text;
