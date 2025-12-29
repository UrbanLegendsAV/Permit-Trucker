# PermitTruck - Project Progress

## Overview
PermitTruck is a mobile-first Progressive Web App (PWA) designed to help food truck and trailer operators navigate the complex permit application process across municipalities, starting with Connecticut.

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
- [x] "0 trucks nearby" indicator

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
- [x] Optional reviewer name
- [x] Optional review text
- [x] IP-based rate limiting (max 5 reviews/hour)
- [x] Reviews displayed in truck panels

### Admin Dashboard
- [x] Role-based access control (admin/owner only)
- [x] Pricing management (Pro/Basic plan sliders)
- [x] Town database CRUD operations
- [x] User role assignment (owner-only)
- [x] Configuration storage in database
- [x] Reviews moderation queue (approve/deny/delete)

### Public Profile Opt-In (Onboarding)
- [x] New "Visibility" step (step 5) in onboarding flow
- [x] Opt-in toggle for public profile creation
- [x] Business name and description fields
- [x] Automatic public profile creation when opted in

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
- [x] Progress indicator during OCR processing
- [x] Scan button appears on image uploads only

### PWA Support
- [x] Web app manifest with proper icons and metadata
- [x] Service worker for offline caching
- [x] Stale-while-revalidate strategy for static assets
- [x] Network-first strategy for API calls with offline fallback
- [x] Production-only service worker registration

### Database Schema Additions
- [x] `public_profiles` table with business info
- [x] `reviews` table with IP tracking
- [x] `configs` table for admin settings
- [x] `role` enum added to users table
- [x] Default configs seeded on startup

---

## Phase 3: TruckPermitAI - Intelligent Form Filling (COMPLETE)

### Auto-OCR Document Processing
- [x] Auto-run Tesseract.js OCR on image upload
- [x] Extract VIN, license plates, dates, license numbers
- [x] Auto-populate vehicle profile fields from OCR data
- [x] Toast notifications showing extracted data
- [x] Extracted data preview on vehicle cards

### Smart Form Pre-Filling
- [x] "Pre-Fill with My Data" button for fillable town forms
- [x] Profile data mapping (business name, VIN, commissary info)
- [x] PDF auto-fill with pdf-lib using AcroForm fields
- [x] Download pre-filled PDFs
- [x] Bethel 9-page form fully mapped (46 form fields)
- [x] Contact info auto-fill (name, address, phone, business name)
- [x] Checkbox auto-fill (water supply, toilet facilities, license type)
- [x] Event section fields (location, dates, hours - from permit wizard)

### AI Portal Assistant
- [x] "Start AI Assist" button for towns with online portals
- [x] Portal URL integration
- [ ] Embedded portal WebView with sidebar
- [ ] AI-powered field detection and filling

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

### Permit Wizard Improvements
- [x] Draft progress saving (persists permit step and data on refresh)
- [x] Town selection visual highlighting (blue ring on selected town)
- [x] Zustand store persistence for newPermit state
- [x] permitStep state persistence

### Gemini AI Integration
- [x] Document parsing with Gemini 2.5 Flash
- [x] Structured data extraction for profiles
- [x] Dynamic category support (operations, menu_and_prep, safety, license_info)
- [x] ParsedUserData TypeScript interface for type safety

### Connecticut Health Districts & Town Coverage
- [x] Health districts table with normalized data (name, website, phone, email)
- [x] All 169 CT towns seeded with county and health district associations
- [x] District-based filtering in town search (dropdown selector)
- [x] Auto-populate portal URLs from health district websites
- [x] API endpoints: GET /api/health-districts, GET /api/health-districts/:id/towns
- [x] Comprehensive seed script (server/seed-ct-towns.ts) for all CT coverage

---

## Phase 4: Autonomous PDF Filling Infrastructure (IN PROGRESS)

### Database-Backed Form System
- [x] `town_forms` table with columns: id, townId, name, formType, fileData (base64), fieldMappings (JSON), isFillable, sourceUrl
- [x] Admin dashboard form upload (PDF file + metadata)
- [x] Base64 encoding for PDF storage in PostgreSQL
- [x] API: GET `/api/towns/:townId/forms` - returns all forms for a town
- [x] API: POST `/api/towns/:townId/forms/:formId/generate` - generates filled PDF
- [x] Frontend displays "Official Forms" section with "Fillable" badges
- [x] "Generate Filled Form" and "View PDF" buttons per form

### PDF Generation Pipeline
- [x] `fillPdfFromDatabase()` function in `server/lib/pdf-service.ts`
- [x] Retrieves form template from database by formId
- [x] Uses pdf-lib to load PDF and access AcroForm fields
- [x] Maps profile data to form fields using `fieldMappings` JSON
- [x] Returns filled PDF as binary blob for download

### Current Issues (BLOCKING)
- [ ] **fieldMappings is empty** - Forms are marked `isFillable=true` but lack actual field mappings
- [ ] Downloaded PDFs appear BLANK because no field values are set
- [ ] No validation/error when fieldMappings is missing
- [ ] Admin form upload doesn't auto-generate fieldMappings

### Field Mapping Requirements
Each form needs a `fieldMappings` JSON object that maps:
```json
{
  "PDF_FIELD_NAME": "profile.fieldPath",
  "BusinessName": "businessName",
  "ApplicantPhone": "phone",
  "VehicleVIN": "vehicleInfo.vin",
  ...
}
```

### Two Submission Paths (Planned)
1. **PDF Auto-Fill Path** (Current Focus)
   - Upload form → Extract field names → Create fieldMappings → Generate filled PDF
   - Uses pdf-lib for AcroForm manipulation
   - Datalab API for AI-powered semantic field matching (optional enhancement)

2. **Portal Automation Path** (Future)
   - Store portal credentials (AES-256-CBC encrypted)
   - Playwright browser automation
   - Navigate to OpenGov/ViewPoint portals
   - Fill fields programmatically
   - Submit with user approval

### Master Data Vault
- [x] `data_vaults` table with 50+ standardized fields
- [x] Single source of truth for all user data
- [x] Fields: businessName, ownerName, address, phone, email, ein, vehicleInfo, licenses, insurance, etc.
- [x] Sync from parsed documents via `syncParsedDataToVault()`
- [x] Completeness scoring for data quality

### Submission Jobs Tracking
- [x] `submission_jobs` table for tracking fill/automation jobs
- [x] Status: pending, processing, completed, failed, needs_approval
- [x] Stores filled PDF result for download
- [x] Error logging for debugging

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

### Key Files
| File | Purpose |
|------|---------|
| `shared/schema.ts` | Database schema + types |
| `server/routes.ts` | API endpoints |
| `server/storage.ts` | Data access layer |
| `server/seed.ts` | Town + config seeding |
| `server/lib/pdf-service.ts` | PDF generation with pdf-lib |
| `client/src/App.tsx` | Main router |
| `client/src/pages/discover.tsx` | Consumer map page |
| `client/src/pages/admin.tsx` | Admin dashboard |
| `client/src/pages/profile.tsx` | User profile page |
| `client/src/pages/onboarding.tsx` | Multi-step onboarding flow |
| `client/src/pages/permit-detail.tsx` | Permit application detail page |
| `client/src/components/permit-packet.tsx` | PDF generation UI |
| `client/src/components/requirements-checklist.tsx` | Town requirements display |
| `client/src/lib/ocr.ts` | OCR utility (Tesseract.js) |
| `client/public/sw.js` | Service worker for PWA |

---

## API Endpoints

### Public
- `GET /api/public-profiles` - List public food trucks
- `GET /api/reviews/:publicProfileId` - Get reviews for truck
- `POST /api/reviews` - Submit anonymous review

### Authenticated
- `GET /api/profiles` - User's vehicle profiles
- `POST /api/profiles` - Create vehicle profile
- `GET /api/permits` - User's permits
- `POST /api/permits` - Create permit application
- `GET /api/badges` - User's earned badges
- `GET /api/towns` - All towns with requirements
- `GET /api/me/role` - Current user's role

### Town Forms (New)
- `GET /api/towns/:townId/forms` - Get all forms for a town (returns `{ forms, fillableForms }`)
- `GET /api/towns/:townId/forms/:formId` - Get single form details
- `POST /api/towns/:townId/forms/:formId/generate` - Generate filled PDF

### Admin Only
- `GET/POST /api/admin/configs` - Manage settings
- `POST /api/admin/towns` - Create town
- `PATCH /api/admin/towns/:id` - Update town
- `DELETE /api/admin/towns/:id` - Delete town
- `POST /api/admin/towns/:townId/forms` - Upload form to town

### Owner Only
- `PATCH /api/admin/users/:id/role` - Assign user roles

---

## Configuration Defaults

| Setting | Default Value | Description |
|---------|---------------|-------------|
| `pro_price` | $99 | Pro plan monthly price |
| `basic_price` | $0 | Basic plan price (free) |
| `max_vehicles` | 5 | Max vehicles per user |
| `pioneer_threshold` | 60% | Confidence below which Pioneer badge earned |

---

## Next Steps (Immediate Priority)

### Fix PDF Filling (Critical)
1. [ ] Add validation in `fillPdfFromDatabase()` - throw error if fieldMappings is empty
2. [ ] Create admin UI for field mapping configuration
3. [ ] OR: Auto-extract PDF field names on upload and prompt admin to map them
4. [ ] Add regression test: load profile, generate PDF, verify fields are filled

### Populate Field Mappings for Existing Forms
- [ ] Newtown Mobile Food Establishment Application
- [ ] Newtown Temporary Food Service Application
- [ ] Other CT town forms

### Future Phases
- [ ] Push notifications for permit expiry
- [ ] Email reminders
- [ ] Multi-state expansion (beyond CT)
- [ ] Pro subscription integration (Stripe)
- [ ] Trucker forums/discussion
- [ ] Event calendar integration
- [ ] Route planning tools

---

## Current Status
**Phase 4 In Progress** - Database-backed form system is wired up end-to-end, but PDFs download BLANK because field mappings are not configured. The pipeline from admin upload → database storage → frontend display → PDF generation is complete, but the critical `fieldMappings` JSON is empty for all forms.

**Root Cause**: Forms are marked `isFillable=true` but the admin upload process doesn't populate `fieldMappings`. The `fillPdfFromDatabase()` function silently uses an empty mapping object, resulting in no fields being filled.

**Fix Required**: Either (1) create admin UI for field mapping, (2) use Datalab API to auto-detect and map fields, or (3) manually populate fieldMappings via database script.

Last Updated: December 28, 2025
