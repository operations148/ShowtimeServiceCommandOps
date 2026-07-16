-- =============================================================================
-- Migration — Phase 7: Secure tenant-branded customer portal
--
-- Additive only. NOT applied to any live database — application requires
-- explicit approval (same posture as every prior phase migration).
--
-- Portal customers are a SEPARATE identity from staff `users` (ADR-0014):
-- a contact who can sign in (passwordless magic link) to see only their own
-- properties' documents. Authorization is property-scoped via the join table;
-- a portal customer can never reach another customer's data.
--
-- Contents:
--   1. portal_customers            — the customer identity
--   2. portal_customer_properties  — which properties a customer may access
--   3. portal_magic_links          — hashed, one-time, expiring login tokens
--   4. portal_sessions             — revocable signed-cookie sessions
--   5. portal_events               — append-only portal audit log
--   6. RLS + grants
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. tenants.portal_booking_url — tenant-configured deep link to the approved
--    GHL booking experience (the portal never builds its own booking engine;
--    "book a visit" links out to GHL when this is set).
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS portal_booking_url TEXT;

-- ---------------------------------------------------------------------------
-- 1. portal_customers
--
-- session_version bumps to revoke ALL of a customer's sessions at once (same
-- mechanism as users.session_version for staff). is_active=false deactivates
-- the account entirely.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_customers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  phone           TEXT,
  -- Optional soft link to the GHL contact this portal user represents.
  ghl_contact_id  TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  session_version INTEGER     NOT NULL DEFAULT 1,
  last_login_at   TIMESTAMPTZ,
  invited_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT portal_customers_tenant_email_key UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_portal_customers_tenant ON portal_customers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_customers_email  ON portal_customers (tenant_id, lower(email));

CREATE TRIGGER portal_customers_updated_at
  BEFORE UPDATE ON portal_customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. portal_customer_properties — multi-property access
--    tenant_id is denormalised for RLS + query scoping.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_customer_properties (
  portal_customer_id UUID        NOT NULL REFERENCES portal_customers(id) ON DELETE CASCADE,
  property_id        UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (portal_customer_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_pcp_property ON portal_customer_properties (property_id);
CREATE INDEX IF NOT EXISTS idx_pcp_tenant   ON portal_customer_properties (tenant_id);

-- ---------------------------------------------------------------------------
-- 3. portal_magic_links — passwordless login (ADR-0014).
--
-- token_hash is SHA-256 of the emailed token; plaintext never stored. One-time
-- via consumed_at (a consumed or expired link is inert). Short-lived.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_magic_links (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_customer_id UUID        NOT NULL REFERENCES portal_customers(id) ON DELETE CASCADE,
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash         TEXT        NOT NULL,
  -- login | invite (invite links are the first-login flow from an admin invite)
  purpose            TEXT        NOT NULL DEFAULT 'login' CHECK (purpose IN ('login', 'invite')),
  expires_at         TIMESTAMPTZ NOT NULL,
  consumed_at        TIMESTAMPTZ,
  requested_ip       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_magic_links_token_hash
  ON portal_magic_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_portal_magic_links_customer
  ON portal_magic_links (portal_customer_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. portal_sessions — revocable sessions (ADR-0014).
--
-- The signed cookie carries this row's id + a secret; the server validates the
-- cookie's token_hash against this row on every request (not revoked, not
-- expired, and portal_customers.session_version still matches). Per-session
-- revoke (revoked_at) + review history + last-login all read from here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_sessions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_customer_id UUID        NOT NULL REFERENCES portal_customers(id) ON DELETE CASCADE,
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash         TEXT        NOT NULL,
  -- The session_version at issue time; a mismatch (customer bumped it) = revoked.
  session_version    INTEGER     NOT NULL,
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ,
  last_seen_at       TIMESTAMPTZ,
  ip                 TEXT,
  user_agent         TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_sessions_token_hash ON portal_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_customer ON portal_sessions (portal_customer_id, issued_at DESC);

-- ---------------------------------------------------------------------------
-- 5. portal_events — append-only portal audit log.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_events (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portal_customer_id UUID        REFERENCES portal_customers(id) ON DELETE SET NULL,
  event_type         TEXT        NOT NULL CHECK (event_type IN (
    'invited', 'link_requested', 'link_sent', 'logged_in', 'login_failed',
    'signed_out', 'session_revoked', 'sessions_revoked_all', 'access_revoked',
    'profile_updated', 'estimate_accepted', 'estimate_declined',
    'change_order_accepted', 'change_order_rejected', 'invoice_paid',
    'document_downloaded'
  )),
  actor_user_id      UUID        REFERENCES users(id) ON DELETE SET NULL, -- staff actor for admin actions
  ip                 TEXT,
  user_agent         TEXT,
  metadata           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_events_customer ON portal_events (portal_customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_events_tenant   ON portal_events (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. RLS + grants (defense-in-depth; service-role bypasses, app-layer is the
--    active control — same caveat as the rest of the schema).
--    portal_customer_properties has tenant_id so it joins the loop.
-- ---------------------------------------------------------------------------
ALTER TABLE portal_customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_customer_properties  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_magic_links          ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_events               ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'portal_customers', 'portal_customer_properties', 'portal_magic_links',
    'portal_sessions', 'portal_events'
  ]
  LOOP
    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (tenant_id = current_tenant_id())', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_write" ON %I FOR ALL USING (tenant_id = current_tenant_id() AND current_user_role() IN (''tenant_admin'', ''office_staff'', ''platform_owner'')) WITH CHECK (tenant_id = current_tenant_id())',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO service_role, authenticated', t);
  END LOOP;
END $$;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX NOTES
--
-- Additive only. New tables can be dropped in reverse dependency order while
-- unused: portal_events, portal_sessions, portal_magic_links,
-- portal_customer_properties, portal_customers.
-- =============================================================================
