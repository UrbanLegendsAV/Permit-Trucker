# PermitTruck

## Overview

PermitTruck is a mobile-first Progressive Web App (PWA) designed to help food truck and trailer operators navigate the complex permit application process across municipalities, starting with Connecticut. The application provides town-by-town guidance, document management, requirements checklists, and a gamification system with badges to encourage community participation.

The platform uses a "pioneer" model where early users help build the knowledge base by contributing verified permit requirements for new towns, creating a crowd-sourced database of municipal permitting information.

**Current Status**: Phase 4 In Progress (Autonomous Permit Filling Infrastructure)
See `PROGRESS.md` for detailed feature tracking.

Recent additions include:
- AcroForm-based PDF auto-filling for Bethel 9-page form
- Field mapping system using actual PDF form field names
- Gemini AI document parsing with structured data extraction
- Draft permit progress saved in Zustand store (persists on refresh)
- Town selection visual highlighting in permit wizard
- Auto-fill from profile data (business name, address, phone, etc.)
- AI-powered town research automation (auto-researches new town submissions using Gemini 2.5 Flash)
- **Master Data Vault** - Single source of truth for all user data (50+ fields synced from parsed documents)
- **Datalab API Integration** - AI-powered PDF form filling with semantic field matching
- **Playwright Portal Automation** - Browser automation for ViewPoint/OpenGov permit portals
- **Draft & Review Workflow** - Submission jobs with preview before final submit
- **Encrypted Portal Credentials** - AES-256-CBC encrypted storage for portal logins

## User Preferences

Preferred communication style: Simple, everyday language.

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

### Utilities
- **date-fns**: Date manipulation
- **class-variance-authority**: Component variant management
- **clsx/tailwind-merge**: Conditional class composition
- **nanoid**: ID generation
- **Tesseract.js**: Client-side OCR for document scanning

### AI & Automation
- **Datalab API**: External service for AI-powered PDF form filling (https://www.datalab.to/api/v1/fill)
- **Playwright**: Browser automation for portal form submission
- **Gemini 2.5 Flash**: Document parsing and town research automation

### Security
- **DOMPurify**: XSS sanitization for user-generated content
- **express-rate-limit**: API rate limiting (document parsing, research endpoints)
- **crypto (Node.js)**: AES-256-CBC encryption for portal credentials

### Development
- **Vite**: Development server and build tool
- **tsx**: TypeScript execution for server
- **esbuild**: Production server bundling

## New Backend Services

### Vault Service (`server/lib/vault-service.ts`)
- `syncParsedDataToVault(profileId)`: Syncs parsed document data to Master Data Vault
- `getVaultDataForPdfFill(vault)`: Formats vault data for Datalab API field_data
- `getVaultCompleteness(vaultId)`: Calculates completeness score and lists missing/low-confidence fields

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

## API Endpoints (Vault & Submissions)

### Vault Endpoints
- `POST /api/vault/sync/:profileId` - Sync parsed data to vault
- `GET /api/vault` - Get user's vault with completeness score
- `GET /api/vault/:id/completeness` - Get vault completeness
- `GET /api/vault/:id/pdf-fields` - Get data formatted for PDF filling

### Submission Endpoints
- `POST /api/submissions/pdf-fill` - Create PDF fill job
- `POST /api/submissions/auto-fill` - Start auto PDF fill
- `GET /api/submissions/:jobId/poll` - Poll job status
- `GET /api/submissions` - Get user's submission jobs
- `GET /api/submissions/:jobId` - Get specific job
- `GET /api/submissions/:jobId/pdf` - Download filled PDF
- `POST /api/submissions/:jobId/approve` - Approve and submit

### Portal Automation Endpoints
- `POST /api/portal-credentials` - Store encrypted credentials
- `POST /api/submissions/portal-automation` - Create automation job
- `POST /api/submissions/:jobId/execute` - Execute portal automation