-- AI Reply: Phase 1 schema (multi-tenant). Safe to run more than once.
-- Every tenant-owned row carries client_id (and agency_id) so queries can always be scoped.

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
  role text NOT NULL CHECK (role IN ('super_admin','agency_admin','client_admin','agent_head','agent')),
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
