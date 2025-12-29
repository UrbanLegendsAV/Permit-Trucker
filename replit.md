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