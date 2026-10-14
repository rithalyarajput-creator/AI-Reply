# AI Reply

Multi-tenant WhatsApp automation and CRM platform. One software, many client companies, each with isolated data, agents and logins. Built on the official WhatsApp Business API (Meta Cloud API).

Live stack: React 18 + Vite on Vercel, one serverless API function, Neon PostgreSQL.

---

## What is in it

### Public website
Pages: `/` Home, `/platform`, `/solutions`, `/pricing` (plans pulled from your database), `/partners`, `/resources`,
`/about`, `/contact` (Book a demo), `/privacy`, `/terms`, `/login`. Demo and partner forms save to **Website Leads**.
Contact phone, email and a WhatsApp chat button appear only when `VITE_CONTACT_PHONE`, `VITE_CONTACT_EMAIL` and
`VITE_WHATSAPP_NUMBER` are set. The site makes no partner badges, customer logos or numbers it cannot back up.

### Super Admin and staff
| Menu | What it does |
|---|---|
| Dashboard | Clients, failure %, messages, low-balance clients, onboarding in progress, monthly recharge / Meta cost / gross margin |
| Clients and Client Detail | Add, edit, suspend, close; tabs for Overview, Profile, Users, Channels, Templates, Campaigns, Usage, Billing, Pricing (custom rates), API, Notes, Activity; "Login as client" (audited) |
| Channels | Every client's numbers with tier, quality, verification, webhook status and an onboarding tracker (numbers masked) |
| Plans and Pricing | Plans, per-category Meta cost + your markup, client rate |
| Wallet and Billing | Ledger, manual credit/debit with mandatory reason, invoices, balances, low-balance list |
| Staff and Roles | Support, Sales, Billing, Developer logins with a permission matrix |
| Website Leads | Enquiries from the public site |
| Agencies, Audit Log | Agency accounts; every sensitive action |

### Agency
Own clients (create, suspend, view detail), their users and audit log.

### Client portal (mirrors the Anantya.ai admin guide)
| Menu | What it does |
|---|---|
| Dashboard | Users, messages, live chats, response time, last campaign, WhatsApp status, setup checklist, wallet |
| Team Inbox | Live / History, search, assign and transfer, internal notes, 24-hour window handling with template fallback, new message |
| Reports | Analytics (delivery funnel, per day, agents, failure reasons), Short URL with click counts, Bot Report |
| Templates | Create with variables and buttons, submit to Meta, sync status |
| Campaigns | Template to a label or all contacts, wallet check, live progress, per-contact report CSV, auto refund on failures |
| Automations | Keyword reply, Welcome, Out of office, AI Bot, Auto assign, Opt-out, Quick reply, Feedback, Icebreaker, Keyword alerts |
| Setup (Flows) | Tap-to-choose button menus (up to 3 options per step) |
| Integrations | Your Channel (connect number), Marketplace, API Key (+ history), API Docs, Custom webhook |
| Workflows | New contact / keyword / any message, then send text, add label, assign agent; execution logs |
| Leads | Search, label and agent filters, add, CSV import and download, assign |
| Wallet | Balance, rates, transactions, invoices |
| Configurations | Personal (profile, notifications), Agents (create, percentage distribution, transfer), Labels |

Agent Head and Agent see a reduced menu; an Agent only sees chats and leads assigned to them.

```
Super Admin / Staff
   └── Agency (optional)
          └── Client (company)
                 └── Client Admin
                        └── Agent Head / Agent
```

---

## Setup

### 1. Database and environment
1. Create a Neon database and copy the connection string.
2. Copy `.env.example` to `.env` and fill it in. On Vercel, add the same variables under **Settings, Environment Variables**.

| Variable | Needed for |
|---|---|
| `DATABASE_URL`, `JWT_SECRET` | Everything |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | First Super Admin (migrate script only) |
| `META_APP_SECRET`, `META_VERIFY_TOKEN` | Receiving WhatsApp messages and delivery status |
| `ANTHROPIC_API_KEY` | AI Bot automation (optional) |
| `ENCRYPTION_KEY` | Separate key for channel tokens (optional) |
| `VITE_CONTACT_EMAIL` | Shown on Privacy and Terms (optional) |

### 2. Create or upgrade the tables
```bash
npm install
npm run migrate        # safe to re-run; upgrades an existing database in place
```

### 3. Run locally
```bash
npm i -g vercel
vercel dev             # React app and /api together on http://localhost:3000
```

### 4. Deploy
Push to GitHub, import in Vercel (preset Vite), add the variables, add your domain.

---

## Connecting WhatsApp

1. In the Meta developer dashboard create an app with the **WhatsApp** product. Use Meta's free test number first.
2. Set the webhook: Callback URL `https://YOUR-DOMAIN/api/webhooks/whatsapp`, Verify token = your `META_VERIFY_TOKEN`, subscribe to **messages**.
3. As a Client Admin open **Integrations, Your Channel, Connect WhatsApp number** and enter the Phone Number ID, WhatsApp Business Account ID and a permanent access token. The details are checked with Meta, and the token is stored encrypted.
4. Create a template, wait for approval (use **Sync from Meta**), then run a campaign.

Real customers' numbers need your business to be Meta-verified and (to onboard customers through a sign-up flow) Meta Tech Provider approval. Until then, connect numbers manually as above.

## Public API

Header `X-Api-Key: <key from Integrations, API Key>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/templates` | Templates |
| POST | `/api/v1/send-template` | `{ "to": "9198...", "template_name": "x", "variables": ["a"] }` |
| GET | `/api/v1/contacts?page=1&limit=100` | Contacts |
| POST | `/api/v1/contact-exists` | `{ "phone": "9198..." }` |
| GET | `/api/v1/campaigns`, `/api/v1/campaigns/:id` | Campaigns and delivery counts |

---

## Security

- Passwords: bcrypt hashes. Existing passwords can never be shown; only a new temporary one can be generated.
- Channel tokens and webhook trust: tokens are AES-256-GCM encrypted; webhooks are accepted only with a valid Meta signature.
- API keys: only a SHA-256 hash is stored; the key is shown once.
- Tenant isolation: every query is scoped by the caller's client or agency on the server.
- Account status is re-checked on every request; suspending a client blocks its users immediately.
- Staff permissions are enforced on the server (see Staff and Roles for the matrix).

## Known limits (be aware before going live)

- **Campaign sending is driven from the browser.** The page must stay open while a campaign sends (it sends in small batches and can be paused/resumed). Very large lists need a background worker or queue.
- No payment gateway yet: wallet recharges are entered manually by billing staff.
- No two-factor login, and no login rate limiting. Add Vercel Firewall / Upstash rate limiting before onboarding real customers.
- Instagram, Facebook, SMS, RCS and the third-party marketplace tools are shown as "Coming soon".
- Only free-text, reply buttons and basic templates are supported (no images/documents in templates or media messages yet).
- The Privacy Policy and Terms are starter drafts. Have them reviewed for your company, and check GST / TDS / invoice rules with your accountant.
- Meta's prices, tiers and policies change; fill the rate cards from Meta's current official pricing.

## Verification status

When this version was written, the API (108 checks) and the pages (53 checks) were exercised end to end against an
in-memory PostgreSQL with a mocked Meta API. Those scripts are not part of this repo, and nothing has been tested
against the live WhatsApp network yet, so run your own test with Meta's test number before real customers.
