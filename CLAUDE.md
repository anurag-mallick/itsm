# ITSM Platform — AI Developer Context (CLAUDE.md)

> **Purpose:** This file gives AI coding assistants (Claude Code, Cursor, Copilot, etc.) complete context
> about what has been built, what is pending, known bugs, and architecture decisions.
> Read this before making any code changes.

---

## Project Overview

**Bluspring Enterprises** internal ITSM (IT Service Management) platform.
Full-stack web application. All data on-premises, no cloud dependency.

```
Root: d:\Coder\itsm\
├── backend/        Django 5.1 + DRF 3.15.2 + PostgreSQL 16 + Celery
└── frontend/       React 18 + TypeScript + Vite + Ant Design 5
```

**Local dev:** SQLite, Django `runserver` on port 8000, Vite on port 3000
**Production:** Docker Compose, PostgreSQL, Redis, Nginx (HTTPS)

---

## How to Run Locally

```powershell
# Backend (Windows PowerShell)
cd d:\Coder\itsm\backend
$env:DJANGO_SETTINGS_MODULE = "config.settings.local"
.\venv\Scripts\python manage.py runserver 8000

# Frontend (separate terminal)
cd d:\Coder\itsm\frontend
npm run dev
```

**Login:** `admin@helpdesk.local` / `Admin@ITSM2025!`

---

## Architecture — Backend

### Settings Hierarchy
```
config/settings/
  base.py          ← shared settings (DB, Celery, email, JWT, security)
  local.py         ← SQLite, no Redis, CELERY_TASK_ALWAYS_EAGER=True
  production.py    ← security hardening, HTTPS headers
```

### Critical Patterns

**User model:** `apps.accounts.User` — UUID PK, email login, role FK, account_type (staff/guest).
`AUTH_USER_MODEL = 'accounts.User'`

**AuditLog:** `apps.audit.AuditLog` — immutable (save() raises PermissionError if pk exists).
Use `AuditLog.log(user, action, module, record_id, ...)` classmethod everywhere.
`action` constants: `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`.

**Custom managers on Ticket and HardwareAsset:**
- `.objects` → excludes archived
- `.archived` → only archived
- `.all_records` → unfiltered (use for archive/unarchive endpoints)

**API response shape for user fields (FLAT, not nested):**
```python
# Tickets serializer returns:
requestor          # UUID string
requestor_email    # str | null
requestor_name     # str | null
assignee           # UUID | null
assignee_email     # str | null
assignee_name      # str | null

# Changes serializer returns:
reporter, reporter_email, reporter_full_name
assignee, assignee_email, assignee_full_name

# Assets serializer returns:
assigned_to, assigned_to_email, assigned_to_name
```
**IMPORTANT:** Never use `record.requestor.full_name` — use `record.requestor_name`.

**Permission classes** (`apps/accounts/permissions.py`):
- `IsSuperAdmin`, `IsITManager`, `IsITAgent`, `IsRequestor`, `IsAuditor`

---

## Installed Apps (all registered in INSTALLED_APPS)

| App | Purpose |
|-----|---------|
| `apps.accounts` | Users, roles, JWT auth, password reset, rate limiting, lockout |
| `apps.audit` | Immutable audit log, CSV export |
| `apps.custom_fields` | JSONB custom field schemas per module |
| `apps.tickets` | Tickets, categories, comments, canned responses, SLA |
| `apps.assets` | Hardware assets, sites, QR codes, asset acceptance workflow |
| `apps.software` | Software licenses, installations, seat management, events |
| `apps.email_processor` | IMAP/POP3 polling → auto-ticket creation |
| `apps.teams_bot` | Azure Bot Framework webhook (Teams integration) |
| `apps.system_config` | DB-stored SMTP/IMAP/Teams config (editable from UI) |
| `apps.reports` | Dashboard stats, ticket/asset reports, calendar events, global search, meta/choices |
| `apps.changes` | Change management (Jira-style), sprints |
| `apps.access_requests` | Hardware/software access request workflow with manager approval |
| `apps.notifications` | In-app notification bell |
| `apps.discovery` | Network asset discovery (ping, SNMP, SSH, port scan) |
| `apps.catalog` | Service catalog — users request IT services |
| `apps.knowledge` | Knowledge base — articles with categories |
| `apps.problems` | Problem management — links tickets to root causes |

---

## API Endpoints Reference

### Auth
```
POST /api/auth/login/
POST /api/auth/logout/
POST /api/auth/token/refresh/
GET  /api/auth/me/
POST /api/auth/change-password/
POST /api/auth/password-reset/request/
POST /api/auth/password-reset/confirm/
```

### Users & Roles
```
GET  /api/users/?page_size=200
POST /api/users/
GET/PATCH /api/users/{id}/
GET  /api/roles/
GET  /api/users/{id}/assets/          ← all hardware+software for a user
POST /api/users/{id}/deallocate-assets/  ← offboarding bulk deallocation
```

### Tickets
```
GET/POST /api/tickets/
GET      /api/tickets/archived/
GET/PATCH /api/tickets/{id}/
POST     /api/tickets/{id}/assign/      body: {user_id}
POST     /api/tickets/{id}/status/      body: {status}
POST     /api/tickets/{id}/archive/     body: {reason}
POST     /api/tickets/{id}/unarchive/   body: {reason}
GET/POST /api/tickets/{id}/comments/
GET/POST /api/categories/
GET/POST /api/canned-responses/
```

### Tickets — Public Portal
```
GET  /api/portal/categories/
POST /api/portal/submit/   ← no auth, creates guest ticket
GET  /api/portal/status/{ticket_number}/?email=
```

### Assets
```
GET/POST /api/assets/hardware/
GET      /api/assets/hardware/archived/
GET      /api/assets/hardware/warranty-alerts/
GET/PATCH /api/assets/hardware/{id}/
POST     /api/assets/hardware/{id}/status/
POST     /api/assets/hardware/{id}/assign/    body: {user_id | null}
POST     /api/assets/hardware/{id}/archive/
GET      /api/assets/hardware/{id}/qr/        ← QR + barcode base64
GET/POST /api/assets/hardware/{id}/accept/    ← public acceptance
POST     /api/assets/hardware/{id}/accept/action/?token= ← user accepts/rejects
GET/POST /api/sites/
```

### Software
```
GET/POST /api/software/licenses/
GET      /api/software/licenses/compliance/
GET      /api/software/licenses/expiry-alerts/
GET/PATCH/DELETE /api/software/licenses/{id}/
GET      /api/software/licenses/{id}/timeline/
GET      /api/software/licenses/{id}/assigned-users/
GET/POST /api/software/licenses/{id}/installations/
DELETE   /api/software/installations/{id}/
GET/POST /api/software/seat-requests/
POST     /api/software/seat-requests/{id}/approve/
```

### Changes & Sprints
```
GET/POST /api/changes/
GET      /api/changes/kanban/
GET      /api/changes/archived/
GET/PATCH /api/changes/{id}/
POST     /api/changes/{id}/assign/
POST     /api/changes/{id}/status/
GET/POST /api/changes/{id}/comments/
POST     /api/changes/{id}/archive/
POST     /api/changes/{id}/sprint/    body: {sprint_id | null}
GET/POST /api/sprints/
POST     /api/sprints/{id}/start/
POST     /api/sprints/{id}/complete/
GET      /api/sprints/{id}/changes/
```

### Access Requests
```
GET/POST /api/access-requests/
GET      /api/access-requests/review/{id}/?token=   ← public manager review
POST     /api/access-requests/review/{id}/?token=   ← body: {action: approve|reject, notes}
GET      /api/access-requests/{id}/
POST     /api/access-requests/{id}/assign/          ← IT assigns asset/license
POST     /api/access-requests/{id}/cancel/
```

### Notifications
```
GET  /api/notifications/?unread=true
GET  /api/notifications/unread-count/
POST /api/notifications/{id}/read/
POST /api/notifications/read-all/
```

### Reports, Search, Meta
```
GET /api/reports/dashboard/
GET /api/reports/tickets/
GET /api/reports/assets/
GET /api/calendar/events/?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/search/?q=text
GET /api/meta/choices/           ← all enum choices for all modules
GET /api/audit/?module=&record_id=&action=&from_date=&to_date=
GET /api/audit/export/?format=csv&...
```

### Discovery
```
GET/POST /api/discovery/scans/
GET      /api/discovery/scans/{id}/        ← includes devices
POST     /api/discovery/devices/{id}/import/
POST     /api/discovery/devices/{id}/ignore/
```

### Service Catalog
```
GET  /api/catalog/public/              ← AllowAny
GET  /api/catalog/public/{id}/         ← AllowAny
GET/POST /api/catalog/requests/
GET  /api/catalog/requests/{id}/
POST /api/catalog/requests/{id}/status/
GET/POST /api/catalog/items/           ← IT Manager admin
GET/PATCH/DELETE /api/catalog/items/{id}/
GET  /api/catalog/categories/
```

### Knowledge Base
```
GET  /api/knowledge/public/?search=&category=    ← AllowAny
GET  /api/knowledge/public/{slug}/               ← AllowAny (increments view_count)
GET  /api/knowledge/search/?q=                  ← AllowAny
GET  /api/knowledge/categories/                 ← AllowAny
GET/POST /api/knowledge/articles/               ← IsITAgent
GET/PATCH/DELETE /api/knowledge/articles/{id}/
POST /api/knowledge/articles/{id}/vote/          ← AllowAny, body: {vote: yes|no}
```

### Problem Management
```
GET/POST /api/problems/
GET/PATCH /api/problems/{id}/
POST /api/problems/{id}/link-ticket/    body: {ticket_id}
POST /api/problems/{id}/unlink-ticket/  body: {ticket_id}
```

---

## Frontend Routes

| Route | Component | Auth |
|-------|-----------|------|
| `/login` | Login | Public |
| `/reset-password?token=` | ResetPassword | Public |
| `/privacy-policy` | PrivacyPolicy | Public |
| `/portal` | GuestPortal | Public |
| `/access-requests/review/:id?token=` | ManagerApproval | Public |
| `/assets/accept/:assetId?token=` | AssetAcceptance | Public |
| `/` | Dashboard | Auth |
| `/tickets` | TicketList | Auth |
| `/tickets/new` | CreateTicket | Auth |
| `/tickets/:id` | TicketDetail | Auth |
| `/access-requests` | AccessRequestList | Auth |
| `/access-requests/:id` | AccessRequestDetail | Auth |
| `/changes` | ChangeList | Auth |
| `/changes/new` | CreateChange | Auth |
| `/changes/:id` | ChangeDetail | Auth |
| `/sprints` | SprintList | Auth |
| `/sprints/:id` | SprintBoard | Auth |
| `/calendar` | CalendarView | Auth |
| `/assets/hardware` | HardwareList | Auth |
| `/assets/hardware/:id` | HardwareDetail | Auth |
| `/assets/software` | SoftwareList | Auth |
| `/catalog` | ServiceCatalog | Auth |
| `/knowledge` | KnowledgeBase | Auth |
| `/knowledge/:slug` | KnowledgeBase | Auth |
| `/problems` | ProblemList | Auth |
| `/problems/:id` | ProblemDetail | Auth |
| `/discovery` | DiscoveryPage | Auth |
| `/audit` | AuditLogViewer | Auth |
| `/settings/users` | UserManagement | IT Manager+ |
| `/settings/categories` | Categories | IT Manager+ |
| `/settings/custom-fields` | CustomFields | IT Manager+ |
| `/settings/canned-responses` | CannedResponses | IT Manager+ |
| `/settings/email` | EmailConfig | Super Admin |
| `/settings/teams` | TeamsConfig | Super Admin |
| `/profile` | UserProfile | Auth |
| `/profile/password` | ChangePassword | Auth |
| `/scan/:token` | ScanLanding | Auth |

---

## Frontend API Contract Rules

**CRITICAL — always follow these:**

1. All user fields in API responses are FLAT:
   - Use `record.requestor_name`, NOT `record.requestor.full_name`
   - Use `record.assignee_email`, NOT `record.assignee.email`
   - Only `GET /api/users/` returns nested `{id, email, full_name}` objects

2. Paginated responses: always `{count: number, results: T[]}`. Extract with `data.results ?? []`

3. Axios client has `baseURL: '/api'`. Use `/tickets/` not `/api/tickets/`

4. Auth: JWT stored in `localStorage`. `client.ts` handles refresh automatically.

5. Avatar initials: always use `(name || email || '?').charAt(0).toUpperCase()`

---

## Known Bugs

| # | File | Issue | Status |
|---|------|-------|--------|
| B1 | `apps/tickets/views.py` | Fixed — CommentCreateSerializer.create() was double-passing `ticket` | ✅ Fixed |
| B2 | `apps/audit/models.py` | Fixed — UUID PKs set before save(), used `_state.adding` instead of `if self.pk` | ✅ Fixed |
| B3 | `HardwareList.tsx` | Fixed — `assigned_to.full_name` on UUID string → use flat fields | ✅ Fixed |
| B4 | `TicketList.tsx` mid-file import | Fixed — moved imports to top of file | ✅ Fixed |
| B5 | Categories API returns paginated format | Fixed — frontend handles `data.results ?? []` | ✅ Fixed |
| B6 | `SystemConfig.update()` used bulk `.update()` — no audit trail | Fixed — per-key loop with AuditLog | ✅ Fixed |
| B7 | SLA `sla_due_at` never set | Fixed — `Ticket.save()` auto-calculates from category | ✅ Fixed |
| B8 | `settings/*.tsx` double `/api/` prefix | Fixed — removed prefix from all Settings pages | ✅ Fixed |
| B9 | Audit logs for comments stored with comment UUID not ticket UUID | Fixed — `CommentListCreateView.perform_create` now stores ticket's UUID | ✅ Fixed |
| B10 | Email notifications not sent on comment (console backend active) | Fixed — switched to real SMTP backend (`mail.bluspring.in:465 SSL`) | ✅ Fixed |
| B11 | Email task failure caused 500 on comment API | Fixed — `CELERY_TASK_EAGER_PROPAGATES=False` in local settings | ✅ Fixed |
| B12 | Email attachments: only images/PDFs accepted | Fixed — all file types accepted except executables; 25 MB limit | ✅ Fixed |

---

## Pending Tasks

### Email Configuration (live — iRedMail)
- **Inbound IMAP**: `testsupport@bluspring.in` on `mail.bluspring.in:993` SSL — polls every 30 seconds automatically
- **Outbound SMTP**: `testsupport@bluspring.in` on `mail.bluspring.in:465` SSL/TLS
- **Auto-polling**: Background thread in `EmailProcessorConfig.ready()` — starts 15s after Django boot
- **Attachments**: All file types from email are saved as ticket attachments (except executables, max 25 MB)

### P1 — High Priority
- [ ] **KB articles seed data** — knowledge base is empty. Add 5-10 sample articles via `setup_demo_data`
- [ ] **Service Catalog public endpoint** — currently returns 3 categories but no items visible via public API (form_fields need testing end-to-end)
- [ ] **Discovery scan on Windows** — `ping_host()` subprocess may behave differently on Windows. Needs testing on the actual VM.
- [ ] **Teams bot production** — `botbuilder-core` excluded from `requirements-local.txt`. Install only when Azure credentials are configured.
- [ ] **Password change page** — currently only accessible via profile menu. Should force change on first login if `force_password_change` flag added to User model.

### P2 — Medium Priority
- [ ] **CMDB relationships** — Assets can be linked to each other (parent/child relationships). E.g., a server hosts multiple VMs. Model: `AssetRelationship(from_asset, to_asset, relation_type)`
- [ ] **SLA escalation emails** — `check_sla_breaches` task marks breach but doesn't email the IT manager. Add email notification in the task.
- [ ] **Ticket templates** — Like canned responses but for initial ticket creation (pre-fill subject + description for common issue types)
- [ ] **Bulk ticket operations** — Select multiple tickets → bulk assign, bulk close, bulk update priority
- [ ] **On-call schedule** — Who is on-call this week? Escalate SLA breaches to the on-call agent.
- [ ] **Report scheduler** — Admin configures: "Send weekly ticket summary to manager@company.com every Monday 8AM"
- [ ] **Asset import (CSV)** — Upload CSV to bulk-create hardware assets instead of manual entry
- [ ] **KB article editor** — Currently plain text/markdown. Add a simple rich-text preview.
- [ ] **Problem auto-close** — When all linked tickets are resolved, suggest closing the problem

### P3 — Nice to Have
- [ ] **Dark mode** — Ant Design ConfigProvider token customization
- [ ] **Mobile app** (React Native)
- [ ] **Two-factor authentication** — TOTP using `django-otp`
- [ ] **Active Directory / LDAP integration** — `django-auth-ldap` for SSO
- [ ] **Webhook outbound** — Notify external systems when ticket status changes
- [ ] **Jira/GitHub issue sync** — Pull external issues as changes
- [ ] **AI ticket classification** — Auto-assign category and priority using NLP

---

## Known Limitations

1. **Local dev uses SQLite** — some PostgreSQL-specific features (JSONB operators) fall back to compatible equivalents. Always test against PostgreSQL before deploying.

2. **Celery runs eagerly in dev** (`CELERY_TASK_ALWAYS_EAGER=True`) — tasks run synchronously. In production with Redis, they run async. Test async behaviour before deploying.

3. **Teams bot excluded from local requirements** — `botbuilder-core` requires C++ build tools on Windows. Excluded from `requirements-local.txt`. In Docker (Linux), it installs from `requirements.txt` normally.

4. **WeasyPrint excluded from local** — PDF export not available in local dev. Works in Docker.

5. **Asset discovery requires network access** — The scan task uses subprocess ping and socket TCP connect. Will not work in restricted networks or Docker without `--network=host`.

6. **FullCalendar timeline view** — `@fullcalendar/timeline` is free in v6, but resource-based scheduling (showing multiple resources) is a premium feature.

---

## Database Schema Summary

### Key Tables
```
accounts_user          — users with UUID PK, email, role FK, account_type
accounts_role          — 5 roles: super_admin, it_manager, it_agent, requestor, auditor
accounts_password_reset_token
accounts_ticket_counter, assets_asset_counter, etc.  — singleton sequence tables
audit_log              — IMMUTABLE, append-only, never UPDATE/DELETE
tickets_ticket         — UUID PK, SLA fields, is_archived, email_message_id
tickets_category       — name, sla_response_hours, sla_resolution_hours
tickets_comment        — ticket FK, author FK, body, comment_type (reply/note)
tickets_canned_response
asset_hardware_asset   — UUID PK, qr_token, acceptance_status, site FK
asset_site
software_license       — UUID PK, seat_count, seats_used (property)
software_installation  — license FK, hardware_asset FK (nullable), assigned_user FK
changes_change_request — UUID PK, sprint FK, is_archived
changes_sprint         — UUID PK, status (planning/active/completed)
access_request         — UUID PK, approval_token, status flow
notification           — user FK, is_read, url
discovery_scan + discovery_device
catalog_category + catalog_item + catalog_service_request
kb_category + kb_article   — markdown content, view_count, helpful votes
problem_record         — M2M to tickets
```

---

## Security Controls

- **Rate limiting:** login 10/min, burst 60/min, sustained 2000/day (DRF throttling)
- **Account lockout:** 5 failed logins → 15-min Redis lockout
- **JWT:** 4h access (prod), 1d refresh (prod), rotation + blacklisting
- **Immutable audit log:** `_state.adding` check prevents modification
- **Soft delete everywhere:** users deactivated, tickets/assets archived, never hard-deleted
- **File upload:** extension allowlist + 10 MB size limit
- **HTTPS only:** nginx redirects HTTP → HTTPS, HSTS enforced

---

## Seed Data (auto-created on boot)

Running `python manage.py setup_demo_data` creates:

**Users:**
| Email | Password | Role |
|-------|----------|------|
| admin@helpdesk.local | Admin@ITSM2025! | Super Admin |
| itmanager@helpdesk.local | Manager@ITSM2025! | IT Manager |
| agent1@helpdesk.local | Agent@ITSM2025! | IT Agent |
| agent2@helpdesk.local | Agent@ITSM2025! | IT Agent |
| neha.gupta@company.local | User@ITSM2025! | Requestor |
| vikram.patel@company.local | User@ITSM2025! | Requestor |
| auditor@helpdesk.local | Audit@ITSM2025! | Auditor |

**Ticket Categories:** IT Support, Software Issues, Hardware Issues, Network Issues, Access & Security, Procurement, General Enquiry, Facilities

**Sites:** Head Office (Mumbai), Branch - Bengaluru, Branch - Delhi NCR

**Service Catalog:** IT Hardware, IT Software, General Services categories + 6 items

---

## Environment Variables (`.env`)

Key variables that affect behaviour:
```
EMAIL_INBOUND_PROTOCOL=imap          # or pop3
IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASSWORD, IMAP_SSL
POP3_HOST, POP3_PORT, POP3_USER, POP3_PASSWORD
TEAMS_APP_ID, TEAMS_APP_PASSWORD, TEAMS_TENANT_ID
DISCOVERY_SSH_USER, DISCOVERY_SSH_PASSWORD
FRONTEND_URL                         # used in email links and QR codes
ADMIN_EMAIL                          # initial admin email (default: admin@helpdesk.local)
```

---

## File Structure Quick Reference

```
backend/
  apps/
    accounts/       models.py, views.py, permissions.py, lockout.py, throttles.py,
                    security_middleware.py, password_reset.py, user_assets_views.py
    audit/          models.py (AuditLog), views.py (AuditLogListView, AuditLogExportView)
    tickets/        models.py, views.py, serializers.py, tasks.py, portal_views.py
    assets/         models.py (HardwareAsset+Site), views.py, acceptance_views.py, qr_utils.py
    software/       models.py, views.py, serializers.py, signals.py, tasks.py
    email_processor/ tasks.py (IMAP+POP3), pop3_handler.py
    teams_bot/      bot.py, views.py (csrf_exempt webhook)
    system_config/  models.py (SystemConfig), views.py
    reports/        views.py, calendar_views.py, meta_views.py, search_views.py
    changes/        models.py (ChangeRequest+Sprint), views.py, serializers.py
    access_requests/ models.py, views.py, emails.py
    notifications/  models.py (Notification), views.py
    discovery/      models.py, scanner.py, tasks.py, views.py
    catalog/        models.py (CatalogItem+ServiceRequest), views.py
    knowledge/      models.py (KBArticle), views.py
    problems/       models.py (ProblemRecord), views.py

frontend/src/
  api/client.ts         Axios + JWT interceptor
  store/auth.ts         Zustand auth store
  hooks/
    useChoices.ts       Cached /api/meta/choices/ — all enum dropdowns
    useUsers.ts         Cached /api/users/ — for assignee selects
  components/
    ErrorBoundary.tsx   React class component, wraps all pages
    ActivityFeed.tsx    Per-record audit history (used in detail pages)
  layouts/AppLayout.tsx Role-based sidebar + notification bell + global search
  pages/
    tickets/            TicketList, TicketDetail, CreateTicket
    assets/             HardwareList, HardwareDetail, SoftwareList, AssetAcceptance
    changes/            ChangeList, ChangeDetail, CreateChange
    sprints/            SprintList, SprintBoard
    access_requests/    AccessRequestList, AccessRequestDetail, ManagerApproval
    catalog/            ServiceCatalog
    knowledge/          KnowledgeBase
    problems/           ProblemList, ProblemDetail
    discovery/          DiscoveryPage
    settings/           UserManagement, Categories, CustomFields, CannedResponses,
                        EmailConfig, TeamsConfig
    profile/            UserProfile, ChangePassword
    audit/              AuditLogViewer
    scan/               ScanLanding (QR code landing)
```
