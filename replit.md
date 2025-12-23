# PermitTruck

## Overview

PermitTruck is a mobile-first Progressive Web App (PWA) designed to help food truck and trailer operators navigate the complex permit application process across municipalities, starting with Connecticut. The application provides town-by-town guidance, document management, requirements checklists, and a gamification system with badges to encourage community participation.

The platform uses a "pioneer" model where early users help build the knowledge base by contributing verified permit requirements for new towns, creating a crowd-sourced database of municipal permitting information.

**Current Status**: Phase 3 In Progress (TruckPermitAI - Intelligent Form Filling)
See `PROGRESS.md` for detailed feature tracking.

Recent additions include:
- AcroForm-based PDF auto-filling for Bethel 9-page form
- Field mapping system using actual PDF form field names
- Gemini AI document parsing with structured data extraction
- Draft permit progress saved in Zustand store (persists on refresh)
- Town selection visual highlighting in permit wizard
- Auto-fill from profile data (business name, address, phone, etc.)

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
  - `towns`: Municipal permit requirements with confidence scores
  - `badges`: Gamification achievements
  - `public_profiles`: Opt-in public listings for consumer discovery
  - `reviews`: Anonymous reviews with IP rate limiting
  - `configs`: Admin-configurable settings (pricing, thresholds)
  - `portal_mappings`: Field selectors for auto-fill functionality
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

### Development
- **Vite**: Development server and build tool
- **tsx**: TypeScript execution for server
- **esbuild**: Production server bundling