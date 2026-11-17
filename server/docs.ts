export interface DocSection {
  slug: string;
  title: string;
  category: string;
  content: string;
}

export const CRM_DOCUMENTATION: DocSection[] = [
  {
    slug: 'deployment',
    title: 'Production Deployment & Security Architecture',
    category: 'DevOps & Security',
    content: `# Production Deployment Guide — Avasa Realty CRM

## 1. Infrastructure Stack
- **Web Frontend & API Server**: Node.js 22 LTS + Express + React 19 (Vite bundle) on port 3000 behind HTTPS/TLS 1.3 load balancer.
- **Database**: PostgreSQL 16 (Cloud SQL or self-managed) configured in \`Asia/Kolkata\` timezone.
- **Mobile Client**: Responsive Mobile Web + React Native (Expo SDK 52) consuming the same \`/api/*\` JWT endpoints.

## 2. Database Migration Sequence
1. Provision PostgreSQL 16 database \`avasa_realty_crm\`.
2. Execute \`database/001_schema.sql\` to create all 17 relational tables and foreign key constraints.
3. Execute \`database/002_rls_and_indexes.sql\` to enable Row-Level Security (RLS), performance indexes, DPDP consent withdrawal triggers, and retention purge functions.
4. Execute \`database/003_seed_data.sql\` for initial roles, permissions, projects, and sample inventory.

## 3. Security Controls
- **Encryption in Transit**: Enforce TLS 1.3 at reverse proxy/Cloud Run ingress; enable \`sslmode=verify-full\` on PostgreSQL connections outside Auth Proxy.
- **Secrets Management**: Store \`GEMINI_API_KEY\`, \`SESSION_SECRET\`, \`WHATSAPP_ACCESS_TOKEN\`, and \`SQL_PASSWORD\` in GCP Secret Manager or Vault. Never commit \`.env\`.
- **Password Hashing**: Node \`crypto.scryptSync\` with per-user 16-byte random salt and constant-time \`timingSafeEqual\`.
- **Row-Level Access**: Sales executives are isolated to records where \`assigned_to = auth.sub\` across leads, customers (PII), conversations, site visits, and commissions.
- **Automated Backups**: Schedule daily \`pg_dump --format=custom --compress=9\` to encrypted object storage with 35-day PITR and 8-year RERA financial archive.
- **Data Retention**: Cold/lost leads without bookings expire at 365 days via \`purge_expired_cold_leads()\`; bookings/payments retain for 8 years per Indian RERA & Income Tax Act.`,
  },
  {
    slug: 'admin-manual',
    title: 'Admin Operations Manual',
    category: 'Administration',
    content: `# Company Admin Manual

## 1. Daily Executive Workflow
1. **Review Executive Dashboard**: Filter by Date Range, Project, Sales Employee, or City (\`Bengaluru\`, \`Hyderabad\`, \`Gurugram\`, \`Pune\`, \`Mumbai\`). Monitor Today's Enquiries, Hot Leads, Pending Follow-ups, and Pending Payments.
2. **Assign Incoming Leads**: Open **Leads & Pipeline**, inspect AI-qualified summaries, and assign unassigned or high-value leads to city-matched sales executives.
3. **Inventory & RERA Governance**: Add new projects under **Projects & Properties** with verified RERA registration IDs and unit-level pricing in INR.
4. **Approve Commissions**: Under **Bookings & Finance**, verify UTR payment references before approving 5% TDS-adjusted (Section 194H) sales commissions.
5. **DPDP Consent & Opt-Outs**: Monitor **Customers & Consent** to verify opt-out requests (\`STOP\` keyword) are respected immediately.
6. **Backups & Audit Logs**: Export periodic JSON/SQL backups in **SQL, Backups & Docs** and review \`PII_ACCESS_DENIED\` or \`CONSENT_WITHDRAWN\` entries in **Team & Security**.`,
  },
  {
    slug: 'employee-guide',
    title: 'Sales Employee Training Guide',
    category: 'Sales Operations',
    content: `# Sales Executive Field & CRM Guide

## 1. Managing Your Pipeline
- Your login automatically isolates your view to **your assigned leads and customers** to protect client privacy across teams.
- Prioritize **Hot** leads first and complete due **Follow-ups** before 6:00 PM IST.

## 2. Using WhatsApp Business & AI Assistant
- Open **WhatsApp & AI** to review incoming customer messages in English, Hindi, Hinglish, Tamil, Telugu, Marathi, Kannada, or Gujarati.
- Click **Generate AI Reply** to draft an inventory-accurate response in the customer's exact language, or type a personal agent reply.
- If a customer replies \`STOP\` or withdraws consent, automated messaging locks immediately—do not contact them via promotional channels.

## 3. Site Visits to Booking Conversion
1. Schedule a site visit with pickup preference under **Site Visits & Follow-ups**.
2. Mark the visit **Completed** with buyer rating (1–5) and notes.
3. Once the buyer agrees, convert the lead to a **Booking**, upload token UTR, and track milestone collections.`,
  },
  {
    slug: 'api-docs',
    title: 'REST API Reference',
    category: 'Developer Docs',
    content: `# Avasa Realty CRM — REST API Documentation

All protected endpoints require header: \`Authorization: Bearer <jwt_token>\`

## Authentication
- \`POST /api/auth/login\` — Authenticate with email & password, returns JWT + user profile + permissions.
- \`GET /api/auth/me\` — Return current authenticated user profile.

## Dashboard & Analytics
- \`GET /api/dashboard?startDate=&endDate=&projectId=&employeeId=&location=\` — Returns all 17 KPIs, employee leaderboard, source analytics, monthly sales graph, and project-wise sales (row-level scoped for \`sales_exec\`).

## Leads & Customers
- \`GET /api/leads\` | \`POST /api/leads\` | \`PATCH /api/leads/:id\`
- \`POST /api/leads/:id/assign\` — Requires \`admin\` or \`sales_manager\`.
- \`GET /api/customers\` | \`GET /api/customers/:id\` | \`POST /api/customers\` — Enforces row-level PII protection (\`403\` logged on unauthorized access).

## Projects & Properties
- \`GET /api/projects\` | \`POST /api/projects\`
- \`GET /api/properties\` | \`POST /api/properties\` | \`PATCH /api/properties/:id\`

## WhatsApp Business & Gemini AI
- \`GET /api/whatsapp/conversations\`
- \`POST /api/whatsapp/incoming\` — Webhook/simulator for incoming customer messages (handles automatic \`STOP\` opt-out).
- \`POST /api/whatsapp/outgoing\` — Sends agent reply (blocked with \`403\` if contact opted out).
- \`POST /api/ai/reply\` — Calls Gemini (\`gemini-4-hydrogen\`) grounded in live property inventory with Indian language detection.

## Site Visits, Follow-ups, Bookings, Payments & Commissions
- \`GET/POST/PATCH /api/site-visits\`
- \`GET/POST/PATCH /api/follow-ups\`
- \`GET/POST/PATCH /api/bookings\` — Locks property unit, creates payment milestones & commission calculation.
- \`GET/POST/PATCH /api/payments\`
- \`GET/PATCH /api/commissions\`

## Consent, Campaigns, Security & Backups
- \`GET/POST/PATCH /api/consent\` — Grant, withdraw, or opt out.
- \`GET/POST /api/campaigns\` & \`POST /api/campaigns/:id/run\` — Skips opted-out contacts automatically.
- \`GET /api/audit-logs\` — Admin security trail.
- \`GET /api/database/sql/:file\` & \`POST /api/database/backup\``,
  },
  {
    slug: 'mobile-architecture',
    title: 'Mobile Application Architecture (React Native / Expo)',
    category: 'Mobile Engineering',
    content: `# Mobile Application Guide (iOS & Android Field Sales App)

The web CRM is fully responsive for tablet and mobile viewports (with 44px touch targets and slide-over navigation). For dedicated native field-sales apps (5–15 executives):

1. **Framework**: React Native with Expo Router (TypeScript) sharing \`src/types.ts\` contracts.
2. **Offline-First Site Visits**: Store assigned site visits & property brochures locally with \`expo-sqlite\` and sync check-ins via \`PATCH /api/site-visits/:id\`.
3. **Push Notifications**: Firebase Cloud Messaging (FCM) alerts for instant Hot Lead assignments and WhatsApp AI handoffs.
4. **Click-to-Call & Location Check-In**: Native \`Linking.openURL('tel:...')\` and GPS verification on site visit completion.`,
  },
  {
    slug: 'testing-report',
    title: 'QA & Security Testing Report',
    category: 'Quality Assurance',
    content: `# QA & Security Verification Report — Avasa Realty CRM

## 1. Test Execution Summary
- **TypeScript Static Check (\`tsc --noEmit\`)**: Passed (0 errors).
- **Production Build (\`vite build\`)**: Passed.
- **Automated Integration & Security Suite (\`npm run test:integration\`)**: 15 / 15 Checks Passed.

## 2. Verified Functional & Security Scenarios
1. **Timezone & Currency Integrity**: Healthcheck verified \`Asia/Kolkata\` (IST) and \`INR\`.
2. **Authentication & Session Security**: Unauthenticated requests rejected with \`401 Unauthorized\`; Admin & Employee logins issue HMAC-SHA256 signed JWTs with \`scrypt\` salted password verification.
3. **Row-Level PII Protection**: Sales Executive (\`arjun@avasarealty.in\`) attempting to access an unassigned customer (\`cust-02\`) receives \`403 Forbidden\` and logs \`PII_ACCESS_DENIED\` to \`audit_logs\`.
4. **Lead Creation & Assignment Sync**: Assigning a lead via \`POST /api/leads/:id/assign\` atomically transfers ownership of the lead, WhatsApp conversation, pending automated follow-ups, and scheduled site visits.
5. **Property Inventory Coverage**: Verified filtering across Residential, Commercial, Plots & Land, Villas, Apartments, Rental, and Resale inventory.
6. **WhatsApp & Consent Enforcement**: Customer \`STOP\` reply immediately withdraws consent, pauses AI replies, blocks subsequent outbound agent messages (\`403\`), and skips opted-out contacts during campaign execution.
7. **Sales Pipeline & INR Financials**: Verified Site Visit booking/completion -> Unit Booking confirmation (GST calculation) -> Payment milestone generation -> 5% TDS (Section 194H) Commission calculation.
8. **Backups & Performance**: Admin database snapshot export succeeded (\`data/backups/*.json\`); filtered dashboard query completed in 7ms (< 150ms threshold).`,
  },
];
