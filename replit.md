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
| Portal Automation V1 | Playwright code exists, never run against real SeamlessDocs form |
| Permit Packet Generator | Compiles but no smoke test evidence |

### 🔧 PARTIALLY IMPLEMENTED

| Feature | What's Done | What's Missing |
|---------|-------------|----------------|
| Data Vault Sync | Populates core fields | Multi-document conflict resolution |
| Portal Credentials | Encryption works | No UI to manage credentials |

### ❌ NOT STARTED
- Automated portal form submission (click Submit)
- CAPTCHA detection/handling
- ViewPoint-specific portal automation
- Analytics/telemetry

### 🐛 KNOWN ISSUES
1. Portal automation only has SeamlessDocs heuristics
2. No retry/backoff for brittle automation
3. Stale town cache after updates

### 📍 WHERE WORK LEFT OFF

**Last Session:** Automatic Form Discovery Feature (Feb 03, 2026)

**What Was Done:**
1. **NEW FEATURE: Automatic Form Discovery**
   - Created `server/lib/form-discovery-service.ts` - AI-powered service to find permit PDFs on town websites
   - Uses Gemini AI to search for official permit application forms
   - Automatically downloads discovered PDFs and stores them in `town_forms` table
   - Marks forms as AI-discovered (`isAiDiscovered=true`)

2. **Auto-Discovery Integration**
   - `GET /api/towns/:townId/forms` now auto-triggers discovery when no forms exist for a town
   - Runs discovery in background to avoid blocking the response
   - Returns `discoveryStarted: true` or `discoveryInProgress: true` status to frontend
   - Includes deduplication to prevent concurrent discoveries for the same town

3. **Manual Discovery Endpoint**
   - `POST /api/towns/:townId/discover-forms` - Manually trigger form discovery
   - Supports `force: true` to re-discover even if forms already exist
   - Returns detailed results including forms found, downloaded, and source URLs

4. **Error Handling & Safety**
   - Checks if `GOOGLE_API_KEY` is configured before attempting discovery
   - Uses in-memory tracking to prevent duplicate concurrent discoveries
   - Timeout protection on PDF downloads (30 seconds)
   - Graceful cleanup on errors

**What Was NOT Done:**
- Did not fully test the discovery feature end-to-end (user should test by visiting a permit for a town with no forms)
- Frontend does not yet poll/refresh when discovery is in progress

**Immediate Next Steps:**
1. User should test: Start a permit for West Hartford → Observe auto-discovery triggered → Refresh to see discovered forms
2. Consider adding frontend polling to auto-refresh when `discoveryStarted: true`
3. Test portal automation on Brookfield SeamlessDocs
4. Verify PDF auto-fill still works with Datalab

### 📁 Key Files
| Purpose | File |
|---------|------|
| Form Discovery | `server/lib/form-discovery-service.ts` |
| Portal Automation | `server/lib/portal-automation-service.ts` |
| PDF Generation | `server/lib/pdf-service.ts` |
| API Routes | `server/routes.ts` |
| Permit UI | `client/src/pages/permit-detail.tsx` |
| Schema | `shared/schema.ts` |