# PermitTruck

## Overview

PermitTruck is a mobile-first Progressive Web App (PWA) designed to streamline the complex permit application process for food truck and trailer operators, starting with Connecticut. It offers town-specific guidance, document management, requirements checklists, and a gamified system to incentivize community contributions. The platform aims to become the definitive resource for food truck operators by crowdsourcing municipal permitting information through a "pioneer" model, enabling users to help build a comprehensive database of regulatory requirements.

## User Preferences

Preferred communication style: Simple, everyday language.

## What The App Does (User-Facing Features)

1. **Dashboard** — Shows your vehicles, recent permits, and quick actions
2. **Your Vehicles** — Add food trucks/trailers with documents (licenses, registrations, health permits). AI (Gemini) parses uploaded documents and extracts business info automatically into a Data Vault.
3. **New Permit Flow** — Step-by-step permit application for any of 169 CT towns:
   - Select a town → see its specific requirements checklist
   - View/download town-specific PDF permit forms
   - **Generate pre-filled PDFs** — auto-fills forms using your uploaded document data + Data Vault
   - **Portal automation** — for towns with online portals (ViewPoint, SeamlessDocs, OpenGov), the app can log in and fill forms automatically
   - Answer a dynamic questionnaire for any missing fields
   - Event details for temporary permits (dates, location, hours)
4. **Form Discovery** — Automatically crawls the web (Google/DuckDuckGo search → .gov sites) to find and download permit application PDFs for towns that don't have forms yet
5. **Pioneer Badges** — Gamification system that rewards users who contribute permit info for towns with low confidence scores
6. **Spots** — Map view (Leaflet) showing food truck locations
7. **Profile** — User account settings and preferences

## System Architecture

PermitTruck uses a monorepo architecture for its client, server, and shared code. The application is designed mobile-first, utilizing React 18 with TypeScript for the frontend and Node.js with Express for the backend.

### UI/UX Decisions
- **Mobile-First Design**: Features fixed bottom navigation, sticky top headers, and progressive disclosure for complex workflows through step-based forms.
- **Styling**: Employs Tailwind CSS with custom design tokens and a dark-first theme.
- **UI Components**: `shadcn/ui` built on Radix UI primitives for accessible and customizable components.

### Technical Implementations
- **Frontend**: Built with React 18, TypeScript, Wouter for routing, Zustand for state management (with persistence), and TanStack Query for server state. Vite handles the build process.
- **Backend**: Implemented with Node.js, Express, TypeScript (ESM modules), providing a RESTful JSON API.
- **Authentication**: Replit Auth via OpenID Connect with Passport.js + email/password login. Sessions stored in PostgreSQL.
- **Database**: PostgreSQL with Drizzle ORM. A shared schema (`shared/schema.ts`) ensures type safety across the application.
- **Key Data Models**: `profiles` (vehicles + documents), `permits` (applications), `towns` (169 CT towns with requirements + confidence scores), `town_forms` (official PDF forms with fileData), `health_districts`, `badges`, `data_vaults` (master structured data per profile), `portal_credentials` (encrypted login storage), `submission_jobs` (portal automation tracking).

### Core Systems

#### PDF Auto-Fill Pipeline
- **3-layer data merge** for form filling:
  1. Layer 1: Raw `parsedDataLog` from Gemini document analysis
  2. Layer 2: Data Vault structured fields (overrides Layer 1)
  3. Layer 3: User answers + event data (highest priority)
- **Datalab AI** for intelligent PDF field mapping (with caching)
- **Heuristic matching** as fallback (`smartMatchFieldToData`)
- **Cross-section deduplication** prevents contact info bleeding into event/commissary fields
- **`generateFieldMappingsFromNonFillablePDF()`** uses Gemini Vision to map visual form labels to data keys for non-fillable PDFs
- Endpoint: `POST /api/towns/:townId/forms/:formId/generate` (main PDF fill)
- Endpoint: `POST /api/towns/:townId/forms/:formId/generate-mappings` (Gemini Vision mapping)

#### Form Discovery (Web Crawling)
- Searches Google (with DuckDuckGo fallback) for .gov URLs with food truck permit PDFs
- Crawls discovered .gov pages with fetch+cheerio (fast); Playwright fallback for JS-heavy pages
- Follows one level of relevant sub-links (max 3 per page, max 8 .gov pages)
- Heuristic keyword filter (no AI cost) for identifying food truck application forms
- PDF validation, download with retry/backoff, fillability detection via pdf-lib
- 24-hour cooldown to prevent re-crawling; deduplication by source URL
- Endpoint: `POST /api/towns/:townId/discover` (trigger discovery)

#### Portal Automation
- **ViewPoint Cloud**: Login with stored credentials → catalog search → multi-step wizard field filling
- **SeamlessDocs / OpenGov**: Direct form filling via CSS selectors and label matching
- **Label-based fill (Pass 1)** + **selector fallback (Pass 2)** for all portal types
- **Portal Assist V1**: Copy-paste helper UI for any town with a portal URL
- Portal credentials encrypted with AES-256-GCM, stored per-user per-town
- Endpoint: `POST /api/portal-credentials` (store credentials)
- Endpoint: `POST /api/submissions/portal-automation` (create job)
- Endpoint: `POST /api/submissions/:jobId/execute` (run automation)

#### Data Vault
- **Profile** = Vehicle record + uploaded documents + raw AI extraction (`parsedDataLog`)
- **Data Vault** = Clean, structured fields extracted FROM the profile's parsed data
- **Relationship**: One vault per profile, linked by `profileId`. Created automatically when Gemini parses documents.
- **Vault query**: `GET /api/vault?profileId=xxx` returns the vault for a specific vehicle profile
- **Vault fields**: businessName, ownerName, phone, email, mailingStreet/City/State/Zip, vehicleVin, vehicleLicensePlate, vehicleMake/Model/Year, waterSupplyType, sanitizerType, hotHoldingMethod, coldHoldingMethod, commissaryName/Address, foodItemsList, prepLocationAddress, foodHandlerCertNumber, and more
- **Key files**: `server/lib/vault-service.ts` (sync + fill logic), `shared/schema.ts` (dataVaults table)

#### Dynamic Questionnaire
- Analyzes PDF form fields vs available profile data
- Generates questions only for fields that can't be auto-filled
- User answers feed into Layer 3 of the fill pipeline
- Endpoint: `POST /api/towns/:townId/forms/:formId/analyze-questions`

#### Pioneer Badge System
- Awards badges for contributing verified permit info for towns with low confidence scores
- Tracks contributions and displays on user profile

## External Dependencies

### Database
- **PostgreSQL**: Primary data storage.
- **Drizzle ORM**: Type-safe ORM for database interactions.

### Authentication
- **Replit Auth**: OAuth provider for user authentication.
- **Passport.js**: Authentication middleware.
- **express-session & connect-pg-simple**: Session management with PostgreSQL backing.

### PDF Processing
- **pdf-lib**: Library for PDF creation and manipulation.
- **@pdf-lib/fontkit**: For embedding fonts in PDFs.

### AI & Automation
- **Gemini 2.5 Flash**: Document parsing, data extraction, and non-fillable PDF field mapping.
- **Datalab API**: External service for AI-powered PDF form field analysis.
- **Playwright**: Browser automation for portal submissions and form discovery web crawling.
- **cheerio**: HTML parsing for fast web page crawling (used before Playwright fallback).

### UI/Component Libraries
- **Radix UI**: Accessible UI primitives.
- **shadcn/ui**: Pre-built components based on Radix UI.
- **Lucide React**: Icon library.
- **Embla Carousel**: Carousel component.
- **react-day-picker**: Date picker component.

### Form & Validation
- **Zod**: Runtime type validation.
- **React Hook Form**: For managing form state.
- **drizzle-zod**: Generates Zod schemas from Drizzle schemas.

### Mapping
- **Leaflet.js**: Interactive maps.
- **Nominatim**: Geocoding service.

### Utilities
- **date-fns**: Date manipulation utility.
- **Tesseract.js**: Client-side OCR for document scanning.

### Security
- **DOMPurify**: XSS sanitization.
- **express-rate-limit**: API rate limiting (200 req/15min on all /api routes).
- **crypto (Node.js)**: AES-256-GCM encryption for portal credentials.

---

## Progress Report (Last Updated: March 6, 2026)

### ✅ FULLY WORKING (Tested & Live)

| Feature | Status |
|---------|--------|
| Authentication | Working - Replit Auth + email/password login |
| Permit CRUD | Working - create, edit, delete, status updates |
| Town Database | Working - 169 CT towns seeded with requirements |
| Profile Management | Working - create profiles, upload documents |
| Document Upload & AI Extraction | Working - Gemini extracts data to parsedDataLog |
| Data Vault Auto-Sync | Working - vault populates automatically after document parsing, profile-aware |
| Pioneer Badge System | Working - awards badges for contributions |
| PDF Download | Working - download original town PDFs |
| Form Discovery | Working - verified for West Hartford (7 forms found and downloaded) |
| Dynamic Questionnaire | Working - analyzes forms, asks only for missing fields |

### ⚠️ CODE COMPLETE BUT NEEDS REAL-WORLD TESTING

| Feature | What's Missing |
|---------|----------------|
| PDF Auto-Fill (Datalab AI) | No recent end-to-end test after refactors |
| Portal Automation (ViewPoint) | Built but untested on a real ViewPoint portal |
| Portal Automation (SeamlessDocs/OpenGov) | Built but untested on real portals |
| Permit Packet Generator | Compiles but no smoke test evidence |
| Non-Fillable PDF Field Mapping (Gemini Vision) | Endpoint wired up, needs testing |

### 🔧 PARTIALLY IMPLEMENTED

| Feature | What's Done | What's Missing |
|---------|-------------|----------------|
| Portal Credentials | AES-256-GCM encryption, per-user per-town storage, credential dialog UI | Credential management/deletion UI |
| Data Vault | Auto-syncs, profile-aware, used in form filling | Multi-document conflict resolution |

### ❌ NOT STARTED
- CAPTCHA detection/handling for portal automation
- Analytics/telemetry
- Frontend polling when form discovery is in progress
- Multi-state expansion (currently CT only)

### 🐛 KNOWN ISSUES
1. Stale town cache after updates
2. Form discovery depends on search engine results (Google may CAPTCHA, DuckDuckGo is fallback)

### 📍 WHERE WORK LEFT OFF

**Last Session:** March 6, 2026 — GitHub Integration + Bug Fixes

**What Was Done:**
1. **Integrated 3 GitHub-pulled updates**:
   - `portal-automation-service.ts` — ViewPoint Cloud portal automation
   - `pdf-service.ts` — `generateFieldMappingsFromNonFillablePDF()` + cross-section dedup fix
   - `form-discovery-service.ts` — Complete rewrite using Playwright + Google/DuckDuckGo search
2. **Fixed TypeScript compilation errors** — `aiFieldMappings` type mismatch in schema, `vinPlate` missing from OCR types
3. **Fixed portal automation "400: Expected string, received null"** — `permitId` was hardcoded null, `vaultId` could be undefined
4. **Made vault profile-aware** — `/api/vault?profileId=xxx` now fetches the vault for the specific vehicle, not just any vault for the user
5. **Wired up new API endpoint** — `POST /api/towns/:townId/forms/:formId/generate-mappings` for Gemini Vision field mapping
6. **Removed duplicate route** — unauthenticated `GET /api/towns/:townId/forms` was dead code
7. **Verified form discovery works** — West Hartford has 7 forms crawled and stored

**Immediate Next Steps:**
1. Test PDF auto-fill end-to-end with Datalab on a real form
2. Test portal automation on a real ViewPoint portal
3. Add frontend polling for discovery-in-progress state
4. Build credential management UI (view/delete saved portal logins)

### 📁 Key Files
| Purpose | File |
|---------|------|
| Form Discovery (Web Crawl) | `server/lib/form-discovery-service.ts` |
| Data Vault Service | `server/lib/vault-service.ts` |
| Portal Automation | `server/lib/portal-automation-service.ts` |
| PDF Generation & Filling | `server/lib/pdf-service.ts` |
| Rate Limiting | `server/lib/rate-limiter.ts` |
| API Routes | `server/routes.ts` |
| Error Boundary | `client/src/components/error-boundary.tsx` |
| Requirements Checklist (forms UI) | `client/src/components/requirements-checklist.tsx` |
| Permit Detail Page | `client/src/pages/permit-detail.tsx` |
| New Permit Flow | `client/src/pages/new-permit.tsx` |
| Schema (all data models) | `shared/schema.ts` |
| Auth Routes | `server/replit_integrations/auth/routes.ts` |
