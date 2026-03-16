# PermitPilot — Brand Identity Bible
**Version:** 1.0  
**Date:** March 2026  
**Status:** Active — use this as the source of truth for all design, copy, and product decisions.

---

## Table of Contents
1. [Name Decision](#1-name-decision)
2. [Brand Strategy Foundation](#2-brand-strategy-foundation)
3. [Color Palette](#3-color-palette)
4. [Typography System](#4-typography-system)
5. [Brand Voice Guide](#5-brand-voice-guide)
6. [Taglines](#6-taglines)
7. [Logo Design Specs](#7-logo-design-specs)
8. [The 3 Rules You Never Break](#8-the-3-rules-you-never-break)
9. [Rebrand Checklist](#9-rebrand-checklist)

---

## 1. Name Decision

**Chosen name: `PermitPilot`**  
**Replace everywhere:** "PermitTruck" → "PermitPilot"

### Why PermitPilot
The current name "PermitTruck" describes a function, not a brand. "PermitPilot" positions the app as a trusted copilot — active, intelligent, and always by the operator's side. The aviation/navigation metaphor unlocks rich copywriting territory ("cleared for takeoff," "your flight plan," "navigate compliance") and scales nationally when you expand beyond CT.

### Domain targets (check availability)
- `permitpilot.com`
- `permitpilot.app`
- `permitpilot.io`

### Other names considered (do not use)
| Name | Why Rejected |
|------|-------------|
| RollRight | Too food-truck-specific, doesn't scale |
| Clearway | Generic, no permit connection |
| Stampd | Too edgy for B2G trust-building |
| GreenLight | Domain likely taken, overused metaphor |
| VendRight | Too niche, poor scalability |

---

## 2. Brand Strategy Foundation

### Brand Archetype
**The Guide** (Sage × Hero hybrid)

PermitPilot is not the hero. The food truck operator is. We are the expert companion that shows them exactly where to go and clears every obstacle. Think Gandalf, not Frodo. GPS, not the driver. This shapes every copy decision — we serve their story, we don't tell ours.

### Brand Promise
> *From permit confusion to filed application — without the guesswork.*

Use this as the internal filter for every product and copy decision: does this reduce guesswork? If yes, ship it. If no, reconsider.

### One-Word Brand Definition
**Clarity**

### 5 Brand Personality Traits
1. **Confident** — not arrogant. We know the towns. We've done it before. We state facts, not hedges.
2. **Precise** — not clinical. Exact fees, exact timelines, exact forms. No rounding up, no vague ranges.
3. **Warm** — not casual. We care about the operator's success. We're not a cold government portal.
4. **Proactive** — not pushy. We surface what's needed before they ask. We don't upsell mid-workflow.
5. **Transparent** — not over-explaining. We show confidence scores, win/loss data, and real timelines. No hiding rough edges.

### 3 Emotions in Order (Every Touchpoint)
Every interaction should move the user through this sequence:
1. **Relief** — "Someone actually gets how confusing this is."
2. **Confidence** — "I can actually do this."
3. **Momentum** — "Let's go."

### Competitive Positioning
Every competitor makes food truck operators feel like it's *their* job to figure out permitting. PermitPilot flips this — we did the research, we know the towns, we have the forms. You answer our questions and we handle the rest.

| Competitor | Their Positioning | Our Differentiator |
|------------|------------------|-------------------|
| General permit guides | DIY, overwhelming | We pre-fill everything |
| Lawyers / consultants | Expensive, slow | We're instant and low-cost |
| Town websites | Confusing, outdated | We aggregate and translate |
| Generic form tools | No local knowledge | We know CT-specific requirements |

**Unique proof point:** Public confidence scores per town showing exactly how complete our data is. No competitor does this. It's a vulnerability turned into a trust signal.

---

## 3. Color Palette

### Primary Colors

#### Authority Blue
- **HEX:** `#1B4FD8`
- **Use:** Primary CTAs, links, brand mark, interactive elements, active nav states
- **Psychology:** Trust, authority, precision — the blue of government forms, but brighter and more modern
- **Never use as:** Body text on dark backgrounds (fails contrast)

#### Clearance Green
- **HEX:** `#00C896`
- **Use:** Success states, "Approved" badges, Pioneer badge glow, completion indicators, positive data
- **Psychology:** Go signal, cleared, approved — the green light your permit finally got
- **Never use as:** Warning or neutral states (reserve for success only)

#### Midnight Navy
- **HEX:** `#0A0F1E`
- **Use:** Primary dark background, hero sections, card surfaces in dark theme
- **Psychology:** Professional depth, focus, premium — not flat black, but rich navy
- **Never use as:** Text color

### Secondary Colors

#### Permit Amber
- **HEX:** `#F5A623`
- **Use:** Pending status, warnings, incomplete confidence scores, Pioneer badge shine, "needs attention" states
- **Psychology:** Caution but not danger — the yellow light, not red
- **Never use as:** Body text on white (fails WCAG AA), success states

#### Cloud White
- **HEX:** `#F5F7FA`
- **Use:** Light theme backgrounds, form surfaces, cards on light theme
- **Never use as:** Text, icon fills

#### Slate Gray
- **HEX:** `#8897B2`
- **Use:** Secondary text, inactive states, borders, dividers, placeholder text, locked badge silhouettes
- **Never use as:** Primary text (insufficient contrast on white)

### Contrast Reference

| Combination | Contrast Ratio | Verdict |
|-------------|----------------|---------|
| White on `#1B4FD8` | 4.8:1 | ✅ Pass AA |
| White on `#0A0F1E` | 18:1 | ✅ Pass AAA |
| `#0A0F1E` on `#F5F7FA` | 17:1 | ✅ Pass AAA |
| `#1B4FD8` on `#F5F7FA` | 5.2:1 | ✅ Pass AA |
| `#F5A623` on `#0A0F1E` | 3.9:1 | ❌ Fail — never for body text |
| `#8897B2` on `#F5F7FA` | 3.1:1 | ❌ Fail — decorative only |

---

## 4. Typography System

### Font Stack
- **Display / Headings:** `Plus Jakarta Sans` — Google Fonts, free, Bold (700) weight
- **Body / UI:** `DM Sans` — Google Fonts, free, Regular (400) and Medium (500) weights
- **Fallback:** `system-ui, -apple-system, BlinkMacSystemFont, sans-serif`

### Google Fonts Import
```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700&family=DM+Sans:wght@400;500&display=swap');
```

### Tailwind Config Addition
```js
fontFamily: {
  display: ['Plus Jakarta Sans', 'sans-serif'],
  body: ['DM Sans', 'sans-serif'],
}
```

### Type Hierarchy

| Level | Font | Size | Weight | Letter Spacing | Line Height | Use |
|-------|------|------|--------|---------------|-------------|-----|
| Display / Logo | Plus Jakarta Sans | 32–52px | 700 | -0.025em | 1.05 | Hero headlines, app name |
| H1 | Plus Jakarta Sans | 28–32px | 700 | -0.02em | 1.1 | Page titles |
| H2 | Plus Jakarta Sans | 20–22px | 600 | -0.01em | 1.2 | Section headers |
| H3 | Plus Jakarta Sans | 17–18px | 600 | 0 | 1.3 | Card titles, sub-sections |
| Body | DM Sans | 15–16px | 400 | 0 | 1.7 | All paragraph text |
| Body Strong | DM Sans | 15–16px | 500 | 0 | 1.7 | Emphasized body text |
| Label / Cap | DM Sans | 11–12px | 500 | 0.1em | 1.4 | ALL CAPS labels, status, metadata |
| Micro | DM Sans | 11px | 400 | 0 | 1.4 | Legal, fine print, timestamps |

### The One Rule to Never Break
Do not mix Inter with Plus Jakarta Sans — they compete at the same weight. The current codebase uses Inter everywhere. **When rebranding, swap Inter out entirely** — replace with DM Sans for body, Plus Jakarta Sans for headings.

---

## 5. Brand Voice Guide

### Dimension 1: Precise, Not Vague
- ✅ **Do:** "West Hartford requires a $35 fee, a copy of your ServSafe cert, and a site plan. We've pre-filled the form — just review and sign."
- ❌ **Don't:** "Our platform provides comprehensive permit management solutions to help you navigate the complex regulatory landscape of food service operations."

### Dimension 2: Human, Not Robotic
- ✅ **Do:** "Looks like you're missing your vehicle registration. Upload it here and we'll add it to your application automatically."
- ❌ **Don't:** "Error: Required document field 'vehicle_registration' is null. Please upload the required documentation to proceed with your application."

### Dimension 3: Empowering, Not Hype
- ✅ **Do:** "You're the first food truck to apply in Torrington. Complete this and earn your Pioneer badge — plus your data helps every operator who comes after."
- ❌ **Don't:** "AMAZING! You've unlocked a BRAND NEW achievement! You're a PIONEER! Share this incredible milestone RIGHT NOW!"

### Dimension 4: Confident, Not Hedging
- ✅ **Do:** "We've filed permits in 23 CT towns. West Hartford takes 5–7 business days. We'll notify you the moment it's approved."
- ❌ **Don't:** "Permit timelines may potentially vary and we cannot guarantee any specific outcomes as regulations can sometimes change without notice."

### Words to Use Often
`filed` · `cleared` · `ready` · `verified` · `navigate` · `requirements` · `automatically` · `approved` · `your town` · `done`

### Words to Never Use
`seamless` · `solution` · `platform` · `leverage` · `streamline` · `synergy` · `comprehensive` · `innovative` · `guaranteed` · `game-changing`

### Voice by Channel

**In-app copy:**  
Short. Action-oriented. Always tells the user what to do next.  
✅ "3 fields left. Review and submit."  
❌ "You are almost done completing your permit application. Please review the remaining fields."

**Push notifications:**  
Ultra-short. News, not noise.  
✅ "Your West Hartford permit was approved. 🟢"  
❌ "Great news! We have an important update regarding the status of your pending permit application."

**Email:**  
Lead with outcome, follow with detail.  
✅ Subject: "Your Newtown permit is ready to submit"  
❌ Subject: "Action required: Permit application status update"

**Error messages:**  
Always: what happened + what to do + not their fault.  
✅ "We couldn't connect to West Hartford's portal right now. Your progress is saved — try again in a few minutes or download the PDF instead."

### Elevator Pitches

**1 sentence:**  
PermitPilot files Connecticut food truck permits for you — automatically, town by town.

**3 sentences:**  
PermitPilot is the permit copilot for CT food truck operators. Upload your business docs once, pick your town, and we pre-fill every form using real requirements we've verified at city hall. You review, sign, and submit — we handle the rest.

**1 paragraph:**  
Every CT town has different permit requirements, different forms, and different portals — and figuring it out has always been the food truck operator's problem. PermitPilot changes that. We've done the research for every town in Connecticut, built a database of verified requirements and forms, and connected it to an AI that pre-fills your applications from the documents you already have. From business license to health permit to event approval: upload once, file everywhere, and spend the time you saved actually cooking.

---

## 6. Taglines

| # | Tagline | Tone |
|---|---------|------|
| **1** | **Your permit copilot.** | Safe · Clear · Evergreen — **PRIMARY** |
| **2** | **Filed. Not filed out.** | Bold · Punchy · App store — **CAMPAIGNS** |
| 3 | From paperwork to permit in one session. | Descriptive · Benefit-led |
| 4 | Connecticut's permit playbook for food trucks. | Local · Trust-building |
| 5 | Every CT town. Every form. Already filled. | Feature-led · Direct |
| 6 | Stop googling. Start rolling. | Bold · Social · Food truck culture |
| 7 | Cleared for takeoff. | Brand-aligned · Aviation wordplay |
| 8 | We know every town's paperwork. Now you do too. | Empowering · Educational |
| 9 | The permit app that's actually been to city hall. | Credibility · Differentiating |
| 10 | Roll in. Roll out. Permit handled. | Very bold · Culture-forward · High risk |

---

## 7. Logo Design Specs

> **For developers:** Logo SVG files live in `/client/public/` once created.  
> Reference as: `logo-dark.svg`, `logo-light.svg`, `icon.svg`

### 3 Required Variants

#### Variant A: Primary Lockup (Dark Background)
- Layout: Icon left · Wordmark right or stacked below
- Icon: Geometric navigation/compass mark (see Icon Directions)
- Colors: Icon fill = `#1B4FD8` · "Permit" = `#FFFFFF` · "Pilot" = `#1B4FD8` or `#00C896`
- Font: Plus Jakarta Sans Bold · -0.025em letter spacing
- Background: Use on `#0A0F1E` only
- Min width: 120px

#### Variant B: Horizontal Lockup (Light Background)
- Layout: Icon left · "PermitPilot" inline (single line)
- Colors: Icon = `#1B4FD8` stroke · "Permit" = `#0A0F1E` · "Pilot" = `#1B4FD8`
- Background: Use on `#F5F7FA` or white
- Min width: 120px

#### Variant C: App Icon (Square)
- Shape: Square, border-radius = ~21% of side length
- Fill: `#1B4FD8`
- Icon: Single white mark, centered, 60% of container size
- No wordmark
- Export sizes: 16px · 32px · 180px · 192px · 512px

### Icon Direction Options — Pick ONE

**Option A: Compass Rose**  
Minimal 4-point compass, slightly asymmetric. North point in `#00C896`. Other 3 points in white. Classic navigation authority. Works at any size.

**Option B: Isometric Navigation Stamp ✅ Recommended**  
3D-perspective diamond or hexagon — suggests both a permit stamp and a map waypoint. Unique in GovTech/FoodTech. Conveys "official" and "direction" simultaneously. Memorable as an app icon.

**Option C: Path + Checkmark**  
Curved route line ending in a checkmark. Most literal — instantly communicates navigate → approved. Highest comprehension for new users, least unique visually.

### Logo Chat Prompt Template
```
Design a logo for "PermitPilot" — a food truck permit filing app for Connecticut.

Brand: Expert copilot. Trustworthy. Precise. The Stripe/Linear of government permitting.
Style: Minimal, geometric, flat — inspired by Stripe, Vercel, Linear, Fidelity.
NOT: Old government portals, clipart, busy fintech dashboards.

Icon direction: [Option A / B / C — pick one]

Colors:
- Primary: #1B4FD8 (Authority Blue)
- Accent: #00C896 (Clearance Green)
- Dark bg: #0A0F1E (Midnight Navy)
- Light bg: #F5F7FA (Cloud White)

Font: Plus Jakarta Sans Bold

Deliver:
1. SVG — Primary lockup on dark bg (#0A0F1E)
2. SVG — Horizontal lockup on light bg (#F5F7FA)
3. SVG — App icon square (56x56, border-radius 12)
```

### Logo Usage Rules
- Maintain clear space equal to the height of the cap "P" on all 4 sides
- Never stretch, rotate, or recolor the mark
- Never place dark lockup on light bg or vice versa
- Never add drop shadows, glows, or gradients to the mark
- Never use wordmark without the icon (except at very small sizes where only icon renders)

---

## 8. The 3 Rules You Never Break

### Rule 1: Clarity beats cleverness
Every screen, every line of copy, every UI element must answer: "Does this make it easier to file a permit?" If not, cut it. No easter eggs. No jargon. No design flourishes that obscure the next action. When in doubt, remove.

### Rule 2: Never inflate your data
If confidence is 62%, say 62%. If the permit takes 10 days, say 10. The brand lives and dies on trust. One inaccurate number destroys what 100 accurate ones built. Amber means incomplete — own it publicly. The confidence score system is a competitive advantage only if it's honest.

### Rule 3: The operator is always the hero
PermitPilot is never the star. Copy reads "you" not "we." The badge system rewards the *operator's* effort. Analytics show the *operator's* progress. Marketing shows *operator outcomes*, not product features. We are the guide, always in service of their success.

---

## 9. Rebrand Checklist

Work through this in Claude Code (terminal), in order:

### Phase 1: Name + Copy
- [ ] Search `client/` for "PermitTruck" → replace with "PermitPilot"
- [ ] Update `replit.md` — app name
- [ ] Update `manifest.json` — `name` and `short_name` fields
- [ ] Update `package.json` — `name` field
- [ ] Update HTML `<title>` and meta description tags
- [ ] Update `landing.tsx` — hero headline using tagline #1 or #2
- [ ] Update onboarding flow copy using voice guide
- [ ] Update all error messages using error message format
- [ ] Update dashboard welcome message

### Phase 2: Fonts
- [ ] Add Google Fonts import to `index.html`
- [ ] Update `tailwind.config.ts` — add `fontFamily.display` and `fontFamily.body`
- [ ] Update `design_guidelines.md` — replace Inter references
- [ ] Audit component classes: headings → `font-display`, body → `font-body`

### Phase 3: Colors
- [ ] Update CSS variables in global stylesheet
  - `--color-primary: #1B4FD8`
  - `--color-success: #00C896`
  - `--color-bg-dark: #0A0F1E`
  - `--color-warning: #F5A623`
  - `--color-bg-light: #F5F7FA`
  - `--color-text-secondary: #8897B2`
- [ ] Update `tailwind.config.ts` color tokens
- [ ] Audit all hardcoded hex values in components

### Phase 4: Logo (after logo is designed)
- [ ] Place SVGs in `client/public/`: `logo-dark.svg`, `logo-light.svg`, `icon.svg`
- [ ] Generate favicon sizes → replace `public/favicon.ico`
- [ ] Update `manifest.json` icon paths
- [ ] Update `<img>` references in `landing.tsx` and header component
- [ ] Update `sw.js` if it references any icon paths

---

*This document is the brand source of truth for PermitPilot. Drop it in the project root and reference it from Claude Code as `BRAND_BIBLE.md`. Any design, copy, or product decision that contradicts it should be discussed before shipping.*
