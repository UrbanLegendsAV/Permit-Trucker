# PermitTruck

## Overview

PermitTruck is a mobile-first Progressive Web App (PWA) designed to streamline the complex permit application process for food truck and trailer operators, starting with Connecticut. It offers town-specific guidance, document management, requirements checklists, and a gamified system to incentivize community contributions. The platform aims to become the definitive resource for food truck operators by crowdsourcing municipal permitting information through a "pioneer" model, enabling users to help build a comprehensive database of regulatory requirements.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

PermitTruck uses a monorepo architecture for its client, server, and shared code. The application is designed mobile-first, utilizing React 18 with TypeScript for the frontend and Node.js with Express for the backend.

### UI/UX Decisions
- **Mobile-First Design**: Features fixed bottom navigation, sticky top headers, and progressive disclosure for complex workflows through step-based forms.
- **Styling**: Employs Tailwind CSS with custom design tokens and a dark-first theme.
- **UI Components**: `shadcn/ui` built on Radix UI primitives for accessible and customizable components.

### Technical Implementations
- **Frontend**: Built with React 18, TypeScript, Wouter for routing, Zustand for state management (with persistence), and TanStack Query for server state. Vite handles the build process.
- **Backend**: Implemented with Node.js, Express, TypeScript (ESM modules), providing a RESTful JSON API.
- **Authentication**: Uses Replit Auth via OpenID Connect with Passport.js, storing sessions in PostgreSQL.
- **Database**: PostgreSQL with Drizzle ORM. A shared schema (`shared/schema.ts`) ensures type safety across the application.
- **Key Data Models**: Includes `profiles` (vehicle details), `permits` (applications), `towns` (permit requirements with confidence scores), `town_forms` (official PDF forms), `health_districts`, `badges`, and `data_vaults` (master data for auto-filling).
- **PDF Generation System**: Leverages Datalab AI for intelligent field matching, with `pdf-lib` as a fallback. Datalab semantically matches profile data to PDF form fields.
- **Pioneer Badge System**: A gamified system rewarding users for contributing verified permit information for new towns.
- **Submission Paths**: Supports PDF auto-fill for generating pre-filled PDFs, and future integration for portal automation using Playwright.
- **Autonomous System Core**:
    - **Data Vault**: Stores user business information extracted from uploaded documents by Gemini 2.5 Flash AI, forming a master profile.
    - **Form Detection & Classification**: Differentiates between fillable PDF forms (Type A) and web portal forms (Type B, e.g., SeamlessDocs, ViewPoint).
    - **AI-Powered Form Field Mapping**: Utilizes Datalab AI to map profile data to form fields, with caching and fallback heuristics.
    - **Dynamic Questionnaire System**: Prompts users for missing information based on form field requirements and available profile data.
    - **Portal Automation (Future)**: Planned system using Playwright for automated submission to web portals.
    - **Town Form Discovery Pattern**: A systematic approach for discovering, classifying, and processing town-specific forms.

### Feature Specifications
- **Town-by-Town Guidance**: Provides detailed permit requirements for specific municipalities, including a confidence score for data reliability.
- **Document Management**: Allows users to store and manage relevant documents.
- **Gamification**: Awards "Pioneer" badges for contributions to town permit information.
- **Autonomous Permit Filling**: Infrastructure for automatically filling PDF forms and future capabilities for submitting them via portals.

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
- **Gemini 2.5 Flash**: Used for document parsing and data extraction.
- **Datalab API**: External service for AI-powered PDF form filling.
- **Playwright**: For browser automation in portal submissions.

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
- **express-rate-limit**: API rate limiting middleware.
- **crypto (Node.js)**: Used for encrypting sensitive credentials.

---

## Progress Report (Last Updated: January 12, 2026)

### ✅ FULLY WORKING (Tested & Live)

| Feature | Status |
|---------|--------|
| Authentication | Working - Replit Auth + Passport.js |
| Permit CRUD | Working - create, edit, delete, status updates |
| Town Database | Working - 169 CT towns seeded with requirements |
| Profile Management | Working - create profiles, upload documents |
| Document Upload & AI Extraction | Working - Gemini extracts data to parsedDataLog |
| Pioneer Badge System | Working - awards badges for contributions |
| PDF Download | Working - download original town PDFs |

### ⚠️ CODE COMPLETE BUT UNTESTED

| Feature | What's Missing |
|---------|----------------|
| PDF Auto-Fill (Datalab AI) | No recent end-to-end test after refactors |
| Form Discovery (Web Crawling) | Rewritten to crawl real websites, needs real-world testing |
| Permit Packet Generator | Compiles but no smoke test evidence |

### 🔧 PARTIALLY IMPLEMENTED

| Feature | What's Done | What's Missing |
|---------|-------------|----------------|
| Data Vault Sync | Auto-syncs after document parsing, populates core fields | Multi-document conflict resolution |
| Portal Assist V1 | Copy-paste helper UI with clipboard support | Full portal automation |
| Portal Credentials | Encryption works | No UI to manage credentials |

### ❌ NOT STARTED
- Automated portal form submission (Playwright-based)
- CAPTCHA detection/handling
- ViewPoint-specific portal automation
- Analytics/telemetry
- Frontend polling when discovery is in progress

### 🐛 KNOWN ISSUES
1. Portal automation Playwright code exists but is brittle/untested - replaced with Portal Assist V1 (copy-paste)
2. Stale town cache after updates
3. Form discovery depends on town website URL patterns (may miss some towns)

### 📍 WHERE WORK LEFT OFF

**Last Session:** Surgical Fix Sprint (Feb 13, 2026)

**What Was Done:**
1. **Data Vault Auto-Sync** - Vault automatically populates after Gemini document parsing (single and multi-doc routes). Removed blocking "Data Vault Required" error. Profile data used as fallback if no parsedDataLog.

2. **Form Discovery Rewrite** - Complete rewrite using Playwright + Google/DuckDuckGo search:
   - Searches Google (with DuckDuckGo fallback) for .gov URLs with food truck permit PDFs
   - Crawls discovered .gov pages with fetch+cheerio (fast); Playwright fallback for JS-heavy pages
   - Follows one level of relevant sub-links (max 3 per page, max 8 .gov pages)
   - Heuristic keyword filter (no AI) for identifying food truck application forms
   - PDF validation, download with retry/backoff, fillability detection via pdf-lib
   - 24-hour cooldown to prevent re-crawling
   - Deduplication against existing forms by source URL

3. **PDF Generate Pipeline** - 3-layer data merge:
   - Layer 1: Parsed data from Gemini document analysis (parsedDataLog)
   - Layer 2: Data Vault structured fields (override parsed data)
   - Layer 3: User answers and event data (highest priority)
   - On-the-fly PDF download from sourceUrl when fileData is missing
   - Vault data passed to both Datalab API and local filling paths
   - Cross-section deduplication guard prevents contact info bleeding into event/commissary fields
   - `generateFieldMappingsFromNonFillablePDF()` uses Gemini Vision to map visual form labels to data keys (endpoint: POST `/api/towns/:townId/forms/:formId/generate-mappings`)

4. **Portal Automation** - ViewPoint Cloud support added alongside SeamlessDocs/OpenGov:
   - ViewPoint: login with stored credentials, catalog search, multi-step wizard field filling
   - Label-based fill (Pass 1) + selector fallback (Pass 2) for ViewPoint forms
   - Portal Assist V1 copy-paste helper for any town with a portal URL

5. **Security & Stability**
   - Global API rate limiter (200 req/15min) on all /api routes
   - React ErrorBoundary wrapping entire app
   - Enhanced env var validation at startup (required + optional)
   - tsconfig target updated to ES2020 for modern JS features

**Immediate Next Steps:**
1. Test form discovery on a town with no existing forms
2. Test PDF auto-fill end-to-end with Datalab
3. Add frontend polling for discovery-in-progress state
4. Test Portal Assist copy-paste flow on real portal

### 📁 Key Files
| Purpose | File |
|---------|------|
| Form Discovery (Web Crawl) | `server/lib/form-discovery-service.ts` |
| Data Vault Service | `server/lib/vault-service.ts` |
| Portal Automation | `server/lib/portal-automation-service.ts` |
| PDF Generation | `server/lib/pdf-service.ts` |
| Rate Limiting | `server/lib/rate-limiter.ts` |
| API Routes | `server/routes.ts` |
| Error Boundary | `client/src/components/error-boundary.tsx` |
| Permit UI | `client/src/pages/permit-detail.tsx` |
| Schema | `shared/schema.ts` |