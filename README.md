# ITSM Platform — Bluspring Enterprises

[![GitHub](https://img.shields.io/badge/GitHub-anurag--mallick%2Fitsm-blue?logo=github)](https://github.com/anurag-mallick/itsm)

Enterprise-grade IT Service Management platform. Ticketing, asset management, change management, service catalog, and more. Deployed entirely on-premises.

---

## One-Command Setup

Clone the repository and run a single script — everything else is handled automatically.

```bash
git clone https://github.com/anurag-mallick/itsm.git
cd itsm
```

### Windows

```bat
setup.bat
```

### Linux / macOS

```bash
chmod +x setup.sh && ./setup.sh
```

That's it. The script:
- Installs Python 3.11+, Node.js 18+, Git (via `winget` on Windows or Homebrew/apt/yum on Linux/macOS)
- Creates a Python virtual environment and installs all packages
- Sets up the SQLite database and runs migrations
- Seeds all required data: roles, categories, sites, demo users, service catalog
- Creates the initial admin account and prints credentials
- Installs frontend Node packages

---

## Start the Application (after setup)

### Windows

```bat
start_dev.bat
```

### Linux / macOS

```bash
chmod +x start_dev.sh && ./start_dev.sh
```

Opens two terminals — Django on port 8000, Vite on port 3000.

---

## Access

| URL | Purpose |
|-----|---------|
| **http://localhost:3000** | Main application |
| http://localhost:3000/portal | Guest ticket submission (no login) |
| http://localhost:8000/api/docs/ | REST API documentation |

---

## Login Accounts (pre-created by setup)

| Role | Email | Password |
|------|-------|----------|
| **Super Admin** | `admin@helpdesk.local` | `Admin@ITSM2025!` |
| IT Manager | `itmanager@helpdesk.local` | `Manager@ITSM2025!` |
| IT Agent | `agent1@helpdesk.local` | `Agent@ITSM2025!` |
| IT Agent | `agent2@helpdesk.local` | `Agent@ITSM2025!` |
| Requestor | `neha.gupta@company.local` | `User@ITSM2025!` |
| Requestor | `vikram.patel@company.local` | `User@ITSM2025!` |
| Auditor | `auditor@helpdesk.local` | `Audit@ITSM2025!` |

> **Change the admin password on first login** via the user menu → Change Password.

---

## Pre-Loaded Data

The setup script automatically loads:

- **8 ticket categories** — IT Support, Software Issues, Hardware Issues, Network Issues, Access & Security, Procurement, General Enquiry, Facilities
- **3 office sites** — Head Office (Mumbai), Branch – Bengaluru, Branch – Delhi NCR
- **Service catalog** — 3 categories (IT Hardware, IT Software, General Services) with 6 ready-to-use service items
- **All 5 roles** — Super Admin, IT Manager, IT Agent, Requestor, Auditor
- **7 demo users** (see table above)

---

## Features

- **Ticketing** — Multi-channel (web portal, email, Microsoft Teams), SLA tracking, state machine validation, canned responses, attachments
- **Email Integration** — iRedMail IMAP/POP3 inbound (auto ticket creation every 30s), SMTP outbound notifications, full email threading
- **Hardware Assets** — Lifecycle tracking, QR codes, multi-site, asset acceptance workflow, auto-discovery via network scan
- **Software Licenses** — Seat tracking, compliance dashboard, subscription timeline, seat request approvals
- **Access Requests** — Hardware/software access workflow with manager email approval (no login required for manager)
- **Change Management** — Jira-style change records, sprint boards, kanban
- **Service Catalog** — IT services users can request (like ServiceNow)
- **Knowledge Base** — Articles with categories and search
- **Problem Management** — Link tickets to root cause problems
- **Workflow Automation** — Auto-assign tickets based on rules (category, priority, source, etc.)
- **Asset Discovery** — Network scanner with SNMP, SSH, port scan, RDP download
- **Audit Trail** — Immutable per-record history on every ticket, asset, and change
- **Notifications** — In-app bell + outbound email on every ticket event

---

## Configuration

All settings are managed through the UI at **Settings → Email Config** and **Settings → Teams Config**. No restart required.

Key environment variables (`.env` file — copy from `.env.example`):

```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=465
SMTP_USER=helpdesk@yourdomain.com
SMTP_PASSWORD=your-password
FRONTEND_URL=https://helpdesk.yourdomain.com
```

---

## Production Deployment (Docker)

For production deployment on a Linux VM:

```bash
cp .env.example .env   # fill in all values
./deploy.sh            # auto-installs Docker, builds images, starts all services
```

See `deploy.sh` and `deploy.ps1` for full Docker-based deployment on Linux/macOS/Windows.

---

## Developer Notes

See `CLAUDE.md` for the full AI developer context — API shape rules, known bugs, pending tasks, and architecture decisions.

---

*Built for Bluspring Enterprises — India's leading tech-enabled integrated infrastructure services enterprise.*
