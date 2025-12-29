# PermitTruck

## Overview

PermitTruck is a mobile-first Progressive Web App (PWA) designed to help food truck and trailer operators navigate the complex permit application process across municipalities, starting with Connecticut. The application provides town-by-town guidance, document management, requirements checklists, and a gamification system with badges to encourage community participation.

The platform uses a "pioneer" model where early users help build the knowledge base by contributing verified permit requirements for new towns, creating a crowd-sourced database of municipal permitting information.

**Current Status**: Phase 4 In Progress (Autonomous Permit Filling Infrastructure)
See `PROGRESS.md` for detailed feature tracking.

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: Zustand with persistence middleware for local state; TanStack Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens, dark-first theme approach
- **Build Tool**: Vite with React plugin

The frontend follows a mobile-first design pattern with:
- Fixed bottom navigation for primary routes (Dashboard, Permits, Badges, Discover, Profile)
- Sticky top header with theme toggle and notifications
- Progressive disclosure for complex permit workflows via step-based forms
- Vanilla Leaflet.js for consumer discovery map (replaced react-leaflet due to React version conflicts)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON API under `/api/*` prefix
- **Authentication**: Replit Auth integration via OpenID Connect with Passport.js
- **Session Management**: PostgreSQL-backed sessions using connect-pg-simple

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Key Tables**:
  - `profiles`: User vehicle profiles (truck/trailer details, documents)
  - `permits`: Permit applications with status tracking
  - `towns`: Municipal permit requirements with confidence scores (healthDistrictId FK)
  - `town_forms`: Official PDF forms with fileData (base64), fieldMappings (JSON), isFillable flag
  - `health_districts`: CT health districts with contact info and websites (66 districts)
  - `badges`: Gamification achievements
  - `public_profiles`: Opt-in public listings for consumer discovery
  - `reviews`: Anonymous reviews with IP rate limiting
  - `configs`: Admin-configurable settings (pricing, thresholds)
  - `portal_mappings`: Field selectors for auto-fill functionality
  - `town_requests`: Pioneer submissions for new towns (with research tracking)
  - `research_jobs`: AI-powered town research pipeline tracking
  - `data_vaults`: Master Data Vault with 50+ fields (single source of truth)
  - `submission_jobs`: PDF filling and portal automation job tracking
  - `portal_credentials`: Encrypted portal login credentials
  - `sessions` & `users`: Replit Auth required tables (with role enum)

### Authentication
- Replit Auth provides OAuth 2.0/OpenID Connect authentication
- Session data stored in PostgreSQL `sessions` table
- User records synchronized to `users` table on login
- Protected routes use `isAuthenticated` middleware

### Key Design Decisions

**Monorepo Structure**: Client, server, and shared code in one repository with path aliases (`@/`, `@shared/`) for clean imports.

**Shared Schema**: Database schema defined once in `shared/schema.ts`, used by both server (Drizzle ORM) and client (type inference).

**Confidence Score System**: Towns have confidence scores (0-100) indicating data reliability. Low scores prompt users to verify with official sources and contribute via surveys.

**Pioneer Badge System**: First users to complete permits in new towns earn "Pioneer" badges, incentivizing knowledge base expansion.

---

## PDF Generation System (Critical Path)

### How It Works

1. **Admin uploads form** via Admin Dashboard → `/api/admin/towns/:townId/forms`
   - PDF file is base64 encoded and stored in `town_forms.fileData`
   - Admin sets `isFillable=true` for forms that have AcroForm fields
   - Admin should configure `fieldMappings` JSON (currently missing - this is the bug)

2. **Frontend fetches forms** → `GET /api/towns/:townId/forms`
   - Returns `{ forms: TownForm[], fillableForms: TownForm[] }`
   - Forms with `isFillable=true` show "Generate Filled Form" button

3. **User clicks "Generate Filled Form"** → `POST /api/towns/:townId/forms/:formId/generate`
   - Backend calls `fillPdfFromDatabase(formId, profileId, eventData)`
   - Retrieves form from database, decodes base64 to PDF bytes
   - Uses pdf-lib to load PDF and iterate through AcroForm fields
   - Maps user profile data to PDF fields using `fieldMappings` JSON
   - Returns filled PDF as binary blob

4. **Frontend downloads PDF** as `{TownName}_permit_package.pdf`

### Current Issue: fieldMappings is Empty

The forms are marked `isFillable=true` but the `fieldMappings` column is `null` or `{}`. This causes:
- `fillPdfFromDatabase()` to silently use empty mappings
- PDF is generated but no fields are filled
- User downloads a blank form

### Required Fix

Each form needs a `fieldMappings` JSON like:
```json
{
  "BusinessName": "businessName",
  "ApplicantName": "ownerName", 
  "Phone": "phone",
  "Email": "email",
  "Address": "address",
  "VIN": "vehicleInfo.vin",
  "LicensePlate": "vehicleInfo.licensePlate",
  "InsuranceExpiry": "documents.insurance.expiryDate"
}
```

Keys are PDF form field names (from AcroForm), values are paths into the user's profile/vault data.

---

## Key Files Reference

### Shared Types & Schema
| File | Purpose |
|------|---------|
| `shared/schema.ts` | All Drizzle table definitions, Zod schemas, TypeScript types |

### Server
| File | Purpose |
|------|---------|
| `server/index.ts` | Express app setup, middleware, starts server on port 5000 |
| `server/routes.ts` | All API endpoints (auth, profiles, permits, towns, admin) |
| `server/storage.ts` | Data access layer (IStorage interface with Drizzle queries) |
| `server/seed.ts` | Seeds default configs and towns on startup |
| `server/seed-ct-towns.ts` | Seeds all 169 CT towns and 66 health districts |
| `server/auth.ts` | Replit Auth + Passport.js configuration |
| `server/lib/pdf-service.ts` | PDF generation with pdf-lib (fillPdfFromDatabase, etc.) |
| `server/lib/vault-service.ts` | Master Data Vault sync and completeness scoring |
| `server/lib/datalab-service.ts` | Datalab API integration for AI-powered PDF filling |
| `server/lib/portal-automation-service.ts` | Playwright portal automation |
| `server/lib/gemini-service.ts` | Gemini AI document parsing |

### Client
| File | Purpose |
|------|---------|
| `client/src/App.tsx` | Root component with routing, providers |
| `client/src/pages/dashboard.tsx` | User dashboard with permits overview |
| `client/src/pages/permits.tsx` | Permits list page |
| `client/src/pages/permit-detail.tsx` | Individual permit with requirements, forms |
| `client/src/pages/new-permit.tsx` | Permit application wizard (multi-step) |
| `client/src/pages/discover.tsx` | Consumer-facing map with food trucks |
| `client/src/pages/profile.tsx` | User profile with vehicle management |
| `client/src/pages/admin.tsx` | Admin dashboard (pricing, towns, users) |
| `client/src/pages/onboarding.tsx` | New user onboarding flow |
| `client/src/components/permit-packet.tsx` | PDF generation modal |
| `client/src/components/requirements-checklist.tsx` | Town requirements display |
| `client/src/components/signature-pad.tsx` | Digital signature capture |
| `client/src/lib/queryClient.ts` | TanStack Query configuration, apiRequest helper |
| `client/src/lib/ocr.ts` | Tesseract.js OCR integration |
| `client/src/store/newPermitStore.ts` | Zustand store for permit wizard state |

---

## API Endpoints Reference

### Authentication
- `GET /api/auth/replit` - Initiate Replit OAuth
- `GET /api/auth/replit/callback` - OAuth callback
- `GET /api/auth/logout` - Logout and destroy session
- `GET /api/auth/user` - Get current authenticated user

### User Data
- `GET /api/profiles` - Get user's vehicle profiles
- `POST /api/profiles` - Create new vehicle profile
- `PATCH /api/profiles/:id` - Update vehicle profile
- `GET /api/permits` - Get user's permits
- `POST /api/permits` - Create permit application
- `PATCH /api/permits/:id` - Update permit
- `GET /api/badges` - Get user's earned badges
- `GET /api/me/role` - Get current user's role

### Towns & Forms
- `GET /api/towns` - Get all towns with requirements
- `GET /api/towns/:id` - Get single town details
- `GET /api/towns/:townId/forms` - Get forms for town (returns `{ forms, fillableForms }`)
- `GET /api/towns/:townId/forms/:formId` - Get single form
- `POST /api/towns/:townId/forms/:formId/generate` - Generate filled PDF
- `GET /api/health-districts` - Get all CT health districts
- `GET /api/health-districts/:id/towns` - Get towns in a health district

### Public (No Auth)
- `GET /api/public-profiles` - Get public food truck listings
- `GET /api/reviews/:publicProfileId` - Get reviews for a truck
- `POST /api/reviews` - Submit anonymous review (IP rate limited)

### Admin (Requires admin/owner role)
- `GET /api/admin/configs` - Get all configs
- `POST /api/admin/configs` - Update configs
- `POST /api/admin/towns` - Create town
- `PATCH /api/admin/towns/:id` - Update town
- `DELETE /api/admin/towns/:id` - Delete town
- `POST /api/admin/towns/:townId/forms` - Upload form to town

### Owner Only
- `PATCH /api/admin/users/:id/role` - Assign user roles

### Vault & Submissions
- `POST /api/vault/sync/:profileId` - Sync parsed data to vault
- `GET /api/vault` - Get user's vault with completeness score
- `GET /api/vault/:id/completeness` - Get vault completeness
- `GET /api/vault/:id/pdf-fields` - Get data formatted for PDF filling
- `POST /api/submissions/pdf-fill` - Create PDF fill job
- `POST /api/submissions/auto-fill` - Start auto PDF fill
- `GET /api/submissions/:jobId/poll` - Poll job status
- `GET /api/submissions` - Get user's submission jobs
- `GET /api/submissions/:jobId/pdf` - Download filled PDF
- `POST /api/submissions/:jobId/approve` - Approve and submit

---

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, required for application to function
- **Drizzle ORM**: Type-safe database queries and schema management
- **Drizzle Kit**: Migration and schema push tooling (`npm run db:push`)

### Authentication
- **Replit Auth**: OAuth provider for user authentication
- **Passport.js**: Authentication middleware
- **express-session**: Session management
- **connect-pg-simple**: PostgreSQL session store

### PDF Processing
- **pdf-lib**: Core library for PDF manipulation (load, fill AcroForm fields, save)
- **@pdf-lib/fontkit**: Font embedding support

### AI & Automation
- **Gemini 2.5 Flash**: Document parsing, town research automation (via @google/generative-ai)
- **Datalab API**: External service for AI-powered PDF form filling (https://www.datalab.to/api/v1/fill)
- **Playwright**: Browser automation for portal form submission (ViewPoint/OpenGov)

### UI/Component Libraries
- **Radix UI**: Accessible component primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-built component styling (configured in `components.json`)
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel functionality
- **react-day-picker**: Calendar/date picker
- **cmdk**: Command palette component

### Form & Validation
- **Zod**: Runtime type validation
- **React Hook Form**: Form state management
- **drizzle-zod**: Generate Zod schemas from Drizzle tables

### Mapping
- **Leaflet.js**: Interactive maps for consumer discovery
- **Nominatim**: Geocoding for address/zip search

### Utilities
- **date-fns**: Date manipulation
- **class-variance-authority**: Component variant management
- **clsx/tailwind-merge**: Conditional class composition
- **Tesseract.js**: Client-side OCR for document scanning

### Security
- **DOMPurify**: XSS sanitization for user-generated content
- **express-rate-limit**: API rate limiting
- **crypto (Node.js)**: AES-256-CBC encryption for portal credentials

### Development
- **Vite**: Development server and build tool
- **tsx**: TypeScript execution for server
- **esbuild**: Production server bundling

---

## Backend Services

### PDF Service (`server/lib/pdf-service.ts`)
```typescript
fillPdfFromDatabase(formId, profileId, eventData)
```
- Retrieves form template from `town_forms` table
- Decodes base64 `fileData` to PDF bytes
- Uses pdf-lib to load PDF and access AcroForm
- Iterates through `fieldMappings` to set field values from profile
- Returns filled PDF bytes

**Known Issue**: If `fieldMappings` is empty/null, PDF returns unchanged (blank).

### Vault Service (`server/lib/vault-service.ts`)
- `syncParsedDataToVault(profileId)`: Syncs parsed document data to Master Data Vault
- `getVaultDataForPdfFill(vault)`: Formats vault data for Datalab API field_data
- `getVaultCompleteness(vaultId)`: Calculates completeness score and lists missing fields

### Datalab Service (`server/lib/datalab-service.ts`)
- `fillPdfWithDatalab(request)`: Submits PDF to Datalab for AI filling
- `checkDatalabResult(requestCheckUrl)`: Polls for async completion
- `createPdfFillJob(...)`: Creates submission job and initiates filling
- `pollDatalabJob(jobId)`: Checks job status and retrieves filled PDF
- `startAutoPdfFill(...)`: Auto-fills using town's configured form

### Portal Automation Service (`server/lib/portal-automation-service.ts`)
- `storePortalCredentials(...)`: Encrypts and stores portal login credentials
- `getDecryptedCredentials(credentialId)`: Retrieves decrypted credentials
- `createPortalAutomationJob(...)`: Creates job for browser automation
- `executePortalAutomation(jobId)`: Runs Playwright automation against portal
- `approveAndSubmit(jobId)`: User approves and finalizes submission

### Gemini Service (`server/lib/gemini-service.ts`)
- Document parsing with structured data extraction
- Town research automation for new submissions
- Uses Gemini 2.5 Flash model

---

## Database Schema (Key Tables)

### town_forms
```sql
id: serial PRIMARY KEY
townId: integer REFERENCES towns(id)
name: varchar(255)
formType: varchar(50) -- 'yearly', 'temporary', 'seasonal'
fileData: text -- base64 encoded PDF
fieldMappings: jsonb -- { "PDFFieldName": "profile.path" }
isFillable: boolean DEFAULT false
sourceUrl: text
createdAt: timestamp
```

### data_vaults (Master Data Vault)
```sql
id: serial PRIMARY KEY
userId: integer REFERENCES users(id)
businessName: text
ownerName: text
address: text
city: text
state: text
zip: text
phone: text
email: text
ein: text
vehicleInfo: jsonb -- { vin, licensePlate, make, model, year }
insuranceInfo: jsonb
licenses: jsonb -- array of license objects
completenessScore: integer
lastSyncedAt: timestamp
```

### submission_jobs
```sql
id: serial PRIMARY KEY
userId: integer REFERENCES users(id)
townId: integer REFERENCES towns(id)
formId: integer REFERENCES town_forms(id)
jobType: varchar(50) -- 'pdf_fill', 'portal_automation'
status: varchar(50) -- 'pending', 'processing', 'completed', 'failed', 'needs_approval'
filledPdfData: text -- base64 result
errorMessage: text
createdAt: timestamp
completedAt: timestamp
```

---

## Two Submission Paths

### Path 1: PDF Auto-Fill (Primary)
1. Admin uploads PDF form to town
2. Admin configures fieldMappings JSON
3. User clicks "Generate Filled Form"
4. Server fills PDF using pdf-lib + fieldMappings
5. User downloads and prints/emails filled PDF

### Path 2: Portal Automation (Future)
1. User enters portal credentials (encrypted storage)
2. System launches Playwright browser
3. Navigates to town's OpenGov/ViewPoint portal
4. Fills form fields programmatically
5. User reviews and approves submission
6. System submits and confirms

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-provided by Replit) |
| `SESSION_SECRET` | Express session encryption key |
| `GEMINI_API_KEY` | Google Gemini AI API key |
| `DATALAB_API_KEY` | Datalab PDF filling API key (optional) |

---

## Running the Application

```bash
npm run dev    # Start development server (frontend + backend)
npm run db:push    # Push schema changes to database
```

The application runs on port 5000 with:
- Express backend serving API routes
- Vite dev server for React frontend
- Hot module replacement enabled

---

## Current Priority: Fix PDF Filling

The PDF generation pipeline is complete but produces blank forms because `fieldMappings` is not populated.

**Options to fix:**
1. **Manual DB update**: Run SQL to populate fieldMappings for each form
2. **Admin UI**: Build field mapping interface in admin dashboard
3. **Datalab integration**: Use AI to auto-detect and map fields
4. **PDF field extraction**: Auto-extract field names on upload, prompt admin to map

Last Updated: December 28, 2025
