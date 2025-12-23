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
| `client/src/App.tsx` | Main router |
| `client/src/pages/discover.tsx` | Consumer map page |
| `client/src/pages/admin.tsx` | Admin dashboard |
| `client/src/pages/profile.tsx` | User profile page |
| `client/src/pages/onboarding.tsx` | Multi-step onboarding flow |
| `client/src/components/permit-packet.tsx` | Print-ready permit packets |
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

### Admin Only
- `GET/POST /api/admin/configs` - Manage settings
- `POST /api/admin/towns` - Create town
- `PATCH /api/admin/towns/:id` - Update town
- `DELETE /api/admin/towns/:id` - Delete town

### Owner Only
- `PATCH /api/admin/users/:id/role` - Assign user roles

---

## Next Steps (Future Phases)

### Phase 3: Enhanced Features
- [ ] Push notifications for permit expiry
- [ ] Email reminders
- [ ] Multi-state expansion (beyond CT)
- [ ] Permit auto-fill with saved documents
- [ ] Commissary letter templates

### Phase 4: Monetization
- [ ] Pro subscription integration (Stripe)
- [ ] Premium features unlock
- [ ] Featured truck listings
- [ ] Analytics dashboard for truckers

### Phase 5: Community
- [ ] Trucker forums/discussion
- [ ] Event calendar integration
- [ ] Route planning tools
- [ ] Bulk permit applications

---

## Configuration Defaults

| Setting | Default Value | Description |
|---------|---------------|-------------|
| `pro_price` | $99 | Pro plan monthly price |
| `basic_price` | $0 | Basic plan price (free) |
| `max_vehicles` | 5 | Max vehicles per user |
| `pioneer_threshold` | 60% | Confidence below which Pioneer badge earned |

---

## Phase 3: TruckPermitAI - Intelligent Form Filling (IN PROGRESS)

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

---

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

---

## Current Status
**Phase 3 In Progress** - TruckPermitAI features actively developed: AcroForm-based PDF auto-filling working for Bethel form with 46 fields mapped, Gemini AI document parsing, draft progress saving, and permit wizard improvements. Core platform fully functional with consumer discovery, admin dashboard, and PWA support.

**Remaining Items:**
- Event-specific fields need user input during permit wizard (location, dates, hours)
- Additional town form templates (Newtown, etc.) need field mapping
- AI Portal Assistant embedded WebView

Last Updated: December 23, 2025
