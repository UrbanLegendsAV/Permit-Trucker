# PermitTruck

## Overview

PermitTruck is a mobile-first Progressive Web App (PWA) designed to simplify the complex permit application process for food truck and trailer operators. Starting with Connecticut, it provides town-specific guidance, document management, requirements checklists, and a gamified system to encourage community contributions. The platform utilizes a "pioneer" model, where early users help build a crowd-sourced database of municipal permitting information, aiming to become the go-to resource for food truck operators navigating regulatory hurdles.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

PermitTruck employs a monorepo structure, housing client, server, and shared code. The application prioritizes a mobile-first design, using React 18 with TypeScript for the frontend, and Node.js with Express for the backend.

### UI/UX Decisions
- **Mobile-First Design**: Implemented with fixed bottom navigation, sticky top headers, and progressive disclosure for complex workflows via step-based forms.
- **Styling**: Tailwind CSS with custom design tokens and a dark-first theme approach.
- **UI Components**: `shadcn/ui` built on Radix UI primitives for accessible and customizable components.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, Zustand for state management (with persistence), and TanStack Query for server state. Vite is used for building.
- **Backend**: Node.js, Express, TypeScript (ESM modules), RESTful JSON API.
- **Authentication**: Replit Auth via OpenID Connect with Passport.js, storing sessions in PostgreSQL.
- **Database**: PostgreSQL with Drizzle ORM. A shared schema (`shared/schema.ts`) ensures type safety across client and server.
- **Key Data Models**: `profiles` (vehicle details), `permits` (applications), `towns` (permit requirements with confidence scores), `town_forms` (official PDF forms), `health_districts`, `badges`, `data_vaults` (master data for auto-filling).
- **PDF Generation System**: Uses Datalab AI for intelligent field matching when `fieldMappings` is not configured, with `pdf-lib` as fallback. Datalab semantically matches profile data to PDF form fields automatically.
- **Pioneer Badge System**: Gamification encourages users to contribute verified permit information for new towns.
- **Two Submission Paths**:
    1.  **PDF Auto-Fill**: Generates pre-filled PDFs for users to download.
    2.  **Portal Automation (Future)**: Uses Playwright to automate submission through municipal portals (e.g., ViewPoint/OpenGov).

### Feature Specifications
- **Town-by-Town Guidance**: Detailed permit requirements for specific municipalities, with a confidence score indicating data reliability.
- **Document Management**: Allows users to store and manage relevant documents.
- **Gamification**: "Pioneer" badges awarded for contributing new town permit information.
- **Autonomous Permit Filling**: Infrastructure for automatically filling PDF forms and potentially submitting them via portals.

---

## Autonomous System Architecture

PermitTruck is designed to autonomously handle permit applications with minimal user intervention. Here's how each component works:

### 1. Data Vault (Profile Data Extraction)

The Data Vault is the central repository of user business information, automatically extracted from uploaded documents.

**How it works:**
1. User uploads documents (licenses, registrations, health permits) to their Profile
2. Gemini 2.5 Flash AI analyzes each document and extracts structured data
3. Extracted data is stored in `profiles.parsedDataLog` as JSON
4. This becomes the user's "Data Vault" - their master business information

**Extracted fields include:**
- Contact info (business name, owner, phone, email, address)
- License info (number, type, valid dates, issuing authority)
- Operations (water supply, sanitizer type, toilet facilities)
- Safety (hot/cold holding, waste water disposal, temp monitoring)
- Menu & Prep (menu items, prep location/commissary, food sources)
- Vehicle info (VIN, license plate, make/model/year)
- Equipment (handwash setup, refrigeration, cooking equipment)
- Certifications (food manager cert, expiration)

**Verification:** Users can see their synced vault data on the Profile page under "AI-Extracted Data"

### 2. Form Detection & Classification

When adding forms for a town, the system detects two types:

**Type A: Fillable PDF Forms**
- Downloaded directly from town websites
- Stored as base64 in `town_forms.fileData`
- Detected as fillable if PDF has AcroForm fields
- Example: `https://www.brookfieldct.gov/DocumentCenter/View/246/Itinerant-Vendor-Application-PDF`

**Type B: Web Portal Forms (SeamlessDocs, ViewPoint, OpenGov)**
- External web-based form systems
- Stored as URL in `town_forms.externalUrl` or `formUrl`
- Requires browser automation (Playwright) to fill
- Example: `https://brookfieldct.seamlessdocs.com/f/TempFoodLicense`

**Detection Logic:**
- If URL ends in `.pdf` or returns PDF content-type → Type A (download & store)
- If URL points to form portal (seamlessdocs, viewpoint, opengov) → Type B (store URL for automation)

### 3. AI-Powered Form Field Mapping

When generating a PDF, the system intelligently maps profile data to form fields:

**Process Flow:**
1. **Check for cached mappings** (`town_forms.aiFieldMappings`) - reuse if available
2. **If no cache, call Datalab AI** - sends PDF + profile data, returns smart mappings
3. **Cache the results** - store in `aiFieldMappings` for future use (saves API calls)
4. **Fill PDF using priority order:**
   - Priority 0: User-provided answers (from questionnaire modal)
   - Priority 1: Cached AI mappings
   - Priority 2: Manual field mappings (admin-configured)
   - Priority 3: Heuristic matching (field name pattern matching)

**Semantic Checkbox Handling:**
For checkboxes like "Temporary License ☐" or "Portable Toilets ☐", the system stores:
- `dataKey`: which profile field to check (e.g., "license_type")
- `matchValue`: what value triggers the checkbox (e.g., "temporary")

At fill time, it evaluates: `profile[dataKey].includes(matchValue)` → check if true

### 4. Dynamic Questionnaire System

When profile data is insufficient, the system prompts users for missing information:

**Process:**
1. Before PDF generation, analyze form fields vs available profile data
2. Identify fields with no matching data (`dataKey: null` or empty value)
3. Show modal with questions for truly missing information
4. User answers are passed with highest priority to PDF generation

**Food Truck Domain Knowledge Built-in:**
- Toilet facilities → Always "portable" / "event-site facilities"
- License type → Usually "temporary" for event permits
- Hand washing → Always "temporary setup"
- Food prep → "On-site at events"

### 5. Portal Automation (Future Enhancement)

For Type B forms (web portals like SeamlessDocs), planned automation:

**Approach:**
1. Store portal URL and credentials (encrypted in `town_forms.portalCredentials`)
2. Use Playwright to:
   - Navigate to form URL
   - Fill text fields using same dataMap as PDF filling
   - Select dropdowns/radio buttons based on profile data
   - Handle CAPTCHAs (may require user intervention)
   - Submit form or save draft
3. Capture confirmation/receipt

**Current Status:** Infrastructure exists (Playwright installed), implementation pending

### 6. Town Form Discovery Pattern

When adding forms for a new town:

1. **Find Town Website** → Search for "[Town Name] CT Health Department"
2. **Locate Permits Section** → Look for "Food Service", "Vendor Permits", "Licenses"
3. **Identify Form Types:**
   - Direct PDF downloads → Add as Type A
   - Portal links (seamlessdocs, viewpoint) → Add as Type B
4. **Download/Store Forms:**
   - PDFs: Convert to base64, store in `town_forms.fileData`
   - Portals: Store URL in `town_forms.externalUrl`
5. **First Generation Triggers AI Analysis:**
   - Datalab analyzes PDF structure
   - Creates field mappings
   - Caches for future use

### 7. Database Schema for Autonomous Operations

Key tables supporting automation:

```
profiles
├── parsedDataLog (JSON) - User's Data Vault (extracted from documents)
├── uploadsJson - Original uploaded documents

town_forms
├── fileData (base64) - Stored PDF for Type A forms
├── formUrl - Original download URL
├── externalUrl - Portal URL for Type B forms
├── aiFieldMappings (JSON) - Cached AI field mappings
├── fieldMappings (JSON) - Manual field mappings (admin override)
├── isFillable (boolean) - Has AcroForm fields

permits
├── profileId - Links to user's Data Vault
├── townId - Which town this permit is for
├── Event data (name, dates, location, hours)
```

---

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe ORM for database interactions.

### Authentication
- **Replit Auth**: OAuth provider.
- **Passport.js**: Authentication middleware.
- **express-session & connect-pg-simple**: Session management with PostgreSQL store.

### PDF Processing
- **pdf-lib**: Library for PDF creation and manipulation, specifically for filling AcroForm fields.
- **@pdf-lib/fontkit**: Font embedding for PDFs.

### AI & Automation
- **Gemini 2.5 Flash**: For document parsing and town research automation.
- **Datalab API**: External service for AI-powered PDF form filling.
- **Playwright**: Browser automation for portal submission.

### UI/Component Libraries
- **Radix UI**: Accessible UI primitives.
- **shadcn/ui**: Pre-built components based on Radix UI.
- **Lucide React**: Icon library.
- **Embla Carousel**: Carousel component.
- **react-day-picker**: Date picker.

### Form & Validation
- **Zod**: Runtime type validation.
- **React Hook Form**: Form state management.
- **drizzle-zod**: Zod schema generation from Drizzle.

### Mapping
- **Leaflet.js**: Interactive maps.
- **Nominatim**: Geocoding service.

### Utilities
- **date-fns**: Date manipulation.
- **Tesseract.js**: Client-side OCR for document scanning.

### Security
- **DOMPurify**: XSS sanitization.
- **express-rate-limit**: API rate limiting.
- **crypto (Node.js)**: For encrypting sensitive credentials.