# ServiceOps Command Center — All Claude Code Phase Prompts

# ServiceOps Claude Code Phase Prompts

These prompts split the ServiceOps Markate-inspired expansion into controlled Claude Code phases.

## Use order

1. `00_PHASE_0_REPOSITORY_AUDIT_AND_MASTER_PLAN.md`
2. `01_PHASE_1_SECURITY_TENANCY_AUTHORIZATION_FOUNDATION.md`
3. `02_PHASE_2_CORE_DATA_MODEL_AND_PRICEBOOK.md`
4. `03_PHASE_3_FULL_ESTIMATES_AND_CUSTOMER_APPROVAL.md`
5. `04_PHASE_4_DISPATCH_CALENDAR_VISITS_AND_RECURRING_WORK.md`
6. `05_PHASE_5_WORK_ORDER_EXPANSION_AND_CHANGE_ORDERS.md`
7. `06_PHASE_6_INVOICES_STRIPE_PAYMENTS_AND_RECONCILIATION.md`
8. `07_PHASE_7_CUSTOMER_PORTAL.md`
9. `08_PHASE_8_TECHNICIAN_PWA_AND_OFFLINE_SYNC.md`
10. `09_PHASE_9_TIME_MILEAGE_EXPENSES_AND_JOB_COSTING.md`
11. `10_PHASE_10_REPORTING_PLATFORM_ADMIN_AND_WHITE_LABEL.md`
12. `11_PHASE_11_PRODUCTION_READINESS_SECURITY_QA_AND_DEPLOYMENT.md`

## How to use each phase

Open Claude Code inside the repository.

Paste the full content of the current phase file.

Claude must read the repository and the previous phase report before making changes.

Do not paste all phases at once. Complete, test, document, and review one phase before starting the next.

## Recommended branch strategy

You can use either:

- One long branch: `feat/markate-operations-expansion`
- One branch per phase, such as `feat/serviceops-phase-1-security`

A branch per phase is safer for review and rollback.

## Approval gates

Claude may make local repository changes and run tests without approval.

Claude must stop before:

- Production Supabase migration
- Production deployment
- Live Stripe action
- Live customer email
- Live GHL credential or workflow change
- DNS change
- Merge to production
- Destructive production-data action

## First launcher

Paste this into Claude Code before Phase 0:

```text
Open the operations148/ShowtimeServiceCommandOps repository.

Read CLAUDE.md, MEMORY.md, HANDOFF.md, README.md, ROADMAP.md, PRODUCT_BRIEF.md, all memory files, all Claude agents and skills, all Supabase migrations, markate_report.md if available, and the entire Phase 0 prompt.

Execute Phase 0 only. Do not implement later phases. Stop after the audit, baseline tests, Markate gap matrix, security findings, master implementation plan, and Phase 0 report are complete.
```




---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 0 — Repository Audit, Markate Gap Analysis, and Master Plan

## Objective

Create a verified current-state assessment and implementation plan before changing production behavior.

This phase is analysis, documentation, test-baseline creation, and safe scaffolding only. Do not build the major product modules yet.

## Product reference

Read `markate_report.md` if it is available in the workspace. Use it only as a product-capability reference.

The target is not a pixel-for-pixel Markate clone. The target is to extend ServiceOps with the operational features that fit this project while excluding:

- Marketing automation
- AI voice receptionist
- Conversation AI
- Integration marketplace
- Shopify
- Slack
- Native mobile apps
- Enterprise warehouse inventory

## Required audit

Inspect the repository recursively and document:

### Application architecture

- Framework, runtime, rendering model, and deployment model
- App Router pages and layouts
- Server and client components
- Middleware
- Authentication
- Session handling
- API routes and methods
- Background and scheduled jobs
- PWA manifest, service worker, install behavior, and caching
- External integrations
- Error handling and logging

### Database

Inventory every:

- Table
- Enum
- Index
- Trigger
- Constraint
- RLS policy
- Storage bucket
- Migration
- Seed
- Foreign-key relationship
- Tenant-owned table
- Public-token table
- Financial table
- Audit/history table

Create a current-state ERD.

### Authorization

Document:

- Existing roles
- Existing permission flags
- Route protections
- API protections
- Technician scoping
- Platform-owner behavior
- Tenant-admin behavior
- Read-only behavior
- Public routes
- Service-role Supabase usage
- Every place tenant isolation depends on application code instead of RLS

Create a route × role × action matrix.

### Existing modules

Verify the actual implementation status of:

- Dashboard
- Work orders
- Properties
- Equipment records
- Visits
- Technician mobile view
- Checklists
- Photos
- Notes
- Recurring schedules
- Team
- Technicians
- Invitations
- Estimates
- Invoices
- Stripe
- Reports
- Settings
- GHL webhooks
- GHL outbound sync
- PWA
- Customer portal

Do not mark a module complete because a nav item, placeholder, type, migration, or partial route exists.

### Security

Identify and classify:

- Hardcoded tenant fallbacks
- Missing tenant filters
- Service-role bypass risks
- Incorrect RLS policies
- Incorrect permission usage
- IDOR paths
- Hard-delete paths
- Missing rate limits
- Missing CSRF or origin checks
- Missing security headers
- Session invalidation gaps
- Invite/reset token risks
- Webhook replay/idempotency gaps
- In-memory queues
- Unsafe fire-and-forget work
- File-validation and ownership gaps
- Secret exposure risks
- PII leakage in logs
- Public-token enumeration risks
- Financial-state inconsistencies
- Duplicate or conflicting type definitions
- Missing tests
- Stale documentation

Classify findings as Critical, High, Medium, or Low.

### Markate-inspired feature gap

Create a matrix comparing the current platform with the approved target capabilities:

- Pricebook
- Full estimates/proposals
- Dispatch
- Calendar/scheduling
- Admin visit history
- Multi-day work
- Parent/child work orders
- Multiple technicians
- Change orders
- Invoices
- Deposits
- Partial/progressive payments
- Customer portal
- Time tracking
- Mileage
- Expenses
- Job costing
- Route workflow
- Offline PWA
- Employee permissions
- Reporting
- Platform administration
- White-label readiness

For each capability show:

- Existing
- Partial
- Missing
- Reuse opportunities
- Security dependency
- Data-model dependency
- Recommended phase
- Out of scope

## Test baseline

Run the existing commands and capture the baseline:

- Install
- Lint
- Typecheck
- Tests
- Production build
- Dependency audit

Do not hide failures. Record exact errors and whether they predate this phase.

If no test framework exists, add only the minimum non-invasive test scaffolding needed to support later phases. Do not begin feature implementation.

## Required documents

Create or update:

- `docs/audits/repository-inventory.md`
- `docs/audits/markate-gap-analysis.md`
- `docs/audits/security-audit.md`
- `docs/audits/dependency-audit.md`
- `docs/architecture/current-state.md`
- `docs/architecture/erd.md`
- `docs/implementation/master-plan.md`
- `docs/implementation/traceability-matrix.md`
- `docs/architecture/decisions/ADR-0001-scope-and-source-of-truth.md`
- `qa/test-baseline.md`
- `qa/test-matrix.md`
- `memory/phase-0-audit.md`

## Master plan requirements

The implementation plan must:

- Preserve working modules
- Fix security foundations before portal and payment expansion
- Use additive migrations
- Define phase dependencies
- Define rollback strategy
- Define external approval gates
- Define tests per phase
- Define feature flags for unfinished modules
- Prevent dead navigation routes
- Keep GHL product boundaries intact

## Completion gate

Phase 0 is complete only when:

- The repository inventory is complete
- The current-state ERD exists
- The authorization matrix exists
- The security findings are prioritized
- The Markate gap matrix exists
- The build/test baseline is recorded
- Every requested feature maps to a phase or explicit exclusion
- The master plan is internally consistent
- No major product feature has been prematurely implemented

Stop after presenting the Phase 0 report. Do not begin Phase 1 until the owner reviews the plan.


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 1 — Security, Multi-Tenancy, Authorization, Audit, and Reliability Foundation

## Prerequisite

Read and follow the approved Phase 0 master plan and `memory/phase-0-audit.md`.

## Objective

Fix the foundational security and reliability weaknesses before adding major financial, portal, scheduling, or offline features.

This phase is a release blocker for later phases.

## Required implementation

### Trusted authorization context

Create a single server-side authorization context that contains:

- Authenticated user ID
- Tenant/organization ID
- Role
- Permission set
- Session version
- Technician identity where applicable
- Request ID

All tenant-owned queries must receive this trusted context or an explicit trusted tenant ID derived from it.

Remove all hardcoded tenant fallbacks, including any fallback equivalent to `"tenant-showtime"`.

Make it impossible for tenant-owned data-access functions to execute without tenant scope.

### Organization and identity model

Audit the current user uniqueness model.

Resolve safely how the same email can participate in multiple organizations. Choose and document one model:

- Global identity plus organization memberships, preferred for scalable SaaS, or
- Explicit tenant slug plus email

Do not silently select the first matching user.

Add an ADR for the final identity and membership model.

### Granular permissions

Replace overly broad write authorization with explicit permissions.

At minimum create permission keys for:

- Work-order read, create, update, assign, archive
- Property read and edit
- Visit read and manage
- Schedule read and manage
- Estimate create, send, approve, override
- Invoice read and manage
- Payment refund
- Expense manage
- Time approve
- Reports operational
- Reports financial
- Team invite
- Team role change
- Settings manage
- Audit-log read
- Tenant manage

Ensure read-only roles cannot mutate any operational or financial record.

Enforce permissions in:

- Route handlers
- Server actions
- Server components
- Data-access functions
- Public-token handlers
- Platform-owner operations

### RLS review

Review every tenant-owned table.

Fix RLS policies so they:

- Deny by default
- Match the application permission model
- Never allow read-only roles to update
- Scope technicians to assigned work where required
- Protect public-token records
- Protect financial records
- Protect audit records
- Protect storage objects

Add automated RLS and cross-tenant tests where the environment supports them.

### Session security

Implement:

- Session version or equivalent revocation control
- Revocation after role change
- Revocation after deactivation
- Revocation after password change
- Secure production cookie settings
- Generic authentication errors
- Login rate limiting
- Progressive backoff
- Password reset if absent
- Hashed reset and invitation tokens
- Atomic one-time invitation acceptance
- Invitation expiry and revocation
- Strong password policy
- MFA readiness; admin MFA may remain a documented production blocker if the current auth stack cannot support it safely in this phase

### CSRF, origins, headers, and request integrity

Implement:

- Same-origin validation for cookie-authenticated mutations
- CSRF protection where needed
- Strict CORS
- Trusted-host validation
- Content-type validation
- Request body-size limits
- Method allowlists
- Security headers
- CSP
- HSTS in production
- `X-Content-Type-Options`
- Referrer policy
- Permissions policy
- `frame-ancestors`

### Durable rate limiting

Use a production-capable durable limiter, not process memory.

Protect:

- Login
- Password reset
- Invitation acceptance
- Public token endpoints
- File uploads
- Payment-session creation
- Exports
- Expensive reports
- Webhooks
- Admin actions

If a new paid service is required, isolate it behind an adapter and stop at the credential/cost approval gate after completing the code path and fallback behavior.

### Audit logs

Create an append-only audit-log system with:

- Tenant
- Actor
- Role
- Action
- Resource
- Before/after changed fields
- Reason
- Request ID
- Source
- Timestamp
- Redaction
- Schema version

Log at least:

- Invitation
- Role and permission change
- User activation/deactivation
- Password reset
- Credential replacement without credential value
- GHL mapping changes
- Estimate decisions
- Work-order overrides
- File upload/delete
- Financial actions
- Data exports
- Sensitive report access
- Feature flags
- Support access
- Deployment and migration actions

Reserve future audit action names for AI copy approval/rejection, Shopify publishing, theme assets, experiments, analytics keys, and brand rules without building those excluded features.

### Durable webhook and integration work

Create:

- Webhook event receipt table
- Unique provider/event ID
- Payload hash
- Verification status
- Processing status
- Attempt count
- Next retry time
- Last error
- Dead-letter state

Replace the in-memory GHL retry queue with a durable outbox.

Make critical work awaited or durable. Do not rely on fire-and-forget promises in serverless execution.

Make cron endpoints fail closed when secrets are missing.

### Webhook security

GHL:

- Verify approved bearer or signature
- Use constant-time secret comparison
- Disable query-token authentication in production
- Validate payload with schemas
- Add idempotency
- Add replay protections where possible
- Redact logs

Stripe:

- Preserve raw-body signature verification
- Add event idempotency
- Verify tenant, connected account, invoice, amount, currency, and server-owned metadata
- Return generic client errors
- Record payment-event processing safely

Slack and Shopify:

- Do not add these integrations.
- Mark signature verification `N/A — excluded by approved scope` in the production checklist.

### File security

Fix file handling:

- Decode or inspect magic bytes
- Re-encode supported images
- Strip EXIF and GPS metadata
- Generate server-side safe names
- Enforce dimensions, count, and size
- Use private buckets and signed URLs
- Verify exact visit/work-order/file ownership
- Never authorize delete by tenant path prefix alone
- Log upload/delete actions
- Add cleanup for orphaned uploads
- Add a quarantine strategy for future non-image documents

### Logging and errors

Implement:

- Structured JSON logging
- Request IDs
- Tenant and actor context where safe
- PII and secret redaction
- Typed public error responses
- No stack traces to clients
- Health and readiness endpoints without secrets
- Integration health state
- Queue/dead-letter visibility

Do not convert material database outages into fake successful empty datasets.

### CI and supply chain

Add:

- Lockfile enforcement
- `npm ci`
- Lint
- Typecheck
- Unit tests
- Integration tests
- Build
- Dependency audit
- Secret scan
- Static analysis
- Migration checks
- Least-privilege GitHub Actions permissions
- Dependabot or equivalent

## Required tests

Add tests for:

- Cross-tenant denial
- Read-only mutation denial
- Technician assignment scoping
- Role change session revocation
- User deactivation session revocation
- Invitation replay
- Reset token replay
- Login rate limiting
- CSRF/origin rejection
- Webhook invalid signature
- Webhook duplicate event
- Durable retry
- Unauthorized file deletion
- MIME spoofing
- Oversized image
- Missing cron secret
- Redacted logging

## Required documents

Create or update:

- `docs/architecture/authorization-model.md`
- `docs/architecture/threat-model.md`
- `docs/security/security-controls.md`
- `docs/security/audit-event-catalog.md`
- `docs/security/secrets-management.md`
- `docs/security/incident-response.md`
- `docs/architecture/decisions/ADR-0002-identity-and-memberships.md`
- `docs/architecture/decisions/ADR-0003-permission-model.md`
- `docs/architecture/decisions/ADR-0004-webhook-outbox.md`
- `qa/security-test-plan.md`
- `qa/tenant-isolation-test-plan.md`
- `memory/phase-1-security-foundation.md`

## Completion gate

Phase 1 is complete only when:

- Hardcoded tenant fallbacks are removed
- Cross-tenant tests pass
- Read-only writes are blocked
- Session revocation works
- Rate limiting is durable
- Audit logs are active
- The GHL retry queue is durable
- Webhooks are idempotent
- Cron routes fail closed
- File ownership checks are exact
- Security headers are active
- CI security checks run
- Lint, typecheck, tests, and build pass

Do not begin Phase 2 until these gates pass.


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 2 — Core Operational Data Model, Money Foundation, and Pricebook

## Prerequisite

Phase 1 must be complete with passing security and tenant-isolation tests.

## Objective

Create the safe shared data foundation needed by estimates, change orders, invoices, job costing, and reporting.

Implement the pricebook. Do not yet build the complete estimate, dispatch, or portal experiences.

## Required implementation

### Schema reconciliation

Audit and consolidate conflicting types and tables for:

- Estimates
- Estimate handoffs
- Invoices
- Invoice line items
- Payments
- Work-order financial links
- Status enums

Create one authoritative model per domain.

Do not maintain two incompatible invoice or estimate state machines.

### Money utilities

Create tested utilities for:

- Integer cents
- Currency
- Quantity
- Decimal tax rates
- Discounts
- Markups
- Rounding
- Subtotal
- Tax
- Total
- Deposit
- Amount paid
- Amount due
- Gross profit
- Gross margin

Never calculate authoritative totals only in the browser.

### Tenant-safe numbering

Replace `COUNT(*) + 1` numbering.

Implement transaction-safe, tenant-scoped sequences for:

- Work orders if needed
- Estimates
- Change orders
- Invoices
- Payments/receipts if numbered

Document concurrency behavior and add race-condition tests.

### Pricebook

Implement tenant-scoped:

- Categories
- Items
- Services
- Labor
- Materials
- Equipment
- Fees
- Discounts
- Packages or bundles

Fields should include where applicable:

- Name
- Description
- Type
- Category
- Unit
- Default quantity
- Customer price
- Internal cost
- Taxable
- Tax category
- Vendor reference
- Image
- Notes
- Active/inactive
- Sort order
- Created/updated by
- Created/updated timestamps
- Archive timestamp
- Version

Use soft delete/archive.

### Pricebook permissions

Implement permissions for:

- Read
- Create
- Edit
- Archive
- View cost
- Export

Do not expose internal cost to technicians or customer portal users unless explicitly permitted.

### Pricebook UI

Build:

- List
- Search
- Filters
- Category management
- Create form
- Edit form
- Archive/restore
- Mobile-responsive cards
- Desktop table
- Empty/error/loading states
- Image upload through the secure file pipeline
- Import/export only if it can be secured and tested within this phase

### Document snapshot foundation

Create immutable line-item snapshot structures so future estimates, change orders, and invoices do not change when the pricebook item is edited.

Snapshots must retain:

- Item name
- Description
- Unit
- Quantity
- Unit price
- Unit cost
- Tax behavior
- Discount
- Markup
- Total
- Source pricebook ID
- Source version

### Optimistic concurrency

Add row versioning or equivalent for frequently edited pricebook and financial documents.

Reject stale writes with a clear conflict response.

### Migrations

Add:

- Additive schema migrations
- Indexes
- RLS
- Grants
- Tenant constraints
- Backfill scripts where required
- Dry-run verification
- Rollback or forward-fix notes

## Required tests

Add:

- Money calculation tests
- Rounding tests
- Tax tests
- Discount and markup tests
- Tenant-safe sequence concurrency test
- Cross-tenant pricebook tests
- Internal-cost permission tests
- Archive behavior
- Snapshot immutability
- Optimistic concurrency
- Migration verification

## Required documents

Create or update:

- `docs/architecture/target-state.md`
- `docs/architecture/erd.md`
- `docs/architecture/decisions/ADR-0005-money-and-document-numbering.md`
- `docs/architecture/decisions/ADR-0006-pricebook-and-line-item-snapshots.md`
- `specs/pricebook.md`
- `database-blueprint/pricebook.md`
- `memory/phase-2-pricebook.md`

## Completion gate

Phase 2 is complete only when:

- Estimate/invoice model conflicts are resolved
- Money utilities are authoritative and tested
- Tenant-safe numbering is concurrency-safe
- Pricebook CRUD is complete
- Cost permissions work
- Pricebook items can be snapshotted
- Migrations and RLS are tested
- No enterprise inventory module was added
- Lint, typecheck, tests, and build pass


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 3 — Full Estimates, Proposals, and Secure Customer Approval

## Prerequisite

Phase 2 pricebook, money utilities, numbering, and line-item snapshots must be complete.

## Objective

Upgrade the current estimate handoff into a complete tenant-safe estimate and proposal workflow.

Preserve GHL references, but ServiceOps owns the operational estimate document and approval history.

Do not add autonomous follow-up campaigns.

## Required implementation

### Estimate document lifecycle

Implement authoritative states such as:

- Draft
- Ready
- Sent
- Viewed
- Accepted
- Declined
- Expired
- Converted
- Voided

Define one state machine and use it everywhere.

### Estimate creation

Support:

- Property
- Customer operational snapshot
- Work order
- GHL contact/opportunity IDs
- Tenant-safe estimate number
- Issue date
- Expiration
- Pricebook lines
- Custom lines
- Quantity
- Unit
- Price
- Cost
- Tax
- Discount
- Markup
- Optional items
- Recommended items
- Packages/options
- Internal notes
- Customer notes
- Terms
- Attachments
- Proposal template
- Assigned estimator
- Version

All totals must be calculated server-side from validated data.

### Proposal options

Allow customers to select approved optional lines or one package when the estimate configuration permits it.

Prevent incompatible options.

Recalculate server-side from the stored document version.

### Versioning and locking

Implement:

- Draft edits
- Version history
- Sent-version snapshot
- Accepted-version snapshot
- Lock after acceptance
- Expiration
- Admin override only with explicit permission and mandatory reason
- Audit events for overrides

### Manual sending

Implement an explicit send action.

Do not automatically email customers during local or preview testing.

Use a safe mail abstraction with:

- Preview mode
- Test-recipient override
- Tenant branding
- Escaped templates
- Send log
- Failure state
- Manual retry
- No secrets or PII in logs

Real customer sending is an external-action approval gate.

### Secure public estimate route

Create a secure customer estimate experience:

- Unpredictable token
- Hash token at rest
- Expiry
- Revocation
- Rate limit
- Generic errors
- Tenant branding
- Mobile-first design
- Accessible proposal
- Viewed timestamp
- Accept
- Decline with reason
- Typed name and/or signature
- Customer selections
- Terms acknowledgement
- Approval metadata
- One-time decision idempotency
- Replay protection

Do not expose internal costs, internal notes, GHL private data, tenant IDs, or staff-only fields.

### Acceptance transaction

Make acceptance transactional and idempotent.

The transaction should:

- Verify token
- Verify version
- Verify status
- Verify expiration
- Verify selections
- Recalculate totals
- Store approval
- Lock the accepted version
- Create or queue the approved next operational records according to the approved design
- Record audit and approval logs

Do not allow duplicate invoices or work orders from repeated submission.

### Decline

Capture:

- Reason
- Timestamp
- Decision metadata
- Version
- Audit event

Do not trigger marketing automation.

### Estimate administration UI

Build:

- List
- Status filters
- Search
- Create
- Edit
- Preview
- Version history
- Send
- View activity
- Accept/decline status
- Override flow
- Expiration handling
- Mobile and desktop layouts

Replace the current handoff-only status UI without losing existing estimate-needed technician data.

### PDF

Generate a secure proposal PDF from the accepted/sent snapshot.

Escape all values.

## Required tests

Add:

- State-machine tests
- Server-side total tests
- Option-selection tests
- Token hashing
- Token expiry
- Token revocation
- Rate limiting
- Public-field redaction
- Accept replay
- Decline replay
- Expired estimate
- Stale version
- Concurrent acceptance
- Duplicate-conversion prevention
- Override permission and reason
- Cross-tenant public token
- Email template XSS
- PDF escaping

## Required documents

Create or update:

- `specs/estimates.md`
- `database-blueprint/estimates.md`
- `docs/architecture/decisions/ADR-0007-public-estimate-tokens.md`
- `docs/architecture/decisions/ADR-0008-estimate-versioning-and-locking.md`
- `qa/estimate-test-plan.md`
- `memory/phase-3-estimates.md`

## Completion gate

Phase 3 is complete only when:

- Estimates are full financial documents
- The handoff-only experience is migrated safely
- Public viewing and decisions are secure
- Acceptance is transactional and idempotent
- Accepted versions are immutable
- Admin override is permissioned and audited
- Manual send exists
- No autonomous marketing automation was added
- Tests and build pass


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 4 — Dispatch, Calendar, Visit Administration, and Recurring Work

## Prerequisite

Security foundation and the core data model must be complete.

## Objective

Build the operational scheduling layer and replace the placeholder admin Visits page.

GHL remains the source of truth for original customer booking when applicable. ServiceOps owns field assignment, dispatch, visit execution, and operational schedule history.

## Required implementation

### Schedule data model

Implement or complete:

- Work-order visits
- Visit assignments
- Multiple technicians
- Planned start/end
- Arrival window
- Estimated duration
- Travel buffer
- All-day flag
- Multi-day project linkage
- Recurrence blueprint
- Recurrence exception
- Blocked time
- Technician availability
- Assignment history
- Schedule history
- Row version
- External GHL appointment ID
- Sync state

### Calendar views

Build:

- Day
- Week
- Month
- Team day
- Team week
- Unassigned work
- Overdue work
- Upcoming work
- Blocked time
- Map/list route-order view

The UI must be responsive and accessible.

### Dispatch operations

Support:

- Assign
- Reassign
- Multi-technician assignment
- Drag-and-drop rescheduling
- Keyboard-accessible alternative to drag-and-drop
- Conflict warnings
- Capacity indicators
- Estimated duration
- Arrival windows
- Manual route order
- Reschedule reason
- Assignment/schedule audit log
- Optimistic concurrency
- Stale-update conflict handling

### Timezone safety

Use tenant timezone consistently.

Test:

- UTC storage
- Local display
- Daylight-saving transitions
- Cross-midnight work
- All-day work
- Recurring dates

### GHL relationship

Preserve:

- GHL appointment ID
- GHL contact ID
- GHL opportunity ID

Do not build a second lead booking calendar.

Only sync approved operational changes to GHL.

Use durable outbox and idempotency.

### Recurring work

Upgrade recurring schedules to:

- Blueprint
- Frequency
- Start/end
- Assigned technicians
- Checklist template
- Duration
- Arrival window
- Exceptions
- Pause/resume
- Skip occurrence
- Generate horizon
- Idempotent generation
- Timezone-safe cron
- Manual preview
- Audit log

### Visits admin page

Replace the placeholder with:

- Visit list
- Filters
- Search
- Date range
- Status
- Technician
- Property
- Work order
- Recurring/manual
- Visit detail
- Timeline
- Checklist progress
- Photos
- Notes
- Actual times
- Estimate-needed
- Follow-up
- Completion report
- Reschedule
- Failed/incomplete reason
- Audit history

### Route workflow

Implement a manual route workflow:

- Address geocoding abstraction only if an approved provider exists
- Route order
- Travel estimate where the provider supports it
- Deep links to native navigation
- No expensive route-optimization vendor without approval
- No promise of mathematically optimized routing unless an optimization engine is actually implemented

### Cron reliability

Recurring generation must:

- Fail closed without secret
- Be idempotent
- Record run
- Record per-tenant result
- Record errors
- Support safe retry
- Avoid duplicates
- Be observable

## Required tests

Add:

- Schedule permission tests
- Cross-tenant schedule denial
- Drag/drop API update tests
- Stale version conflict
- Multi-technician assignment
- Read-only denial
- Technician own-visit scoping
- DST
- Cross-midnight
- Recurrence
- Recurrence duplicate prevention
- Cron missing secret
- Cron replay
- GHL sync idempotency
- Visit list and detail E2E
- Mobile calendar behavior

## Required documents

Create or update:

- `specs/dispatch-and-scheduling.md`
- `specs/visits.md`
- `database-blueprint/scheduling.md`
- `docs/architecture/decisions/ADR-0009-schedule-source-of-truth.md`
- `docs/operations/recurring-job-runbook.md`
- `qa/scheduling-test-plan.md`
- `memory/phase-4-dispatch-visits.md`

## Completion gate

Phase 4 is complete only when:

- The Visits page is no longer a placeholder
- Calendar and dispatch views work
- Multi-technician assignment works
- Recurring generation is durable and idempotent
- Schedule conflicts are surfaced
- Timezone behavior is tested
- GHL booking is not duplicated
- Tests and build pass


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 5 — Work-Order Expansion, Multi-Visit Projects, and Change Orders

## Prerequisite

Dispatch, visit administration, and scheduling must be complete.

## Objective

Expand work orders into a complete project-execution hub and implement first-class change orders.

## Required implementation

### Work-order project model

Support:

- Parent and child work orders
- Multi-day projects
- Multiple visits
- Multiple technicians
- Internal tasks
- Required checklist templates
- Auto-attachment rules
- Customer-visible notes
- Internal notes
- Attachments
- Schedule history
- Assignment history
- Status history
- Approved contract amount
- Approved add-ons
- Budget
- Actual cost
- Reopen/close
- Cancellation reason
- Archive

Do not hard-delete business work records.

### Work-order state machine

Define one authoritative state machine.

Include clear rules for:

- New
- Assigned
- Scheduled
- In progress
- On hold
- Estimate needed
- Follow-up needed
- Completed
- Closed
- Cancelled
- Archived

Use business rules and permissions for transitions.

### Checklists

Implement:

- Checklist templates
- Category/service rules
- Required items
- Conditional items
- Technician completion
- Admin review
- Completion metadata
- Versioning
- Immutable completed snapshot

### Completion requirements

Allow tenant-configured required fields before completion, such as:

- Checklist completion
- Photos
- Technician note
- Customer signature
- Equipment reading
- Time entry
- Material usage
- Completion reason

### Change orders

Implement a complete workflow:

- Tenant-safe change-order number
- Work-order/project link
- Version
- Reason
- Scope
- Pricebook/custom line items
- Cost impact
- Price impact
- Schedule impact
- Internal notes
- Customer notes
- Status
- Secure public link
- Expiry
- Accept
- Reject with reason
- Typed name/signature
- Approval metadata
- Lock after decision
- Admin override with reason and permission
- Immutable approval log
- Audit log

### Pending change-order rules

Enforce:

- Pending required change orders block final invoicing or closeout where configured
- Approved amount updates contract value
- Approved schedule impact updates project planning only through an explicit action
- Rejected change orders do not alter contract value
- Repeated submissions are idempotent

### Public change-order route

Use the same secure design principles as public estimates:

- Hashed token
- Expiry
- Revocation
- Rate limiting
- Replay protection
- Mobile-first
- Tenant branded
- No internal cost
- No internal notes
- Generic errors

### Completion reports

Upgrade PDF reports to include:

- Work-order identity
- Property
- Visits
- Technicians
- Checklist
- Photos
- Notes
- Time
- Materials
- Approved change orders
- Signatures where allowed
- Completion timestamp
- Tenant branding

Escape all values and enforce permissions.

## Required tests

Add:

- Parent/child authorization
- Multi-visit project
- State transitions
- Required completion fields
- Checklist snapshots
- Archive instead of delete
- Change-order totals
- Public token
- Approval replay
- Rejection replay
- Pending change-order invoicing block
- Contract value update
- Override permission/reason
- Cross-tenant denial
- PDF escaping

## Required documents

Create or update:

- `specs/work-order-projects.md`
- `specs/change-orders.md`
- `database-blueprint/change-orders.md`
- `docs/architecture/decisions/ADR-0010-work-order-project-model.md`
- `docs/architecture/decisions/ADR-0011-change-order-approval.md`
- `qa/change-order-test-plan.md`
- `memory/phase-5-work-orders-change-orders.md`

## Completion gate

Phase 5 is complete only when:

- Work orders support multiple visits and technicians
- Business records are archived instead of hard-deleted
- Change orders are secure and auditable
- Approved value updates safely
- Pending change orders are enforced
- Completion reports are accurate
- Tests and build pass


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 6 — Invoices, Stripe Connect Payments, Receipts, and Reconciliation

## Prerequisite

Estimate, work-order, and change-order models must be stable and tested.

## Objective

Complete the invoice UI and production-harden the existing Stripe direction.

Do not add another payment provider.

Use Stripe test mode throughout implementation unless the owner explicitly approves live actions.

## Required implementation

### Invoice lifecycle

Implement an authoritative state machine for:

- Draft
- Ready
- Sent
- Viewed
- Deposit due
- Partially paid
- Paid
- Overdue
- Void
- Refunded
- Credited where applicable

Consolidate existing conflicting invoice status models.

### Invoice sources

Support invoices created from:

- Accepted estimate
- Work order
- Approved change order
- Manual authorized entry
- Milestone/progress billing
- Final billing

Use immutable source snapshots.

### Invoice functionality

Implement:

- Tenant-safe number
- Customer/property snapshot
- Issue date
- Due date
- Terms
- Line items
- Tax
- Discount
- Deposit
- Partial payment
- Milestone/progressive invoices
- Final invoice
- Amount paid
- Amount due
- Notes
- Payment instructions
- PDF
- Manual send
- View history
- Void
- Refund
- Credit adjustment if required
- Aging
- Audit history

### Payment ledger

Create an immutable ledger.

Record:

- Payment ID
- Tenant
- Invoice
- Amount
- Currency
- Provider
- Provider account
- Provider intent/session/charge
- Status
- Failure
- Refund
- Timestamps
- Idempotency key
- Event source
- Reconciliation status

Do not store full card data.

### Stripe Connect

Complete:

- Tenant onboarding
- Account status
- Charges enabled
- Requirements due
- Safe admin UI
- Checkout/payment session creation
- Connected account validation
- Server-owned amount
- Server-owned currency
- Server-owned invoice ID
- Metadata verification
- Test mode
- Webhook endpoint
- Event idempotency
- Replay handling
- Retry and dead-letter
- Refund path
- Reconciliation job
- Integration health

### Webhook processing

For every event:

- Verify signature
- Store event receipt
- Check duplicate
- Resolve connected account
- Resolve tenant
- Resolve invoice
- Verify expected amount/currency
- Apply valid transition transactionally
- Write ledger
- Write audit log
- Record success/failure
- Return generic response

### Public invoice and payment route

Implement:

- Secure token
- Hashed at rest
- Expiry/revocation where appropriate
- Rate limit
- Tenant branding
- Invoice view
- Payment history
- Pay deposit
- Pay balance
- Receipt
- Generic errors
- No internal notes or costs

### Manual sending

Implement preview and test-recipient controls.

Real customer sending remains an approval gate.

### Financial immutability

Do not hard-delete:

- Invoices
- Payments
- Refunds
- Receipts
- Approval records

Use void/refund/credit paths.

### Reconciliation

Create:

- Scheduled or admin-triggered reconciliation
- Missing event detection
- Provider status check
- Amount mismatch alert
- Connected-account mismatch alert
- Retry
- Admin resolution reason
- Audit trail

## Required tests

Add:

- Invoice state machine
- Tenant-safe numbering concurrency
- Source snapshot immutability
- Server-owned totals
- Forged client amount
- Forged Stripe metadata
- Wrong connected account
- Wrong currency
- Duplicate webhook
- Out-of-order webhook
- Partial payment
- Refund
- Void
- Reconciliation mismatch
- Public token
- Cross-tenant invoice
- Rate limiting
- PDF escaping
- Audit events

Use Stripe test fixtures or mocks. Do not charge a live card.

## Required documents

Create or update:

- `specs/invoices-and-payments.md`
- `database-blueprint/payments.md`
- `docs/architecture/decisions/ADR-0012-payment-ledger.md`
- `docs/architecture/decisions/ADR-0013-stripe-connect.md`
- `docs/operations/stripe-runbook.md`
- `qa/payments-test-plan.md`
- `memory/phase-6-invoices-payments.md`

## Completion gate

Phase 6 is complete only when:

- Invoice UI is complete
- Financial state models are consolidated
- Payments are ledger-backed
- Stripe processing is idempotent
- Amount and tenant verification are server-side
- Public payment flow is secure
- Refund/void paths exist
- Reconciliation exists
- No live charge was made
- Tests and build pass


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 7 — Secure Tenant-Branded Customer Portal

## Prerequisite

Estimates, change orders, invoices, and payments must be complete and secure.

## Objective

Create a customer-facing portal as a responsive PWA/web experience.

Do not build conversations, AI chat, marketing automation, or a duplicate booking engine.

## Required implementation

### Portal identity and authorization

Design and implement:

- Portal customer identity
- Organization membership
- Property access
- Multi-property access
- Session revocation
- Expiring magic links or secure passwordless flow
- Hashed tokens at rest
- One-time token consumption
- Rate limiting
- Generic errors
- Account deactivation
- Audit events

Do not allow a contact to infer or access another customer’s property, estimate, invoice, or work history.

### Portal navigation

Build:

- Overview
- Properties
- Estimates
- Change orders
- Work history
- Invoices
- Payments
- Receipts
- Documents
- Profile
- Security
- Sign out

When booking is needed, provide a tenant-configured deep link to the approved GHL booking experience.

### Portal content

Customers may view only approved customer-facing data:

- Property summary
- Estimate/proposal
- Estimate decisions
- Change orders
- Work-order status summary
- Completed visit history
- Approved photos
- Completion reports
- Invoices
- Payment history
- Receipts
- Documents

Never expose:

- Internal costs
- Employee pay
- Internal notes
- GHL private metadata
- Tenant IDs
- Audit internals
- Secrets
- Other customers

### Portal actions

Support:

- Accept/decline estimates
- Accept/reject change orders
- Pay invoices/deposits
- Download receipts
- Download approved reports
- Update basic profile
- Revoke own sessions
- Sign out

Reuse the secure transactional approval paths. Do not duplicate business logic in portal UI routes.

### Branding

Use tenant-configured:

- Logo
- Company name
- Colors
- Contact information
- Legal footer
- Terms
- Support link

Ensure accessible contrast even with tenant colors.

### Portal PWA

Implement:

- Portal-specific install start behavior
- Correct manifest handling
- No technician-route start URL
- Safe cache policy
- Logout cache clearing
- Update UI
- Mobile-first cards
- Accessible navigation

Do not cache sensitive documents indefinitely.

### Portal administration

Tenant admins should be able to:

- Invite/enable portal user
- Revoke portal access
- Review access history
- See last login
- See linked properties
- Resend secure invite
- Revoke sessions

Every action must be audited.

## Required tests

Add:

- Portal invitation
- Magic-link replay
- Token expiry
- Session revocation
- Cross-customer denial
- Cross-tenant denial
- Multi-property authorized access
- Internal-field redaction
- Estimate decision
- Change-order decision
- Payment
- Receipt
- Logout cache clearing
- Rate limiting
- Mobile E2E
- Accessibility checks

## Required documents

Create or update:

- `specs/customer-portal.md`
- `database-blueprint/customer-portal.md`
- `docs/architecture/decisions/ADR-0014-customer-portal-authentication.md`
- `docs/security/portal-security.md`
- `qa/customer-portal-test-plan.md`
- `memory/phase-7-customer-portal.md`

## Completion gate

Phase 7 is complete only when:

- Portal authorization is property/customer scoped
- Tokens are hashed and one-time
- Sessions can be revoked
- Estimates/change orders/payments reuse secure server logic
- Internal data is never exposed
- Tenant branding is accessible
- Portal PWA behavior is safe
- Tests and build pass


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 8 — Technician Mobile PWA, Offline Work, and Sync Reliability

## Prerequisite

Visits, scheduling, work orders, and secure file handling must be complete.

## Objective

Turn the technician mobile experience into a production-grade installable PWA that remains usable during unreliable field connectivity.

Do not build a native mobile app.

## Required implementation

### PWA architecture

Implement:

- Correct manifest
- Role-aware start routing
- 192 and 512 icons
- Maskable icon
- Apple touch icon
- Screenshots
- Shortcuts
- Standalone display
- Service-worker versioning
- Update-available UI
- Controlled activation
- Install instructions for Android and iOS
- Lighthouse PWA compliance

### Safe caching

Define explicit caching rules.

Allowed:

- Static assets
- Application shell
- Limited assigned-job data required by the authenticated technician
- Tenant branding
- Checklist templates needed for assigned work

Forbidden:

- Broad authenticated HTML caching
- Cross-user cache reuse
- Whole-tenant datasets
- Secrets
- Payment pages
- Admin pages
- Sensitive reports

Clear sensitive caches on:

- Logout
- Session expiry
- Role change
- Tenant change
- User deactivation
- App version requiring data migration

### Offline data store

Implement an offline store for:

- Assigned visits
- Property access information needed for the visit
- Checklist state
- Draft notes
- Time entries
- Mileage
- Status changes
- Photo upload queue
- Completion draft
- Idempotency keys
- Sync status

Use schema versioning.

### Offline mutation outbox

Each queued action must include:

- Client mutation ID
- User
- Tenant
- Resource
- Expected version
- Payload schema version
- Created time
- Attempt count
- Last error
- Sync state

Server processing must be idempotent.

### Conflict handling

Implement visible conflict states for:

- Assignment changed
- Visit rescheduled
- Work order closed
- Checklist version changed
- Another user edited the record
- Session invalid
- Permission changed

Never silently discard field work.

Allow:

- Review
- Retry
- Merge where safe
- Save as draft
- Contact office

### Technician workflow

Optimize for one hand:

- Today
- Assigned
- Overdue
- Route
- Job detail
- Access notes
- Checklist
- Photos
- Notes
- Clock in/out
- Break
- Mileage
- Materials used
- Estimate-needed
- Follow-up
- Complete
- Sync status
- Profile
- Sign out

Use minimum 44×44 touch targets.

### Photos offline

Support:

- Camera/gallery
- Local preview
- Pending upload
- Retry
- Safe server validation
- Duplicate prevention
- Clear failure state
- Storage cleanup

Do not claim upload is complete until the server confirms it.

### Security

- Scope offline data to the signed-in technician
- Clear it on logout/session invalidation
- Do not store tokens in insecure browser storage
- Avoid unnecessary PII
- Do not rely on local encryption as authorization
- Revalidate permissions on every sync

## Required tests

Add:

- Installability
- Manifest
- Service-worker update
- Offline shell
- Offline job open
- Offline checklist
- Offline notes
- Offline time
- Offline mileage
- Offline photo queue
- Reconnect sync
- Duplicate mutation
- Conflict
- Session expiry
- Role change
- Logout cache clearing
- Cross-user cache leakage
- Mobile viewport
- Accessibility
- Lighthouse

Test on simulated iPhone and Android viewports and document actual-device testing still required if devices are unavailable.

## Required documents

Create or update:

- `specs/technician-pwa.md`
- `docs/architecture/offline-sync.md`
- `docs/architecture/decisions/ADR-0015-offline-outbox-and-conflicts.md`
- `docs/operations/pwa-release-runbook.md`
- `qa/pwa-mobile-test-plan.md`
- `memory/phase-8-technician-pwa.md`

## Completion gate

Phase 8 is complete only when:

- PWA is installable
- Offline assigned work is available
- Offline mutations are durable and idempotent
- Conflicts are visible
- Sensitive caches clear correctly
- Photos have pending/retry states
- No field work is silently lost
- Tests and build pass


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 9 — Time, Mileage, Expenses, Approvals, and Job Costing

## Prerequisite

Work orders, visits, pricebook, invoices, and technician PWA must be stable.

## Objective

Implement operational cost capture and job profitability.

Do not expose employee pay or internal cost data to unauthorized roles.

## Required implementation

### Time tracking

Implement:

- Visit clock in
- Visit clock out
- Breaks
- Travel time
- Manual time entry
- Edit request
- Approval
- Rejection
- Correction reason
- Audit history
- Offline queue support
- Duplicate prevention
- Overlap detection

### Mileage

Implement:

- Start/end odometer or manual distance
- Visit/work-order link
- Date
- Technician
- Approval
- Correction
- Audit
- Offline support

Only add continuous GPS tracking if separately approved with a clear consent and privacy policy.

### Expenses

Implement categories:

- Labor
- Materials
- Equipment
- Subcontractor
- Permit
- Mileage
- Other

Support:

- Work order
- Visit
- Vendor
- Amount
- Tax
- Date
- Description
- Receipt
- Submitted by
- Approval
- Rejection reason
- Correction
- Archive
- Audit history

Use secure receipt upload.

### Cost rates

Implement controlled access to:

- Technician cost rate
- Pay rate if required
- Material cost
- Equipment cost
- Subcontractor cost

Separate financial permissions from operations permissions.

### Budget and actual

Support:

- Estimate budget
- Approved change-order budget
- Labor budget
- Materials budget
- Other budget
- Actual costs
- Committed costs
- Approved add-ons
- Revenue
- Amount invoiced
- Amount collected
- Gross profit
- Gross margin
- Job health

Define formulas centrally and test them.

### Approval workflow

Implement:

- Time correction approval
- Expense approval
- Mileage approval
- Optional manager approval thresholds
- Reason
- Audit event
- Notification inside the app
- No autonomous external messaging

### Job-costing UI

Build:

- Work-order cost summary
- Budget vs actual
- Category breakdown
- Time entries
- Expenses
- Mileage
- Materials
- Profitability
- Permission-aware display
- Export where authorized
- Mobile and desktop

### Reporting integration

Expose aggregated data for Phase 10 reports.

## Required tests

Add:

- Time overlap
- Duplicate clock-in
- Offline time replay
- Approval permissions
- Cost visibility
- Cross-tenant denial
- Expense calculation
- Receipt ownership
- Budget formula
- Gross profit
- Gross margin
- Change-order budget impact
- Partial invoice revenue
- Refund impact
- Read-only behavior
- Audit events

## Required documents

Create or update:

- `specs/time-mileage-expenses.md`
- `specs/job-costing.md`
- `database-blueprint/job-costing.md`
- `docs/architecture/decisions/ADR-0016-job-costing-formulas.md`
- `qa/job-costing-test-plan.md`
- `memory/phase-9-job-costing.md`

## Completion gate

Phase 9 is complete only when:

- Time, mileage, and expenses are captured
- Corrections require approval
- Job costing is accurate
- Financial visibility is permissioned
- Receipts are secure
- Offline entries sync safely
- Tests and build pass


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 10 — Reporting, Platform Administration, Tenant Health, and White-Label Readiness

## Prerequisite

All operational and financial modules must be complete.

## Objective

Complete role-aware reporting and platform administration for multi-tenant SaaS operation.

Do not add an integration marketplace or unrelated marketing functionality.

## Required implementation

### Reporting architecture

Use server-side aggregation, pagination, and indexed queries.

Add role-aware reports for:

- Work-order status
- Visit completion
- On-time arrival
- Technician utilization
- Technician productivity
- Schedule capacity
- Recurring completion
- Estimate funnel
- Estimate conversion
- Change-order value
- Invoice aging
- Deposits due
- Payments collected
- Revenue
- Job cost
- Gross profit
- Gross margin
- Expenses
- Labor
- Service category
- Property history
- Customer operational history
- Failed webhooks
- Outbox/dead-letter queue
- Audit events
- Tenant health

### Report security

Implement:

- Tenant scope
- Permission scope
- Financial-report restrictions
- Employee-cost restrictions
- Sensitive report access audit
- Export permissions
- Rate limits
- Timezone correctness
- Date-range validation
- Large-range limits
- Export background processing if needed

### Dashboard

Create role-specific dashboards:

- Platform owner
- Tenant admin
- Dispatcher
- Estimator
- Accountant
- Technician
- Read-only owner

Do not show irrelevant data.

### Platform owner administration

Implement:

- Tenant list
- Tenant status
- Plan/feature flags
- User count
- Storage usage where available
- Webhook health
- Payment health
- Queue health
- Migration version
- Last deployment record
- Security events
- Support access

### Support access

If support impersonation is implemented:

- Require reason
- Require permission
- Time limit
- Visible banner
- No silent impersonation
- Audit every action
- Restrict financial and destructive operations unless explicitly elevated

### Tenant settings and white label

Support:

- Company name
- Logo
- Colors
- Contact information
- Timezone
- Legal footer
- Portal branding
- PDF branding
- Email branding
- Feature flags

Validate color contrast.

### Feature flags

Implement tenant-scoped flags for staged rollout.

Audit changes.

Do not use flags to bypass security or migrations.

### Usage and limits

Provide safe counters for:

- Users
- Technicians
- Work orders
- Storage
- Portal users
- Reports
- Webhooks
- Payments

Do not implement billing changes without approval.

## Required tests

Add:

- Report tenant scope
- Financial permission
- Employee-cost permission
- Export rate limit
- Large date range
- Timezone
- Platform-owner cross-tenant access
- Tenant-admin denial across tenants
- Feature flag
- Support access audit
- Branding contrast
- Dashboard role differences
- Queue-health display

## Required documents

Create or update:

- `specs/reporting.md`
- `specs/platform-administration.md`
- `docs/architecture/decisions/ADR-0017-reporting-aggregation.md`
- `docs/security/support-access.md`
- `qa/reporting-test-plan.md`
- `memory/phase-10-reporting-platform-admin.md`

## Completion gate

Phase 10 is complete only when:

- Operational and financial reports work
- Report permissions are correct
- Platform tenant health is visible
- Support access is safe or explicitly omitted
- White-label settings propagate correctly
- Feature flags are audited
- Tests and build pass


---

# ServiceOps Command Center — Claude Code Phase Prompt

## Repository

`https://github.com/operations148/ShowtimeServiceCommandOps`

## Non-negotiable rules for every phase

You are modifying an existing production SaaS platform. **Do not rebuild the application from scratch.**

Before changing code in this phase:

1. Read `CLAUDE.md`, `MEMORY.md`, `HANDOFF.md`, `README.md`, `ROADMAP.md`, `PRODUCT_BRIEF.md`, and the latest phase report.
2. Read all files directly related to this phase, including API routes, database queries, migrations, types, validation schemas, components, tests, and documentation.
3. Inspect the latest Git history so older documentation does not override newer code.
4. Reuse working architecture and components whenever safe.
5. Preserve GHL as the source of truth for CRM contacts, lead pipelines, conversations, marketing automation, forms, and primary booking.
6. Do not add AI voice reception, Conversation AI, autonomous customer messaging, marketing automation, Shopify, Slack, an integration marketplace, or a native mobile application.
7. Keep all tenant-owned data tenant-scoped. Never use a hardcoded tenant fallback.
8. Enforce permissions on the server. UI visibility alone is never authorization.
9. Use strict TypeScript and Zod validation. Do not add `any` unless an unavoidable external boundary is isolated and documented.
10. Add additive Supabase migrations. Do not rewrite applied production migrations.
11. Add or update automated tests for every material behavior.
12. Update `MEMORY.md`, `HANDOFF.md`, relevant docs, and the phase report before finishing.
13. Do not deploy, apply production migrations, alter live credentials, send real customer communication, charge real payment methods, merge to production, or delete production data without explicit approval.

## Branch and execution discipline

Work on a dedicated feature branch. Use small commits grouped by concern. Do not start a later phase until this phase's quality gates pass.

At the beginning, report:

- Current branch and commit
- Files inspected
- Existing implementation relevant to this phase
- Risks and contradictions found
- Exact implementation plan

At the end, report:

- Features completed
- Files changed
- Migrations added
- Tests added
- Commands run and results
- Security checks completed
- Remaining risks
- External approval required
- Exact next phase prompt to run


# Phase 11 — Production Readiness, Security Verification, Backup, Retention, and Deployment Preparation

## Prerequisite

All approved feature phases must be complete.

## Objective

Perform the final production-readiness pass.

Do not deploy or apply production migrations without explicit owner approval.

## Required work

### Full regression

Run:

- Clean install
- Format check
- Lint
- Typecheck
- Unit tests
- Integration tests
- E2E tests
- Security tests
- Production build
- Migration validation
- Dependency audit
- Secret scan
- Static analysis
- Accessibility checks
- Lighthouse
- PWA tests

Fix all failures or document approved exceptions with owner, reason, severity, and mitigation.

### Multi-tenant verification

Create at least two test tenants.

Verify:

- No cross-tenant reads
- No cross-tenant writes
- No cross-tenant file access
- No public-token cross-tenant access
- Platform-owner behavior
- Tenant-admin isolation
- Technician assignment isolation
- Customer portal isolation
- Reporting isolation
- Webhook tenant mapping
- Stripe connected-account mapping

### Permission review

Review every role and permission.

Test:

- Platform Owner
- Tenant Admin
- Dispatcher/Office
- Estimator/Sales
- Accountant
- Technician
- Read-Only Owner
- Customer Portal User

Produce a signed-off permission matrix.

### Security checklist

Verify:

- Authentication
- MFA status
- Session revocation
- Multi-tenant isolation
- Organization authorization
- RBAC
- API protection
- CSRF
- CORS
- XSS
- CSP
- SQL injection protection
- Schema validation
- Public output validation
- Webhook verification
- Rate limiting
- Secret management
- No committed secrets
- Audit logs
- Approval logs
- Deployment logs
- Admin logs
- Error logging
- Secure files
- Least privilege
- Encryption in transit
- Encryption at rest where supported
- Dependency scanning

Mark:

- Slack signature verification: `N/A — integration excluded`
- Shopify webhook verification: `N/A — integration excluded`

### Audit-event verification

Confirm required logs exist for:

- User invitation
- Role change
- Integration credential change
- Estimate approval/rejection
- Change-order approval/rejection
- Invoice/payment/refund
- Work-order override
- File upload/delete
- Time/expense correction
- Data export
- Tenant settings
- Feature flags
- Deployment
- Migration
- Support access

Confirm reserved future actions exist in the taxonomy without unrelated modules being built:

- AI copy approval
- Copy rejection
- Shopify publish
- Theme asset update
- Experiment launch
- Analytics tracking key creation
- Brand compliance rule change

### Backup and restore plan

Document:

- Supabase database backup
- Storage backup
- Encryption
- Point-in-time recovery availability
- Backup frequency
- Retention
- Backup owner
- Restore procedure
- Restore test
- Proposed RPO
- Proposed RTO
- Incident contacts

Do not claim a restore test passed unless it was actually executed in a safe environment.

### Data retention

Create a configurable proposal for:

- Financial records
- Audit logs
- Operational records
- Files
- Application logs
- Security logs
- Webhook payloads
- Soft-deleted records
- Expired tokens
- Portal sessions

Mark defaults as pending business/legal approval where appropriate.

### Deployment pipeline

Verify CI/CD stages:

- Local
- Test
- Preview
- Staging
- Production

Create a deployment runbook containing:

- Approved commit
- CI status
- Backup confirmation
- Migration dry run
- Migration order
- Environment validation
- Secret review
- Feature-flag plan
- Smoke tests
- Webhook test plan
- Stripe test-mode plan
- PWA update test
- Monitoring
- Rollback or forward fix
- Sign-off

### Migration rehearsal

In a non-production environment:

- Apply migrations from a production-like baseline
- Verify schema
- Run backfills in dry-run and apply mode
- Run application tests
- Verify rollback or forward-fix procedure
- Record timing and risks

### Performance

Measure:

- Core dashboard
- Work-order list/detail
- Calendar
- Technician PWA
- Customer portal
- Estimate public page
- Invoice public page
- Reports
- Uploads
- Webhook processing

Fix material issues.

### Final documentation

Create or update:

- `docs/production-readiness-checklist.md`
- `docs/operations/backup-and-restore.md`
- `docs/operations/data-retention.md`
- `docs/operations/monitoring-and-alerting.md`
- `docs/operations/deployment-runbook.md`
- `docs/operations/rollback-runbook.md`
- `docs/security/final-security-review.md`
- `qa/final-regression-report.md`
- `qa/permission-review.md`
- `qa/tenant-isolation-final-report.md`
- `CHANGELOG.md`
- `README.md`
- `CLAUDE.md`
- `MEMORY.md`
- `HANDOFF.md`
- `memory/phase-11-production-readiness.md`

## Final handoff

Provide:

1. Executive summary
2. Final architecture
3. Feature matrix
4. Security matrix
5. Migrations
6. API changes
7. UI/PWA changes
8. Audit events
9. Tests and results
10. Dependency and secret scan results
11. Known limitations
12. Environment variables
13. Backup and retention summary
14. Deployment steps
15. Rollback steps
16. Production approval checklist
17. Deferred items
18. Exact owner approval required

## Completion gate

Phase 11 is complete only when:

- All quality gates pass
- Multi-tenant tests pass
- Permission review is complete
- Security checklist is complete
- Backup/retention plans exist
- Migration rehearsal is documented
- Staging smoke tests pass when staging exists
- Deployment and rollback runbooks are complete
- No production action was taken without approval

Stop and request explicit approval for the exact production migration/deployment actions. Do not execute them automatically.
