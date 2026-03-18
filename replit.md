# PermitPilot

## Overview

PermitPilot is a mobile-first Progressive Web App (PWA) designed to simplify the permit application process for food truck and trailer operators, initially focusing on Connecticut. It provides town-specific guidance, document management, requirements checklists, and a gamified system to encourage community contributions. The platform also features a public food truck directory with automated outreach, listing claims, and permit filing capabilities. The overarching goal is to streamline a complex administrative burden, allowing food truck operators to focus on their businesses, while also creating a comprehensive, community-driven resource for the mobile food industry.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

PermitPilot utilizes a monorepo structure, encompassing client, server, and shared code. The application is developed with a mobile-first philosophy, employing React 18 with TypeScript for the frontend and Node.js with Express for the backend.

### UI/UX Decisions
- **Mobile-First Design**: Implements fixed bottom navigation, sticky top headers, and progressive disclosure for complex workflows through step-based forms.
- **Styling**: Uses Tailwind CSS with custom design tokens and a dark-first theme.
- **UI Components**: `shadcn/ui` built on Radix UI primitives for accessible and customizable components.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, Zustand for state management (with persistence), and TanStack Query for server state. Vite is used for the build process.
- **Backend**: Node.js, Express, TypeScript (ESM modules), providing a RESTful JSON API.
- **Authentication**: Replit Auth via OpenID Connect with Passport.js, supplemented by email/password login. Sessions are stored in PostgreSQL.
- **Database**: PostgreSQL with Drizzle ORM. A shared schema ensures type safety across the application.
- **Key Data Models**: Profiles (vehicles, documents), permits (applications), towns (requirements, confidence scores), town_forms (PDFs), health_districts, badges, data_vaults (structured data per profile), portal_credentials (encrypted logins), submission_jobs (portal automation), food_trucks (public listings), public_profiles, configs, inbound_emails, agent_logs.

### Core Systems

#### PDF Auto-Fill Pipeline
- **3-layer data merge** for form filling: Raw AI data, Data Vault structured fields, and user input/event data (highest priority).
- **Datalab AI** and **Gemini Vision** for intelligent PDF field mapping, with heuristic matching as a fallback.
- **Cross-section deduplication** prevents incorrect data application.

#### Form Discovery (Web Crawling)
- Automatically searches Google and DuckDuckGo for .gov sites to find and download food truck permit PDFs.
- Utilizes `cheerio` for fast HTML parsing and `Playwright` for JavaScript-heavy pages.
- Employs heuristic keyword filters and PDF validation.

#### Portal Automation
- Automates form submission for online portals like ViewPoint Cloud, SeamlessDocs, and OpenGov.
- Uses label-based filling with selector fallbacks.
- Portal credentials are encrypted with AES-256-GCM.

#### Data Vault
- A clean, structured repository of extracted business and vehicle information, created from uploaded documents and AI analysis.
- One vault per vehicle profile, automatically populated.

#### Dynamic Questionnaire
- Generates targeted questions for users to fill in missing information based on PDF form fields and available profile data.

#### Autonomous Truck Directory Pipeline
- **Truck Discovery**: Scrapes various sources, uses Claude Haiku for structured data extraction, and deduplicates listings.
- **Truck Enrichment**: Scrapes truck websites for additional details.
- **Outreach**: Sends automated emails to unclaimed truck listings with a claim link.
- **Inbound Email Orchestrator**: Uses Claude for intent classification of replies (e.g., claim_listing, catering_reply, opt_out).

#### Pioneer Badge System
- A gamification system that rewards users for contributing and verifying permit information for towns with low confidence scores.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe ORM.

### Authentication
- **Replit Auth**: OAuth provider.
- **Passport.js**: Authentication middleware.
- **express-session & connect-pg-simple**: Session management.

### PDF Processing
- **pdf-lib**: PDF creation and manipulation.
- **@pdf-lib/fontkit**: Font embedding.
- **multer**: File upload handling.

### AI & Automation
- **Gemini 2.5 Flash**: Document parsing, data extraction, PDF field mapping.
- **Claude claude-sonnet-4-6 (Anthropic)**: Email intent classification and reply generation.
- **Datalab API**: AI-powered PDF form field analysis.
- **Playwright**: Browser automation for portal submissions and web crawling.
- **cheerio**: Fast HTML parsing.

### Email
- **SendGrid**: Email outreach.

### UI/Component Libraries
- **Radix UI**: Accessible UI primitives.
- **shadcn/ui**: Pre-built components.
- **Lucide React**: Icon library.

### Form & Validation
- **Zod**: Runtime type validation.
- **React Hook Form**: Form state management.
- **drizzle-zod**: Zod schemas from Drizzle.

### Mapping
- **Leaflet.js**: Interactive maps.
- **Nominatim**: Geocoding.

### Utilities
- **date-fns**: Date manipulation.
- **Tesseract.js**: Client-side OCR.

### Security
- **DOMPurify**: XSS sanitization.
- **express-rate-limit**: API rate limiting.
- **crypto (Node.js)**: AES-256-GCM encryption.