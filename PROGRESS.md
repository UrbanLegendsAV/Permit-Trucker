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

## Current Status
**Phase 2 Complete** - Ready for testing and user feedback.

Last Updated: December 22, 2025
