# PermitTruck Design Guidelines

## Design Approach
**Design System Foundation**: Material Design 3 principles adapted for utility-focused mobile PWA with dark-first theming. This approach suits the professional permit-processing context while maintaining modern aesthetics and clear information hierarchy.

## Core Design Principles
1. **Mobile-First Authority**: Design optimized for thumbs-first interaction with government-grade clarity
2. **Dark Professional**: Dark theme reduces eye strain during extended form completion while maintaining credibility
3. **Progressive Disclosure**: Complex permit workflows broken into digestible steps with clear progress indicators
4. **Gamified Motivation**: Badge system and leaderboard provide visual rewards without compromising professional tone

---

## Typography System

**Primary Font**: Inter (Google Fonts) - exceptional readability at small sizes
**Accent Font**: Manrope (Google Fonts) - for headings and callouts

**Hierarchy**:
- H1 (Page Titles): 2xl (24px), font-bold, tracking-tight
- H2 (Section Headers): xl (20px), font-semibold
- H3 (Card Titles): lg (18px), font-semibold
- Body: base (16px), font-normal
- Small/Meta: sm (14px), font-normal
- Micro (Badges/Labels): xs (12px), font-medium, uppercase tracking-wide

---

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, and 8 for consistent rhythm
- Component padding: p-4 (mobile), p-6 (tablet)
- Section spacing: py-6 (mobile), py-8 (desktop)
- Card gaps: gap-4 (grid), space-y-4 (vertical stacks)
- Touch targets: Minimum h-12 for all interactive elements

**Grid Strategy**:
- Mobile (base): Single column, full-width cards with p-4
- Tablet (md:): 2-column for dashboard cards, permits list
- Desktop (lg:): 3-column for badge gallery, max-w-7xl container

**Container**: max-w-7xl mx-auto px-4 for all page content

---

## Component Library

### Navigation
- **Mobile Bottom Nav** (fixed): 4 icons (Dashboard, Permits, Badges, Profile) with active state indicators, h-16 with backdrop-blur
- **Top Header**: Logo left, notification bell right, h-14, sticky with shadow on scroll

### Cards & Containers
- **Vehicle Cards**: Rounded-xl, border with subtle glow effect, p-6, flex layout with truck/trailer icon (left), details (center), status badge (right)
- **Permit Timeline Cards**: Timeline connector line, relative positioning, rounded-lg with gradient borders for active permits
- **Badge Cards**: Square aspect-ratio, centered icon/text, bronze/silver/gold gradient backgrounds with shine effect

### Forms & Inputs
- **Text Inputs**: h-12, rounded-lg, ring-2 focus states, pl-4 pr-4
- **Select Dropdowns**: Custom styled with chevron icons, h-12
- **File Upload**: Dashed border drop zone, h-32, with upload icon and "Tap to upload" text
- **Signature Canvas**: 16:9 aspect ratio, white background (exception to dark theme), rounded-lg border, clear button top-right

### Buttons
- **Primary CTA**: h-12, rounded-lg, font-semibold, w-full on mobile, shadow-lg with subtle pulse animation
- **Secondary**: h-12, rounded-lg, border-2, transparent background
- **Icon Buttons**: h-10 w-10, rounded-full, centered icons
- **Floating Action Button** (New Permit): h-14 w-14, rounded-full, fixed bottom-20 right-4, shadow-2xl with blur background

### Progress Indicators
- **Stepper**: Horizontal dots or numbered circles with connecting lines, current step highlighted with larger size and glow
- **Progress Bar**: h-2, rounded-full, animated width transition, gradient fill

### Badges & Labels
- **Status Badges**: px-3 py-1, rounded-full, uppercase text-xs, color-coded (green=approved, yellow=pending, blue=draft)
- **Pioneer Badge**: Special gold gradient with star icon, larger than status badges
- **Confidence Indicator**: Percentage with color (green >80%, yellow 60-80%, red <60%)

### Modals & Overlays
- **Portal Overlay**: Semi-transparent backdrop, white control panel (slides from bottom on mobile), with highlight pulse on detected fields
- **Confirmation Modals**: Centered card max-w-md, rounded-xl, p-6, clear title and two-button footer

---

## Page-Specific Layouts

### Onboarding Flow
- Full-screen steps with centered content max-w-md
- Large vehicle type selection cards (truck vs trailer) as 2-column grid with illustrations
- Progress stepper fixed at top
- Next/Back buttons fixed at bottom (safe area aware)

### Dashboard
- Hero section: Welcome header with user name, "New Permit" CTA button, h-48 with gradient background
- Vehicle Cards: Horizontal scroll on mobile (snap-x), grid on tablet+
- Permits Section: List view with filters (All/Active/Expired) as horizontal tabs
- Badges Preview: 3-across grid with "View All" link to full gallery

### New Permit Flow
- **Step 1 (Type)**: Large tap cards for yearly/temporary/seasonal
- **Step 2 (Location)**: State dropdown → County dropdown → Town search with autocomplete
- **Step 3 (Requirements)**: Checklist with expandable accordions for each requirement, confidence score at top
- **Step 4 (Portal/PDF)**: Decision fork with two large option cards

### Badges Gallery
- Masonry grid (2-col mobile, 3-col tablet, 4-col desktop)
- Locked badges shown as grayscale silhouettes
- Leaderboard: Horizontal tabs to switch views, numbered list with avatar/name/count

---

## Images

**Hero/Dashboard**: Use illustration/photo of colorful food trucks at events (top-down angle preferred), placed as background with gradient overlay on dashboard welcome section, h-48 on mobile, h-64 on desktop

**Vehicle Type Selection**: Icon-based illustrations (truck icon, trailer icon) within selection cards - use simple line-art style from Heroicons

**Badge Icons**: Trophy/star iconography for achievements - use Font Awesome Pro icons with duotone treatment

**Empty States**: Friendly illustrations for "No permits yet" and "No badges earned" - use undraw.co style SVGs

---

## Accessibility
- Minimum contrast ratio 7:1 for dark theme text
- Focus indicators: 2px ring with offset for all interactive elements
- Touch targets minimum 44x44px
- Screen reader labels for all icon-only buttons
- Skip navigation link for keyboard users

---

## Animations
Use sparingly, limited to:
- Page transitions: 200ms fade
- Button press: scale-95 on active
- Badge unlock: Single 500ms scale+fade reveal
- Loading states: Skeleton screens, not spinners

**No scroll-triggered animations** - keep performance optimal for form filling.