# ITSM Platform — Internal IT Service Management

Enterprise-grade IT Service Management and Asset Management platform for **Bluspring Enterprises**. Deployed entirely on-premises on a local VM. Built for compliance with India's **Digital Personal Data Protection Act 2023 (DPDPA)** and **ISO 27001** security standards.

---

## Quick Start — Choose Your Platform

Both scripts do the same thing. Pick the one that matches your server OS.

### Linux / macOS

```bash
git clone <repo-url> itsm && cd itsm
chmod +x deploy.sh
./deploy.sh
```

Supported: **Ubuntu 22.04**, Debian 11+, RHEL/Rocky Linux 8+, macOS 13+

### Windows (PowerShell)

```powershell
git clone <repo-url> itsm; cd itsm
# Allow local scripts to run (one-time):
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\deploy.ps1
```

Supported: **Windows 10 / 11**, Windows Server 2019+, PowerShell 5.1+

> **Note:** Run PowerShell as **Administrator** on first run so Docker Desktop can be installed automatically.

---

Both scripts handle **everything automatically** with zero manual steps:

| Step | What happens |
|---|---|
| Prerequisites | Installs Docker Desktop / Docker Engine + Compose if not present |
| SSL | Auto-generates self-signed certificate (replace with CA cert for production) |
| Environment | Creates `.env` from template; auto-generates `SECRET_KEY` and `DB_PASSWORD` |
| Build | Builds all Docker images — Python and Node.js dependencies inside containers |
| Start | Starts PostgreSQL 16, Redis 7, Django, Celery workers, Nginx |
| Migrations | Runs all database migrations |
| Seed data | Creates 5 roles, 8 ticket categories, 3 office sites, 6 demo user accounts |
| Admin | Creates initial super-admin account with random password |
| Credentials | Prints admin credentials and portal URL |

No manual steps required on any supported platform.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Deployment](#deployment)
6. [Configuration Reference](#configuration-reference)
7. [User Roles & Permissions](#user-roles--permissions)
8. [Modules](#modules)
9. [Security & Compliance](#security--compliance)
10. [Data Policy](#data-policy)
11. [Maintenance](#maintenance)

---

## Features

### Helpdesk & Ticketing
- **Multi-channel ticket creation** — Web portal, inbound email (iRedMail IMAP), and Microsoft Teams bot (Adaptive Card)
- **Email threading** — replies to notification emails automatically append as ticket comments via plus-addressing (`helpdesk+ticket-TKT-00001@domain`)
- **Auto guest accounts** — unknown email senders are automatically registered as guest requestors
- **SLA tracking** — per-category response and resolution SLA timers with breach alerts
- **Status workflow** — Open → In Progress → Pending Info → Resolved → Closed
- **Canned responses** — reusable response templates with `{{requestor_name}}`, `{{ticket_id}}`, `{{agent_name}}` placeholders
- **Internal notes** — agent-only comments not visible to requestors
- **File attachments** — validated by extension and size (max 10 MB)
- **Custom fields** — admin-configurable fields per ticket category (10 field types)
- **Archive** — tickets can be archived (not deleted) with a mandatory reason; separate archive view; full audit trail

### Hardware Asset Management
- **Asset register** — laptops, desktops, servers, monitors, phones, tablets, printers, network gear, UPS, and more
- **Lifecycle tracking** — Procurement → Active → Under Repair → Retired → Disposed
- **Multi-site support** — assets linked to office sites with address and contact information
- **User assignment** — assign assets to employees; unassignment tracked
- **Warranty tracking** — expiry alerts at 30/60/90 days; colour-coded warranty status
- **Status history** — every status change recorded with actor, notes, and timestamp
- **QR code & barcode** — each asset gets a unique QR code (Code128 barcode for asset tag); printable from the UI
- **Scan landing page** — mobile-friendly page opened by scanning a QR code; actions: Report Issue, Request Assignment, Confirm Audit
- **Audit confirmation** — physical asset verification logged with user and location note
- **Custom fields** — configurable per asset type
- **Archive** — assets archived (not deleted) with reason; separate archive view

### Software License Management
- **License inventory** — perpetual, subscription, OEM, freeware, open-source license types
- **Seat tracking** — licensed seats vs. installed seats with compliance dashboard
- **Installation tracking** — link licenses to hardware assets; duplicate prevention
- **Seat request workflow** — agents request additional seats with justification; managers approve/reject; auto-increments seat count on approval
- **Subscription timeline** — complete event history: license created, seat count changed, expiry renewed, installations added/removed
- **Assigned users** — see which users have the software installed on their assigned machines
- **Expiry alerts** — email alerts to IT managers at 30-day and 7-day thresholds (Celery Beat scheduled)
- **Compliance view** — per-license compliance status with overage calculation

### Asset QR Code Scanning
- QR code generated per asset using the asset's `qr_token` (UUID, permanent)
- Barcode generated from the asset tag (Code128)
- Download QR as PNG; print directly from the modal
- Scan opens a mobile-optimised landing page with:
  - Asset information (name, type, status, site, assigned user, warranty)
  - **Report an Issue** → creates a ticket pre-linked to the asset
  - **Request Assignment** → creates an assignment-request ticket
  - **Confirm Audit** → logs an audit confirmation entry with location note

### Email Integration (iRedMail)
- **Outbound** — all ticket events trigger email notifications to the requestor (SMTP via iRedMail Postfix)
- **Inbound** — IMAP polling every 60 seconds; new emails create tickets; replies append as comments
- **Threading** — `In-Reply-To` and `References` headers maintained; `Reply-To: helpdesk+ticket-TKT-XXXXX@domain` for routing
- **DKIM/SPF** — handled automatically by iRedMail relay

### Microsoft Teams Integration (M365)
- Azure Bot Framework integration; Adaptive Card form in Teams chat
- Commands: message the bot or type `/ticket` to open the creation card
- Fields: Summary, Category, Priority, Description
- On submission: ticket created, confirmation sent back in Teams with portal link
- Agent actions (comment, status change, resolution) send proactive Teams messages to the requestor

### Settings & Administration
- **User management** — create users, assign roles, activate/deactivate (no deletion)
- **Email configuration** — SMTP and IMAP settings stored in database, editable from UI (no server restart needed)
- **Teams configuration** — Azure Bot credentials managed from UI
- **Custom fields** — admin UI to add/edit/delete custom fields per module
- **Ticket categories** — manage categories with SLA settings
- **Canned responses** — manage global and personal response templates
- **System configuration** — all settings grouped by section (SMTP / IMAP / Teams / General)

### Audit Trail & Compliance
- **Immutable audit log** — every create, update, delete, login, and logout is recorded
- **Fields captured** — timestamp, user email, action, module, record ID, old value, new value, IP address
- **Cannot be modified** — `save()` and `delete()` on `AuditLog` raise `PermissionError` at the Python level; admin UI is read-only
- **CSV export** — admin can download filtered audit log (up to 100,000 rows); export itself is logged
- **Filter & search** — filter by action, module, user email, date range
- **Archive audit** — every archive and unarchive action with reason logged

### Security
- **Rate limiting** — login: 10/min; burst: 60/min; sustained: 2000/day
- **Account lockout** — 5 failed logins triggers 15-minute lockout (Redis-backed); remaining attempts shown
- **JWT authentication** — access token 4h (prod) / 8h (dev); refresh 1 day (prod) / 7 days (dev); rotation + blacklisting
- **Password policy** — minimum 10 characters, complexity validators
- **HTTPS only** — nginx redirects all HTTP → HTTPS; HSTS enforced
- **Security headers** — X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS
- **File upload validation** — extension allowlist + 10 MB size limit
- **Request size limit** — 20 MB hard cap via middleware
- **No hard deletion** — users deactivated, tickets/assets archived, hardware set to Disposed, software deactivated
- **Self-signed SSL** — auto-generated on first deploy; replace with CA-signed cert for production

---

## Architecture

```
Linux VM (on-premises)
└── Docker Compose
    ├── nginx           HTTPS termination, SPA routing, static files
    ├── backend         Django + Gunicorn (3 workers)
    ├── celery-worker   Async tasks: email, Teams notifications
    ├── celery-beat     Scheduled: IMAP poll (60s), SLA checks (15m), expiry alerts (24h)
    ├── postgres        PostgreSQL 16 — all application data
    └── redis           Task queue + rate-limit / lockout cache
```

```
Frontend (React SPA)        Backend (Django REST API)
─────────────────           ──────────────────────────────────────
Login / Dashboard           /api/auth/          JWT auth, user management
Tickets (list/detail)       /api/tickets/       Tickets, comments, attachments
Create Ticket               /api/categories/    Ticket categories
Hardware Assets             /api/assets/        Hardware assets, sites, QR
Software Licenses           /api/software/      Licenses, installations, seat requests
Audit Log Viewer            /api/audit/         Immutable audit log + CSV export
Settings (all modules)      /api/system-config/ DB-stored SMTP/IMAP/Teams config
QR Scan Landing             /api/scan/          Public QR scan endpoints
                            /api/reports/       Dashboard stats, ticket/asset reports
                            /api/custom-fields/ Custom field schemas
                            /api/teams/webhook/ Microsoft Teams Bot webhook
                            /api/docs/          OpenAPI / Swagger UI
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, Django 5.1, Django REST Framework 3.15 |
| Database | PostgreSQL 16 (free, open-source, self-hosted) |
| Task Queue | Celery 5 + Redis 7 |
| Frontend | React 18, TypeScript, Vite, Ant Design 5 |
| Auth | JWT (djangorestframework-simplejwt) |
| Email Inbound | imapclient (IMAP poll) |
| Email Outbound | Django SMTP backend → iRedMail |
| Teams Bot | botbuilder-core (Azure Bot Framework) |
| QR / Barcode | qrcode[pil], python-barcode |
| PDF Export | WeasyPrint |
| Reverse Proxy | Nginx 1.26 |
| Containerisation | Docker Compose |

---

## Prerequisites

### VM / Server Requirements

| Item | Minimum |
|---|---|
| RAM | 4 GB (8 GB recommended) |
| Disk | 40 GB free |
| CPU | 2 cores |

### Supported Operating Systems

| OS | Script |
|---|---|
| Ubuntu 22.04 LTS | `deploy.sh` |
| Debian 11 / 12 | `deploy.sh` |
| RHEL / Rocky Linux / AlmaLinux 8+ | `deploy.sh` |
| macOS 13+ | `deploy.sh` |
| Windows 10 / 11 | `deploy.ps1` |
| Windows Server 2019 / 2022 | `deploy.ps1` |

### What gets auto-installed

The deployment scripts install all dependencies automatically. **Nothing needs to be manually installed.**

| Dependency | Linux (`deploy.sh`) | Windows (`deploy.ps1`) |
|---|---|---|
| Docker Engine | apt / yum official repo | Docker Desktop via winget |
| Docker Compose v2 | Docker plugin | Bundled with Docker Desktop |
| OpenSSL | System package manager | Git for Windows / built-in .NET fallback |
| SSL Certificate | openssl self-signed | OpenSSL or PowerShell .NET crypto |
| Python packages | Inside Docker container | Inside Docker container |
| Node.js packages | Inside Docker container | Inside Docker container |

**Nothing is installed on the host machine** beyond Docker — all application code runs inside containers.

**Network requirements:**
- Port **443** (HTTPS) open for internal users
- Port **443** also reachable from Microsoft Azure Bot Service (for Teams webhook)
- Outbound access to the iRedMail server on ports **993** (IMAP) and **587** (SMTP)
- Outbound HTTPS to `login.microsoftonline.com` (Teams bot authentication)

---

## Deployment

### Step 1 — Clone the repository

**Linux / macOS:**
```bash
git clone <repo-url> itsm && cd itsm
```

**Windows (PowerShell):**
```powershell
git clone <repo-url> itsm; cd itsm
```

### Step 2 — Run the deployment script

**Linux / macOS:**
```bash
chmod +x deploy.sh
./deploy.sh
```

**Windows (run PowerShell as Administrator):**
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser  # one-time only
.\deploy.ps1
```

Both scripts perform these steps automatically:
1. Detect OS and install Docker + Docker Compose if missing
2. Create `.env` from `.env.example` and prompt for required values
3. Validate that critical secrets have been changed
4. Generate a self-signed SSL certificate (via OpenSSL or .NET crypto)
5. Pull base images and build all application containers
6. Start all six services (postgres, redis, backend, celery-worker, celery-beat, nginx)
7. Wait for health checks to pass
8. Run migrations, seed roles, create initial admin account
9. Run `security_check` command
10. Print the initial admin credentials and access URL

### Step 3 — First Login

Open `https://<your-server-ip>` in a browser and sign in with the printed credentials.

> **Important:** Change the admin password immediately on first login.

### Updating

**Linux / macOS:**
```bash
git pull && ./deploy.sh
```

**Windows:**
```powershell
git pull; .\deploy.ps1
```

Both scripts are idempotent — SSL generation, admin creation, and role seeding are all skipped if already completed.

---

## Configuration Reference

Copy `.env.example` to `.env` and set all values:

| Variable | Description | Required |
|---|---|---|
| `SECRET_KEY` | Django secret key — min 50 random characters | **Yes** |
| `DEBUG` | `False` for production | **Yes** |
| `ALLOWED_HOSTS` | Comma-separated hostnames/IPs | **Yes** |
| `DB_NAME` | PostgreSQL database name | **Yes** |
| `DB_USER` | PostgreSQL username | **Yes** |
| `DB_PASSWORD` | PostgreSQL password | **Yes** |
| `SMTP_HOST` | iRedMail server IP | **Yes** |
| `SMTP_PORT` | `587` | **Yes** |
| `SMTP_USER` | Helpdesk mailbox address | **Yes** |
| `SMTP_PASSWORD` | Mailbox password | **Yes** |
| `IMAP_HOST` | iRedMail server IP | **Yes** |
| `IMAP_USER` | Same helpdesk mailbox | **Yes** |
| `IMAP_PASSWORD` | Same password | **Yes** |
| `FRONTEND_URL` | `https://helpdesk.yourdomain.local` | **Yes** |
| `TEAMS_APP_ID` | Azure App Registration client ID | Optional |
| `TEAMS_APP_PASSWORD` | Azure App Registration client secret | Optional |
| `TEAMS_TENANT_ID` | Azure tenant ID | Optional |
| `ADMIN_EMAIL` | Initial admin email (default: `admin@helpdesk.local`) | Optional |

After first deployment, SMTP/IMAP/Teams settings can also be updated via **Settings → Email Config / Teams Config** in the UI without restarting services.

---

## User Roles & Permissions

| Role | Description | Key Permissions |
|---|---|---|
| **Super Admin** | Full system access | All actions + system config, user management, security settings |
| **IT Manager** | Manages IT operations | All tickets + assets, reports, audit log, approve seat requests, restore archives |
| **IT Agent** | Day-to-day IT support | Create/assign/resolve tickets, manage assets, archive records |
| **Requestor** | End users / employees | Create and view own tickets only; scan QR codes |
| **Auditor** | Compliance role | Read-only access to all records and audit log; CSV export |

---

## Modules

### Ticketing
- `GET/POST /api/tickets/` — list and create tickets
- `GET /api/tickets/archived/` — archived tickets (IT Agent+)
- `POST /api/tickets/{id}/assign/` — assign to agent
- `POST /api/tickets/{id}/status/` — change status
- `POST /api/tickets/{id}/archive/` — archive with reason
- `POST /api/tickets/{id}/unarchive/` — restore (IT Manager+)
- `GET/POST /api/tickets/{id}/comments/` — threaded comments

### Hardware Assets
- `GET/POST /api/assets/hardware/` — list and create assets
- `GET /api/assets/hardware/archived/` — archived assets
- `GET /api/assets/hardware/warranty-alerts/` — expiring warranty
- `GET /api/assets/hardware/{id}/qr/` — QR and barcode images (base64)
- `POST /api/assets/hardware/{id}/status/` — change lifecycle status
- `POST /api/assets/hardware/{id}/assign/` — assign to user
- `POST /api/assets/hardware/{id}/archive/` — archive with reason
- `GET /api/scan/{token}/` — public: asset info by QR token
- `POST /api/scan/{token}/action/` — report issue / request assignment / confirm audit

### Software Licenses
- `GET/POST /api/software/licenses/` — list and create licenses
- `GET /api/software/licenses/compliance/` — compliance report
- `GET /api/software/licenses/expiry-alerts/` — expiring licenses
- `GET /api/software/licenses/{id}/timeline/` — event history
- `GET /api/software/licenses/{id}/assigned-users/` — users with software
- `POST /api/software/seat-requests/` — request additional seats
- `POST /api/software/seat-requests/{id}/approve/` — approve/reject request

### Audit Log
- `GET /api/audit/` — paginated, filterable audit log
- `GET /api/audit/export/` — CSV export (max 100,000 rows)

### System Configuration (Super Admin only)
- `GET /api/system-config/?section=smtp|imap|teams|general` — get config section
- `POST /api/system-config/update/` — bulk update key-value pairs
- `POST /api/system-config/test-email/` — send a test email

---

## Security & Compliance

### Controls Implemented
- TLS 1.2+ enforced; HTTP redirected to HTTPS
- All passwords hashed with Django's PBKDF2-SHA256 (configurable to Argon2)
- JWT tokens short-lived; refresh token blacklisted on rotation
- Rate limiting prevents brute force and DoS
- Account lockout after 5 failed attempts (15 minutes, Redis)
- Immutable audit log — tamper-proof at application layer
- All uploads validated by extension whitelist and 20 MB request cap
- No hard deletion anywhere — full data lineage preserved
- Self-signed SSL on first deploy; designed for CA-signed cert replacement
- `python manage.py security_check` validates deployment hardening

### Audit Compliance
- Audit log captures: who, what, when, from where, old value, new value
- Archive actions include mandatory reason field
- CSV export of full audit log for external audit review
- 7-year recommended retention for audit logs (configurable)
- Login and logout events recorded with IP address and user agent

---

## Data Policy

A full **Data Protection & Privacy Policy** (DPDPA 2023 compliant) is available at `/privacy-policy` in the application. Key points:

- All data stored on-premises; no external cloud storage
- Personal data collected: name, work email, IP address, device assignment
- Audit logs retained 7 years; closed tickets 3 years; user data for employment duration + 1 year
- Third-party integrations: Microsoft Teams (notification delivery only) and iRedMail (on-premises)
- Data breach notification within 72 hours per DPDPA 2023 requirements

---

## Maintenance

### Database Backup

**Linux:**
```bash
docker compose exec postgres pg_dump -U $DB_USER $DB_NAME > backup_$(date +%Y%m%d).sql
```

**Windows:**
```powershell
docker compose exec postgres pg_dump -U $env:DB_USER $env:DB_NAME > "backup_$(Get-Date -Format yyyyMMdd).sql"
```

### Restore

**Linux:**
```bash
cat backup.sql | docker compose exec -T postgres psql -U $DB_USER $DB_NAME
```

**Windows:**
```powershell
Get-Content backup.sql | docker compose exec -T postgres psql -U $env:DB_USER $env:DB_NAME
```

### View Logs

```bash
# Both platforms:
docker compose logs -f                   # all services
docker compose logs -f backend           # Django only
docker compose logs -f celery-worker     # Celery tasks
```

### Run Management Commands

```bash
# Both platforms:
docker compose exec backend python manage.py security_check
docker compose exec backend python manage.py setup_roles
docker compose exec backend python manage.py setup_schedules
```

### Stop / Start / Restart

```bash
# Both platforms:
docker compose down          # stop (data preserved in volumes)
docker compose up -d         # start
docker compose restart       # restart all services
```

### Update Application

**Linux:**
```bash
git pull && ./deploy.sh
```

**Windows:**
```powershell
git pull; .\deploy.ps1
```

---

## Project Structure

```
itsm/
├── deploy.sh                  ← Linux / macOS deployment script
├── deploy.ps1                 ← Windows PowerShell deployment script
├── docker-compose.yml         ← Service orchestration
├── .env.example               ← Configuration template
├── .gitignore
├── README.md                  ← This file
│
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh          ← Runs migrations + setup on startup
│   ├── requirements.txt
│   ├── manage.py
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py        ← Shared settings
│   │   │   ├── production.py  ← Security hardening
│   │   │   └── development.py
│   │   ├── urls.py            ← Root URL config
│   │   ├── celery.py          ← Celery app
│   │   └── wsgi.py
│   └── apps/
│       ├── accounts/          ← Users, roles, JWT auth, lockout, throttles
│       ├── audit/             ← Immutable audit log, CSV export
│       ├── custom_fields/     ← Configurable field schemas (JSONB)
│       ├── tickets/           ← Tickets, categories, comments, canned responses
│       ├── assets/            ← Hardware assets, sites, QR utils, scan endpoints
│       ├── software/          ← Licenses, installations, seat requests, events
│       ├── email_processor/   ← IMAP polling Celery task
│       ├── teams_bot/         ← Azure Bot webhook handler
│       ├── system_config/     ← DB-stored SMTP/IMAP/Teams config
│       └── reports/           ← Dashboard stats, reports
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx            ← Routes
│       ├── api/client.ts      ← Axios + JWT refresh interceptor
│       ├── store/auth.ts      ← Zustand auth store
│       ├── layouts/
│       │   └── AppLayout.tsx  ← Role-based sidebar navigation
│       └── pages/
│           ├── Dashboard.tsx
│           ├── Login.tsx
│           ├── PrivacyPolicy.tsx
│           ├── tickets/       ← TicketList, TicketDetail, CreateTicket
│           ├── assets/        ← HardwareList, HardwareDetail, SoftwareList
│           ├── audit/         ← AuditLogViewer (with CSV export)
│           ├── scan/          ← ScanLanding (QR scan mobile page)
│           └── settings/      ← Users, EmailConfig, TeamsConfig,
│                                 CustomFields, CannedResponses, Categories
│
└── nginx/
    ├── Dockerfile
    ├── nginx.conf             ← HTTPS, SPA routing, security headers
    └── ssl/                   ← server.crt + server.key (gitignored)
```

---

## Support

For issues with this application, create a ticket via the helpdesk portal or contact the IT team at the email address configured in Settings → Email Config.

For development questions, refer to the API documentation at `https://<your-server>/api/docs/`.

---

*Built for Bluspring Enterprises — India's leading tech-enabled integrated infrastructure services enterprise.*
