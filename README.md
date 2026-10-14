# AI Reply

Multi-tenant WhatsApp automation and CRM platform. One software, many client companies, each with its own isolated data, agents and logins.

**Status: Phase 1 (accounts and roles).** WhatsApp connection, inbox, templates and campaigns come in the next phases.

---

## What it does

| Role | Who | What they can do |
|---|---|---|
| **Super Admin** | The platform owner | See every client, create agencies and clients, set plans, suspend/close accounts, open a client's portal for support ("Login as client"), see the full audit log |
| **Agency Admin** | An agency that manages many clients | Create and manage its own clients and their users, suspend/activate its clients |
| **Client Admin** | The owner of one company | Create and manage logins for their own agent heads and agents, reset passwords, disable users |
| **Agent Head / Agent** | Client's employees | Log in to their portal (inbox arrives in Phase 2) |

```
Super Admin
   └── Agency (optional)
          └── Client (company)
                 └── Client Admin
                        └── Agent Head / Agent
```

Clients can also be created directly under the Super Admin, without an agency.

### Phase 1 features

- Email + password login (JWT), bcrypt-hashed passwords
- Temporary passwords are generated, shown once, and must be changed at first login
- Super Admin: clients list (search, status filter), add client, client detail (overview, profile, users, activity), agencies, plans
- Suspend / activate / close client (reason is mandatory) - suspended clients cannot log in
- "Login as client" for support, always written to the audit log, expires in 30 minutes
- Per-role data scoping on the server (an agency only sees its own clients, a client admin only its own company)
- Audit log of logins, user changes, status changes and support access

### Roadmap

| Phase | Scope |
|---|---|
| 1 (this) | Auth, roles, agencies, clients, users, plans, audit log |
| 2 | WhatsApp Cloud API connection (Meta Embedded Signup), webhooks, Team Inbox, 24-hour window handling |
| 3 | Templates, bulk campaigns, delivery reports, prepaid wallet and billing |
| 4 | Automations (keyword reply, welcome, out-of-office, bots), Instagram and Facebook |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, React Router v6 |
| Backend | Vercel serverless function (`api/index.js`, one entry point with an internal router) |
| Database | Neon PostgreSQL (`@neondatabase/serverless`) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Hosting | Vercel |

## Project structure

```
api/index.js         All API routes, auth and role checks
lib/core.js          DB client, JWT, hashing, validation, audit helper
db/schema.sql        Database tables
scripts/migrate.mjs  Creates tables and the first Super Admin
src/                 React app (pages, components, auth, api client)
vercel.json          Routes /api/* to the function and everything else to the SPA
```

---

## Setup

### 1. Database (Neon)

1. Create a project at [neon.tech](https://neon.tech) (free tier is enough to start).
2. Copy the connection string (it looks like `postgresql://...?sslmode=require`).

### 2. Environment variables

Copy `.env.example` to `.env` for local use. On Vercel, add the same variables under **Project Settings, Environment Variables**.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `JWT_SECRET` | Long random string for signing tokens (never reuse across projects) |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME` | Used only by the migrate script to create the first Super Admin |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Create tables and the first Super Admin

```bash
npm install
npm run migrate        # reads .env; safe to re-run
```

If your Node version does not load `.env` automatically: `node --env-file=.env scripts/migrate.mjs`.

### 4. Run locally

```bash
npm i -g vercel
vercel dev             # serves the React app and /api together on http://localhost:3000
```

### 5. Deploy

1. Push this repo to GitHub and import it in Vercel (framework preset: Vite).
2. Add the environment variables.
3. Add your domain under **Settings, Domains** and point the DNS records Vercel shows you.

---

## API overview

All routes are under `/api` and need `Authorization: Bearer <token>` except login.

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | Log in |
| GET | `/auth/me` | any | Current user |
| POST | `/auth/change-password` | any | Change own password |
| GET | `/stats` | any | Dashboard numbers for the caller's scope |
| GET/POST | `/plans` | super_admin (POST), super/agency (GET) | Plans |
| GET/POST | `/agencies` | super_admin | Agencies (creating one also creates its admin login) |
| PATCH | `/agencies/:id` | super_admin | Suspend / activate |
| GET/POST | `/clients` | super_admin, agency_admin | List / create (creating one also creates its Client Admin login) |
| GET/PATCH | `/clients/:id` | super, agency, client admin (GET own) | Detail / edit profile |
| POST | `/clients/:id/status` | super, agency | trial, active, suspended, closed (reason required to suspend/close) |
| POST | `/clients/:id/impersonate` | super_admin | Login as client (audited) |
| GET/POST | `/users` | super, agency, client admin | List / create users |
| PATCH | `/users/:id` | super, agency, client admin | Edit name, mobile, role, status |
| POST | `/users/:id/reset-password` | super, agency, client admin | New temporary password |
| GET | `/audit` | super, agency, client admin | Latest 200 audit entries in scope |

## Security notes

- Passwords are stored as bcrypt hashes. The app never stores or shows an existing password; it can only generate a new temporary one.
- Every tenant table carries `client_id` / `agency_id`, and every query is filtered by the caller's scope on the server. The UI hiding a button is never the only protection.
- Secrets live only in environment variables. `.env` is git-ignored.
- Account status is re-checked on every request, so disabling a user or suspending a client takes effect immediately.
- Not yet in Phase 1: login rate limiting, email delivery of credentials, 2FA. Add rate limiting (for example Vercel Firewall or Upstash) before going live with real customers.

## WhatsApp (Phase 2 preview)

The platform will use the official WhatsApp Business API (Meta Cloud API), not QR-scan tools, so customer numbers are not at risk of random bans.

What is needed from your side, before real numbers can be connected:

1. A registered business (Udyam, GST or equivalent) and a website with Privacy Policy / Terms pages
2. A Meta Developer account and app, plus business verification
3. Meta App Review to become a Tech Provider (needed for Embedded Signup)

Until then, development can use Meta's free test number. Meta's rules and prices change; check the official pages before pricing your plans.
