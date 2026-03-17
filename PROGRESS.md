# PermitPilot — Project Progress

> **App name:** PermitPilot (rebranded from PermitTruck — March 2026)
> **Domain:** permitpilot.cloud
> **Repo:** github.com/UrbanLegendsAV/Permit-Trucker
> **Hosting:** Replit
> **Last updated:** March 17, 2026 (Sessions 1–3 complete)

---

## Phase 1: Core Platform (COMPLETE)

### Authentication & User Management
- [x] Replit Auth integration with OpenID Connect
- [x] PostgreSQL-backed sessions via connect-pg-simple
- [x] User profiles synchronized to database on login
- [x] Role-based access (user, admin, owner)

### Onboarding Flow
- [x] Multi-step questionnaire for new users
- [x] Vehicle type selection (food truck, trailer, cart)
- [x] Business information collection
- [x] Equipment checklist
- [x] **Docs-first 5-step redesign** (see Phase 9)

### Vehicle Profiles
- [x] Create/edit vehicle profiles
- [x] Document upload capability
- [x] Vehicle-specific permit tracking
- [x] Multiple vehicles per user support

### Permit Management
- [x] Town selector with search/filter
- [x] Permit application workflow
- [x] Status tracking (pending, approved, denied, expired)
- [x] Document requirements checklist
- [x] Requirements display per town

### Town Database
- [x] 20 Connecticut towns seeded with permit data
- [x] Confidence score system (0-100)
- [x] Requirements JSON structure
- [x] Form types (online_portal, pdf_download, mail_in)
- [x] Fee structures per permit type

### Gamification System
- [x] Badge schema and types
- [x] Pioneer badge for low-confidence towns
- [x] Badge display on profile/dashboard

### Navigation
- [x] Mobile-first bottom navigation
- [x] Dashboard, Permits, Badges, Discover, Profile tabs
- [x] Responsive design with dark mode support

---

## Phase 2: Consumer Discovery & Admin (COMPLETE)

### Consumer Discovery Page
- [x] Vanilla Leaflet.js map implementation
- [x] GPS location detection
- [x] Zip/city search via Nominatim geocoding
- [x] Food truck markers on map
- [x] Click-to-view truck detail panels

### Public Profiles for Truckers
- [x] Opt-in public profile toggle
- [x] Business name, description, location
- [x] Operating hours configuration
- [x] Menu items management
- [x] GPS location picker for current location
- [x] Phone number and website fields

### Reviews System
- [x] Star rating component (1-5 stars)
- [x] Anonymous review submission
- [x] Optional reviewer name + review text
- [x] IP-based rate limiting (max 5 reviews/hour)
- [x] Reviews displayed in truck panels

### Admin Dashboard
- [x] Role-based access control (admin/owner only)
- [x] Pricing management (Pro/Basic plan sliders)
- [x] Town database CRUD operations
- [x] User role assignment (owner-only)
- [x] Configuration storage in database
- [x] Reviews moderation queue (approve/deny/delete)

### Permit Packet Generation
- [x] Print-ready permit application packets
- [x] Town requirements, fees, and deadlines included
- [x] Applicant information section
- [x] Document checklist with status indicators
- [x] Signature block for manual signing
- [x] Browser print dialog for PDF generation

### OCR Document Scanning
- [x] Tesseract.js integration for image scanning
- [x] Pattern extraction for dates, licenses, VIN/plates
- [x] Auto-fill onboarding fields from scanned documents
- [x] Scan button appears on image uploads only

### PWA Support
- [x] Web app manifest with proper icons and metadata
- [x] Service worker for offline caching
- [x] Stale-while-revalidate strategy for static assets
- [x] Network-first strategy for API calls with offline fallback

### Database Schema Additions
- [x] `public_profiles` table with business info
- [x] `reviews` table with IP tracking
- [x] `configs` table for admin settings
- [x] `role` enum added to users table
- [x] Default configs seeded on startup

---

## Phase 3: TruckPermitAI — Intelligent Form Filling (COMPLETE)

### Auto-OCR Document Processing
- [x] Auto-run Tesseract.js OCR on image upload
- [x] Extract VIN, license plates, dates, license numbers
- [x] Auto-populate vehicle profile fields from OCR data
- [x] Toast notifications showing extracted data

### Smart Form Pre-Filling
- [x] "Pre-Fill with My Data" button for fillable town forms
- [x] Profile data mapping (business name, VIN, commissary info)
- [x] PDF auto-fill with pdf-lib using AcroForm fields
- [x] Download pre-filled PDFs
- [x] Bethel 9-page form fully mapped (46 form fields)
- [x] Contact info auto-fill (name, address, phone, business name)
- [x] Checkbox auto-fill (water supply, toilet facilities, license type)
- [x] Event section fields (location, dates, hours — from permit wizard)

### Location Optimizer (Spots)
- [x] New Spots page for finding high-traffic locations
- [x] Town search with suggestions
- [x] Mock spot recommendations (breweries, markets, parks)
- [x] Traffic prediction badges (high/medium/low)
- [x] Venue ratings and directions links
- [x] Added to bottom navigation
- [ ] Google Places API integration (requires API key)

### Official Town Forms
- [x] Town forms database table
- [x] Bethel CT forms added (4 official forms)
- [x] Form display with category badges
- [x] External links to municipality websites
- [x] Fillable form indicators

### Gemini AI Integration
- [x] Document parsing with Gemini 2.5 Flash
- [x] Structured data extraction for profiles
- [x] Dynamic category support
- [x] ParsedUserData TypeScript interface for type safety

### Connecticut Health Districts & Town Coverage
- [x] Health districts table with normalized data
- [x] All 169 CT towns seeded with county and health district associations
- [x] District-based filtering in town search
- [x] Auto-populate portal URLs from health district websites
- [x] API: GET /api/health-districts, GET /api/health-districts/:id/towns

---

## Phase 4: Autonomous PDF Filling Infrastructure (COMPLETE)

### Database-Backed Form System
- [x] `town_forms` table: id, townId, name, formType, fileData (base64), fieldMappings (JSON), isFillable, sourceUrl
- [x] Admin dashboard form upload (PDF file + metadata)
- [x] Base64 encoding for PDF storage in PostgreSQL
- [x] API: GET /api/towns/:townId/forms
- [x] API: POST /api/towns/:townId/forms/:formId/generate

### PDF Generation Pipeline
- [x] `fillPdfFromDatabase()` in server/lib/pdf-service.ts
- [x] Uses pdf-lib to load PDF and access AcroForm fields
- [x] Maps profile data to form fields using fieldMappings JSON
- [x] Returns filled PDF as binary blob for download

### Datalab AI Integration
- [x] Datalab API key in Replit Secrets
- [x] AI-powered semantic field detection and matching
- [x] Automatic fallback: uses Datalab when fieldMappings is empty
- [x] Async polling for Datalab job completion (up to 60 seconds)
- [x] Fallback to local pdf-lib filling if Datalab fails

### Master Data Vault
- [x] `data_vaults` table with 50+ standardized fields
- [x] Single source of truth for all user data
- [x] Fields: businessName, ownerName, address, phone, email, ein, vehicleInfo, licenses, insurance, etc.
- [x] Sync from parsed documents via syncParsedDataToVault()
- [x] Completeness scoring for data quality

### Submission Jobs Tracking
- [x] `submission_jobs` table for tracking fill/automation jobs
- [x] Status: pending, processing, completed, failed, needs_approval
- [x] Stores filled PDF result for download
- [x] Error logging for debugging

### ViewPoint Cloud Portal Automation
- [x] Playwright-based portal automation in server/lib/portal-automation-service.ts
- [x] AES-256-CBC encrypted credential storage
- [x] Navigate to OpenGov/ViewPoint portals
- [x] Fill fields programmatically
- [x] Submit with user approval gate

### Form Discovery Service
- [x] Rewrote from AI URL hallucination to real Playwright web crawler
- [x] Crawls town and health district websites for permit PDFs
- [x] Live end-to-end fill test vs West Hartford Temporary Food Permit — 100% accuracy on 25 fields

---

## Phase 5: PermitPilot Rebrand + CT Food Truck Directory (COMPLETE)

### Rebrand: PermitTruck → PermitPilot (commit 442907b)
- [x] All "PermitTruck" strings replaced across client/, server/, configs
- [x] package.json name → "permit-pilot"
- [x] index.html title → "PermitPilot — Your Permit Copilot"
- [x] User-Agent strings updated to PermitPilot/1.0
- [x] Fonts swapped: Inter → Plus Jakarta Sans (display) + DM Sans (body)
- [x] tailwind.config.ts: fontFamily.display + fontFamily.body tokens added
- [x] CSS brand color tokens added to index.css:
  - `--color-primary: #1B4FD8` (Authority Blue)
  - `--color-success: #00C896` (Clearance Green)
  - `--color-bg-dark: #0A0F1E` (Midnight Navy)
  - `--color-warning: #F5A623` (Permit Amber)
  - `--color-bg-light: #F5F7FA` (Cloud White)
  - `--color-text-secondary: #8897B2` (Slate Gray)
- [x] Logo SVGs wired in: logo-light.svg, logo-dark.svg, icon.svg, icon-dark.svg
- [x] manifest.json icon paths updated
- [x] All UI components updated (top-header, landing, auth, profile, permit-packet)

### Domain & Email Infrastructure
- [x] Domain purchased: `permitpilot.cloud` (GoDaddy, $2.99/yr)
- [x] SendGrid domain authentication verified for `permitpilot.cloud`
- [x] SendGrid domain authentication verified for `brazilianbbqboys.com` (existing)
- [x] Ready to send from `hello@permitpilot.cloud` or `outreach@permitpilot.cloud`
- [x] Existing SendGrid Essentials 50K plan ($19.95/mo) — no upgrade needed

### CT Food Truck Directory (commit 87d949e)
- [x] `food_trucks` table added to shared/schema.ts (16 fields)
  - slug, name, cuisine, towns[], website, email, phone, instagramHandle
  - description, status (unclaimed/claimed/listed), imageUrl, source
  - outreachSent (boolean), outreachSentAt, createdAt
- [x] Auto-migration via runMigrations() in server/db.ts on startup
- [x] 8 CT food trucks seeded in server/seed.ts:
  - Brazilian BBQ Boys (status: claimed)
  - Taco Road Trip, Rich's Wings & Things, Jesse's Ice Cream Truck
  - Nicky Zooks, Fullmoon Taco Truck, The Blind Rhino, Chefo's Eatery (all unclaimed)
- [x] API: GET /api/directory (public, ?cuisine= and ?town= filters)
- [x] API: GET /api/directory/:slug (public, single truck)
- [x] API: POST /api/directory/claim (auth-required, sets status → claimed)
- [x] Page: /directory — dark navy hero, sticky filter bar, responsive card grid
  - Green "Claimed" badge / Amber "Unclaimed — Is this yours?" badge
  - Live text + cuisine + town filtering
- [x] Page: /directory/:slug — individual truck profile
  - Amber banner for unclaimed trucks with "Claim Listing" CTA
  - Town pills, business links, contact info
  - "File permit for [town]" buttons → /new-permit?town=X (monetization hook)
- [x] Routes added to App.tsx: /directory and /directory/:slug
- [x] "Directory" link added to public nav (no login required)

---

## Phase 5B: Public Access, Catering, Rich Profiles, Map Toggle (COMPLETE)

### Public Access
- [x] /directory and /directory/:slug confirmed public — no auth middleware
- [x] /api/public-profiles and /api/reviews/:id confirmed public
- [x] mobile-nav.tsx checks useAuth() — returns null for unauthenticated visitors
- [x] top-header.tsx: auth-aware — public nav (Find Trucks | For Food Trucks | Sign In + List Your Truck) for visitors, theme toggle + notifications for logged-in users
- [x] / root redirects unauthenticated users to /directory (was /discover)

### Unified Map + Directory
- [x] directory.tsx: Grid View / Map View toggle added to filter bar
- [x] Map View embeds Leaflet map from /api/public-profiles data inline in /directory
- [x] /discover redirects to /directory?view=map

### Catering Fields (food_trucks table)
- [x] 9 new fields added to shared/schema.ts: offersPrivateCatering, cateringMinGuests, cateringMaxGuests, cateringPricePerPerson, cateringDescription, cateringEventTypes[], cateringContactEmail, cateringContactPhone, cateringWebsite
- [x] Migration added to server/db.ts runMigrations()
- [x] Seed data updated: Brazilian BBQ Boys (full catering profile), Taco Road Trip, The Blind Rhino (catering enabled)

### Rich Truck Profile (/directory/:slug)
- [x] SEO: document.title + meta description via useEffect
- [x] JSON-LD structured data (FoodEstablishment schema)
- [x] Hero band (180px, cuisine-based background color)
- [x] Unclaimed amber banner with Claim Listing button
- [x] Two-column layout: 65% content / 35% sidebar
- [x] About section, Where We Operate (town pills), Catering section (event type tags, guest range, price, CTA button)
- [x] Right sidebar: contact card, Share link, Permit Status card, Report incorrect info
- [x] Bottom CTA strip: permit filing upsell
- [x] TopHeader with public nav wired in

### Outreach Email Update
- [x] Catering section added to email: asks for yes/no, event types, guest range, price, contact

---

## Phase 7: Complete Permit Data Collection (COMPLETE)

### Auto-fill Data Pipeline — End-to-End
- [x] New onboarding step "Suppliers & Operations" (step 3 of 6)
  - Food suppliers section: repeatable name+what inputs, quick-add suggestion chips
  - Commissary extension: phone, commissary contract toggle
  - Overnight parking: address + authorization toggle
  - Electricity source: dropdown (Generator gas/propane, Shore power, Solar, None, Other)
  - Generator make/model (conditional on Generator selection)
  - Wastewater disposal, Hand washing setup, Interior surfaces, Garbage setup (all with pre-fill on focus)
- [x] `food_suppliers` table added (id, userId, profileId, supplierName, suppliesWhat, createdAt)
- [x] `operations_data` JSONB column added to profiles table
- [x] 10 new fields added to `data_vaults` table:
  - foodSuppliers, electricitySource, generatorInfo, wasteWaterDisposal
  - handWashingSetup, truckInteriorDescription, garbageSetup
  - overnightParkingAddress, overnightParkingAuthorized, hasCommissaryContract
- [x] `syncProfileToVault()` maps all new operations fields + builds foodSuppliers from food_suppliers table
- [x] `buildDataMapFromParsedData()` + `fillPdfFromDatabase()` include all new vault fields
- [x] `smartMatchFieldToData()` extended: waste water, garbage, hand washing, electricity, floor/interior, supplier patterns
- [x] Past permit PDF parsing via Gemini Vision (`parsePastPermit()`)
  - POST /api/profiles/:id/parse-past-permit — accepts base64 PDF, extracts 20 fields, syncs to vault
  - profile.tsx: "Upload Past Permit" button per vehicle profile
- [x] Vault completeness score on profile page
  - 17-field coverage check, color-coded (green/amber/red)
  - Progress bar + missing field list
- [x] API: GET /api/suppliers, POST /api/suppliers, DELETE /api/suppliers/:id
- [x] Onboarding saves suppliers + operations data + calls sync-vault on profile creation
- [x] Vault sync bug fix: PATCH /api/profiles/:id now calls syncProfileToVault() fire-and-forget

---

## Phase 6: SendGrid Outreach Agent (COMPLETE)

### Completed
- [x] Built server/lib/outreach-service.ts
  - `extractEmailFromWebsite()` — fetches truck website, regex-extracts contact email
  - `buildOutreachEmail()` — branded HTML template with listing URL + permit upsell
  - `runOutreachAgent()` — iterates unclaimed trucks, sends via SendGrid, marks outreachSent
  - `sendTestOutreachEmail()` — preview send without touching DB
  - Sends from hello@permitpilot.cloud, 1 email/sec rate limit
- [x] @sendgrid/mail installed in package.json
- [x] Branded HTML email template — #0A0F1E header, #1B4FD8 CTA, opt-out footer
- [x] POST /api/admin/outreach — admin-only, 24h cooldown via configs table
- [x] POST /api/admin/outreach/test — single test send, no DB changes
- [x] Admin "Outreach" tab (6th tab in admin.tsx)
  - Stats: unclaimed total / with contact / already sent
  - Test form: email + truck slug dropdown
  - Run button with amber warning + results table

---

---

## Phase 8: PermitPilot Orchestrator + Doc Parsing Pipeline (COMPLETE — commit 1881eed)

### Document Parsing Pipeline (FIX 1-6)
- [x] `POST /api/profiles/:id/parse-document/:docIndex` — per-doc Gemini parse endpoint
  - Extracts base64 from data URI, calls Gemini 2.5 Flash, computes newFields/updatedFields diff
  - Marks `analyzedAt` on document, calls `syncParsedDataToVault()`, returns vault completeness
- [x] Document Detail Modal in vehicle-card.tsx
  - PDF preview via `URL.createObjectURL(blob)` iframe; image preview via `<img>`
  - Category badge + `analyzedAt` parse status indicator
  - "Extract Data from This Doc" button triggers per-doc parse
  - Green feedback banner with two-column new/updated fields diff after extraction
  - "Download" + "Close & Refresh" buttons
- [x] Thumbnail parse status indicators — green `CheckCircle2` if `analyzedAt`, amber `Circle` if not
- [x] "AI Analyze All Documents" updated — sequential per-doc with 1s delay, shows "Parsing doc X of Y..."
- [x] `PATCH /api/vault/field` — single vault field manual save (looks up vault by userId)
- [x] profile.tsx missing fields → interactive vault checklist
  - Tap any missing field to open inline input, save via PATCH /api/vault/field
  - Enter to save, Escape to cancel

### Inbound Email Routing
- [x] `inbound_emails` table: messageId (dedup), from, to, subject, bodyText, bodyHtml, intent, truckSlug, handledBy, replySent, rawPayload
- [x] `agent_logs` table: agentName, action, input, output, success, errorMessage, durationMs, relatedEmailId, relatedTruckSlug
- [x] `opted_out` boolean column added to food_trucks table
- [x] `POST /api/email/inbound` — public SendGrid Inbound Parse webhook
  - **multer middleware** parses multipart/form-data (fixed in Phase 11)
  - Deduplicates by Message-ID header
  - Saves raw email, calls processInboundEmail() fire-and-forget
  - Always returns 200 (prevents SendGrid retry storms)

### Orchestrator (server/lib/orchestrator.ts)
- [x] Claude claude-sonnet-4-6 intent classifier — 6 intents: claim_listing, catering_reply, permit_inquiry, opt_out, general_inquiry, spam
- [x] **Claim Agent** — extracts truck name with Claude, matches food_trucks table by email/domain/name, sets status→claimed, sends confirmation email
- [x] **Catering Agent** — extracts catering fields from email body with Claude (incl. phone + website), 4-pass truck matching, personalized confirmation with event types + permit CTA (bugs fixed in Phase 11)
- [x] **Permit Inquiry Agent** — extracts CT town name, looks up towns table, generates personalized reply with Claude (fee, form type, portal URL)
- [x] **Opt-Out Agent** — sets opted_out=true on food_trucks, suppresses future outreach, sends removal confirmation
- [x] **General Inquiry Agent** — Claude generates branded PermitPilot support reply
- [x] All sub-agents write to agent_logs for full audit trail
- [x] `classifyEmailDryRun()` — dry-run classify for admin testing (no email sent)

### Admin Dashboard — Orchestrator Tab
- [x] Stats row: Total emails | Claimed via email | Permit inquiries | Opt-outs
- [x] Recent inbound emails table (paginated 20/page): From | Subject | Intent | Truck | Status | Time
- [x] Agent logs table (paginated 20/page): Agent | Action | Success | Duration | Time
- [x] "Test Orchestrator" dry-run panel: paste email body → Classify Intent → shows intent + sub-agent (no email sent)
- [x] Admin endpoints: GET /api/admin/orchestrator/stats, /emails, /logs, POST /api/admin/orchestrator/classify

### Anthropic SDK
- [x] @anthropic-ai/sdk ^0.79.0 installed in package.json
- [x] multer + @types/multer installed (multipart/form-data parsing for SendGrid webhook)

### SendGrid Inbound Parse Setup (instructions in route comment)
- MX record: mail.permitpilot.cloud → mx.sendgrid.net (Priority 10)
- Webhook URL: https://permitpilot.cloud/api/email/inbound

---

## Phase 9: Docs-First Onboarding + Claim Flow (COMPLETE)

### Docs-First Onboarding Redesign (onboarding.tsx)
- [x] 5-step flow: Vehicle Type → Business Info → Your Documents → Fill Gaps → Visibility
- [x] Draft profile auto-created after step 1 (business info) so profile ID is available for per-doc parsing
- [x] Step 2 — 7 categorized document upload zones (health permit, state license, vehicle registration, insurance, commissary contract, past permit, other)
- [x] Per-doc AI parsing: reads file → PATCH profile uploadsJson → POST parse-document/:docIndex → updates vault score
- [x] "Skip all and enter manually →" link always visible
- [x] Step 3 (Fill Gaps) adapts based on vault completeness:
  - ≥85%: success screen ("You're all set!")
  - 60–84%: show missing fields only (targeted gap-fill)
  - <60%: full suppliers + operations form
- [x] `VAULT_FIELD_INPUTS` map: vault key → input metadata (label, placeholder, type)
- [x] `gapFillValues` local state: each missing field saved via `PATCH /api/vault/field` on finish
- [x] `finishMutation`: saves suppliers, syncs vault, creates public profile from draft

### Claim Flow (/claim/:slug)
- [x] New page: `client/src/pages/claim-flow.tsx` — 4 steps:
  1. **Verify** — shows truck card, "This is my truck" button
  2. **Merge confirmation** — field-by-field green ✓ / amber ○ diff
  3. **Doc upload** — same 7-zone pattern as onboarding with per-doc parsing
  4. **Done** — vault score + live listing URL
- [x] `POST /api/directory/:slug/claim-authenticated` — sets status→claimed, claimedByUserId, claimedAt; creates vehicle profile; calls syncProfileToVault(); seeds email/name into vault; returns `{ success, profileId, truckData }`
- [x] `truck-profile.tsx` claim button: authenticated → `/claim/:slug`, unauthenticated → `/auth?next=/claim/:slug`
- [x] `use-auth.ts`: `loginMutation` + `registerMutation` `onSuccess` now read `?next=` param and redirect accordingly
- [x] `App.tsx`: route `/claim/:slug` → `<ClaimFlow>`

---

## Phase 10: Admin / Data Fixes (COMPLETE)

### ADMIN_EMAILS Auto-Grant
- [x] `ADMIN_EMAILS` env var (comma-separated) processed in `runMigrations()` on every startup
- [x] `UPDATE users SET role = 'owner' WHERE email = $1 AND role != 'owner'` — idempotent

### Brazilian BBQ Boys Data Fixes (db.ts startup UPDATEs)
- [x] Corrects email → `brazilianbbqboys@gmail.com`
- [x] Corrects catering contact email (was `catering@brazilianbbqboys.com`)
- [x] Fixes description (removed chimichurri; uses authentic churrasco copy)
- [x] Expands towns: Danbury, Ridgefield, Hartford, West Hartford, New Haven, Fairfield County
- [x] Links truck to admin user account via `claimed_by_user_id` (matches any of 3 known admin emails)

### Seed Data
- [x] `food_trucks` insert switched to `onConflictDoUpdate` — safe to re-run on every startup
- [x] Brazilian BBQ Boys seed row corrected to match production data

### Background Services (server/index.ts)
- [x] Enrichment stub: `setTimeout` 10s → imports `truck-enrichment-service.ts`, calls `enrichAllTrucks()` if present
- [x] Geocoding stub: `setTimeout` 15s → imports `geocoding-service.ts`, calls `geocodeAllTrucks()` if present

### Profile Page — Account Info
- [x] Role badge shown next to display name: green "Owner" badge or blue "Admin" badge
- [x] User email displayed in profile card

### Mobile Nav — Admin Link
- [x] `useQuery` for `/api/me/role` added to `MobileNav`
- [x] Admin nav item (`ShieldCheck` icon) appended only for `owner` or `admin` roles
- [x] Nav item min-width reduced from 64px → 56px to fit 6 items

### Schema
- [x] `claimedByUserId` + `claimedAt` columns added to `food_trucks` in `shared/schema.ts`
- [x] Migration added to `runMigrations()`

---

## Phase 11: Orchestrator Bug Fixes (COMPLETE)

### BUG 1 — Multipart Parsing (from/subject null in admin)
- [x] `multer` + `@types/multer` installed
- [x] `multerMemory.any()` middleware added to `POST /api/email/inbound`
- [x] SendGrid's `multipart/form-data` payload now parsed correctly — `from`, `to`, `subject`, `text`, `html` all populated

### BUG 2 — Catering Reply Misclassified as Spam
- [x] `classifyEmailIntent()` prompt strengthened with explicit catering signals:
  - Phrases: "yes we cater", "we offer catering", "we do events", "our minimum is"
  - Data types: event types, guest counts, pricing, capacity, booking contact info
  - Rule: classify as `catering_reply` even with generic subject line if body contains these signals

### BUG 3 — Catering Reply: Richer Extraction + Personalized Confirmation
- [x] Extraction JSON schema now includes `cateringContactPhone` + `cateringWebsite`
- [x] Confirmation email is personalized:
  - Names specific event types extracted (e.g., "weddings, corporate events")
  - Shows capacity range and pricing if extracted
  - Includes permit CTA: "CT events need per-town temporary food service permits — file in 60 seconds at permitpilot.cloud"
- [x] Email subject includes truck name: "Your catering info is live on PermitPilot — {truck name}"

### BUG 4 — 4-Pass Truck Matching
- [x] Applied to `handleCateringReply()` and `handleOptOut()`:
  1. **Pass 1**: Exact email match (`food_trucks.email = senderEmail`)
  2. **Pass 2**: Sender domain vs truck website domain (skips free email hosts: gmail/yahoo/hotmail)
  3. **Pass 3**: Claude extracts truck name from email → fuzzy slug/name match
  4. **Pass 4**: Graceful no-match — logs to `agent_logs`, returns without sending email

---

## Technical Architecture

### Frontend Stack
- React 18 + TypeScript
- Vite build tool
- Tailwind CSS with dark mode
- shadcn/ui component library
- Wouter for routing
- Zustand for local state
- TanStack Query for server state
- Vanilla Leaflet.js for mapping

### Backend Stack
- Node.js + Express
- PostgreSQL via Drizzle ORM
- Replit Auth (OpenID Connect)
- Passport.js for auth middleware
- Playwright (Chromium) for portal automation + form discovery
- SendGrid (Essentials 50K) for transactional email

### Key Files
| File | Purpose |
|------|---------|
| `shared/schema.ts` | Database schema + types (includes food_trucks table) |
| `server/routes.ts` | API endpoints (includes /api/directory routes) |
| `server/storage.ts` | Data access layer |
| `server/seed.ts` | Town + food truck seeding |
| `server/seed-ct-towns.ts` | All 169 CT towns with health districts |
| `server/lib/pdf-service.ts` | PDF generation with pdf-lib + Datalab |
| `server/lib/portal-automation-service.ts` | Playwright portal automation |
| `server/lib/form-discovery-service.ts` | Playwright web crawler for form discovery |
| `server/lib/vault-service.ts` | Master data vault operations |
| `server/lib/orchestrator.ts` | Autonomous email orchestrator + 5 sub-agents |
| `client/src/App.tsx` | Main router |
| `client/src/pages/directory.tsx` | Public CT food truck directory |
| `client/src/pages/truck-profile.tsx` | Individual truck listing page |
| `client/src/pages/discover.tsx` | Consumer map page |
| `client/src/pages/admin.tsx` | Admin dashboard |
| `client/src/pages/profile.tsx` | User profile page |
| `client/src/pages/onboarding.tsx` | Docs-first 5-step onboarding flow |
| `client/src/pages/claim-flow.tsx` | 4-step truck claim flow (/claim/:slug) |
| `client/public/sw.js` | Service worker for PWA |
| `BRAND_BIBLE.md` | Brand identity source of truth |

### Secrets in Replit (never in source code)
| Secret Key | Purpose |
|------------|---------|
| `GOOGLE_API_KEY` | Gemini Vision for non-fillable PDF mapping |
| `SENDGRID_API_KEY` | Transactional email via SendGrid |
| `SESSION_SECRET` | Express session signing |
| `DATALAB_API_KEY` | Datalab AI for PDF field matching |
| `ANTHROPIC_API_KEY` | Claude claude-sonnet-4-6 for orchestrator intent classification + sub-agent replies |

---

## API Endpoints

### Public (no auth)
- `GET /api/directory` — List all food trucks (?cuisine= ?town= filters)
- `GET /api/directory/:slug` — Single truck by slug
- `GET /api/public-profiles` — List public food trucks (map)
- `GET /api/reviews/:publicProfileId` — Reviews for a truck
- `POST /api/reviews` — Submit anonymous review

### Authenticated
- `POST /api/directory/claim` — Claim a truck listing (legacy)
- `POST /api/directory/:slug/claim-authenticated` — Full claim: sets status, creates profile, syncs vault
- `GET /api/profiles` — User's vehicle profiles
- `POST /api/profiles` — Create vehicle profile
- `GET /api/permits` — User's permits
- `POST /api/permits` — Create permit application
- `GET /api/badges` — User's earned badges
- `GET /api/towns` — All towns with requirements
- `GET /api/me/role` — Current user's role
- `GET /api/health-districts` — All CT health districts
- `GET /api/towns/:townId/forms` — Forms for a town
- `POST /api/towns/:townId/forms/:formId/generate` — Generate filled PDF

### Admin Only
- `GET/POST /api/admin/configs` — Manage settings
- `POST/PATCH/DELETE /api/admin/towns` — Town CRUD
- `POST /api/admin/towns/:townId/forms` — Upload form
- `POST /api/admin/outreach` — Run SendGrid outreach agent (24h rate limit)
- `POST /api/admin/outreach/test` — Send single test email (no DB changes)

### Owner Only
- `PATCH /api/admin/users/:id/role` — Assign user roles

---

## Configuration Defaults
| Setting | Default | Description |
|---------|---------|-------------|
| `pro_price` | $99 | Pro plan monthly price |
| `basic_price` | $0 | Basic plan (free) |
| `max_vehicles` | 5 | Max vehicles per user |
| `pioneer_threshold` | 60% | Confidence below which Pioneer badge earned |

---

## Workflow Rules (never break these)
1. **All code changes in Claude Code (terminal)** — commit to GitHub
2. **Replit is for `git pull` and live testing only** — zero code edits in Replit
3. **Secrets stay in Replit Secrets** — never hardcode API keys in source
4. **AI hallucination ≠ real crawling** — use Playwright for form discovery, not Gemini URL guessing

---

*Source of truth for PermitPilot. Drop updated versions in project root as PROGRESS.md.*
