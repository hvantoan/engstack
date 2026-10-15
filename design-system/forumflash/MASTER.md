# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** ForumFlash — IELTS Vocabulary
**Generated:** 2026-10-15
**Category:** Education / Language Learning (IELTS B2–C1)
**Tone & Focus:** Content-First, Academic Clean, High Legibility, Distraction-Free


### Color Palette

Semantic tokens live in `src/index.css` (`:root` light / `.dark` dark, oklch):

| Role | Hex Equiv. | CSS Variable / OKLCH | Usage |
|------|------------|----------------------|-------|
| **Primary (Academic Gold)** | `#B45309` | `--primary`: `oklch(0.55 0.16 65)` | Main CTAs, links, active tab/selection, learning focus (WCAG AA 4.68:1 with white text) |
| **Primary Foreground** | `#FFFFFF` | `--primary-foreground`: `oklch(0.99 0 0)` | High-contrast text on primary buttons/badges |
| **Primary Subtle / Selection** | `#FEF3C7` | `--primary/10`: `rgba(180,83,9,0.08)` | Match-mode selection tile, active flashcard border tint |
| **Page Background** | `#FAF9F5` | `--background`: `oklch(0.985 0.006 85)` | Main canvas: warm ivory, non-glare, prevents eye strain during long study sessions |
| **Card / Surface** | `#FFFFFF` | `--card`: `oklch(1 0 0)` | Raised surfaces, flashcards, quiz options |
| **Foreground (Text Primary)** | `#1C1917` | `--foreground`: `oklch(0.22 0.015 60)` | Main vocabulary headwords, primary content (>14:1 contrast on white/ivory) |
| **Muted Foreground** | `#57534E` | `--muted-foreground`: `oklch(0.48 0.02 60)` | Vietnamese meanings, IPA phonetics, subtitles (≥4.8:1 contrast) |
| **Border / Hairline** | `#E7E5E4` | `--border`: `oklch(0.90 0.012 80)` | Subtle card & input boundaries without visual clutter |
| **Focus Ring** | `#B45309` | `--ring`: `oklch(0.55 0.16 65)` | 2px visible focus ring for keyboard navigation |
| **Success / Mastered** | `#15803D` | `--success`: `oklch(0.524 0.141 149)` | Correct answers, learned vocabulary count, mastered badge |
| **Success Tint** | `#F0FDF4` | `--success/10`: `rgba(21,128,61,0.08)` | Background highlight for correct / learned cards |
| **Destructive / Mistakes** | `#DC2626` | `--destructive`: `oklch(0.577 0.245 27.325)` | Wrong answers, items needing review, reset actions |
| **Destructive Tint** | `#FEF2F2` | `--destructive/10`: `rgba(220,38,38,0.08)` | Background highlight for mistakes |
| **Warning / Progress** | `#D97706` | `--chart-3`: `oklch(0.68 0.16 75)` | In-progress streak, halfway review milestones |
| **Topic Accents** | Mint / Coral / Yellow / Blue | `chart-2` / `chart-4` / `chart-3` / `chart-1` | 4 topic badges aligned with `src/lib/vocab.ts` (ACCENT_CLASS) |

**Color Philosophy:** Academic Gold & Warm Ivory palette. Gold symbolizes academic achievement, excellence, and intellectual warmth (inspired by Oxford & Ivy League honors). Paired with warm white canvas and stone slate typography to guarantee pristine contrast (WCAG AAA/AA) without eye strain.
### Typography

- **Heading Font:** CalSans (display & prominent vocabulary terms)
- **Body & Content Font:** Alexandria (clear geometric grotesque with high x-height and open counters)
- **Phonetics & Fallback:** Inter Variable (`@fontsource-variable/inter`), then system sans
- **Mood:** Academic clean, editorial, professional, high readability for IELTS B2–C1 candidates
- **IPA Display:** Consistent sans glyph support for IPA brackets `[ /.../ ]` with neutral tracking
**CSS:**
```css
/* src/index.css — @font-face blocks for Alexandria 400/700 and CalSans */
--font-sans: 'Alexandria', 'Inter Variable', sans-serif;
--font-heading: 'CalSans', 'Alexandria', sans-serif;
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

Use `src/components/ui/button.tsx` variants (shadcn). Token equivalents:

```css
/* Primary Button (variant="default") */
background: var(--primary);           /* academic gold */
color: var(--primary-foreground);
padding: 12px 24px; border-radius: var(--radius);
font-weight: 600; transition: all 200ms ease;

/* hover: bg-primary/80 — opacity shift only, no layout shift */

/* Secondary Button (variant="outline") */
background: var(--background);
border: 1px solid var(--border);
color: var(--foreground);
/* hover: bg-muted */
```

### Cards

```css
background: var(--card);
border: 1px solid var(--border);
border-radius: var(--radius-xl);      /* ~12px */
padding: 24px;
transition: box-shadow 200ms ease;
/* hover: shadow-md only — never transform/scale */
```

### Inputs

```css
padding: 12px 16px;
border: 1px solid var(--input);
border-radius: var(--radius);
font-size: 16px;
/* focus-visible: outline ring/50 — never remove */
```

### Semantic feedback (learning modes)

| State | Token | Where |
|-------|-------|-------|
| Correct answer / matched pair / learned | `success` (border + /10 bg) | quiz, match, write modes, header counter |
| Wrong answer | `destructive` | quiz, match, write modes |
| Selected (uncommitted) | `primary` | match-mode tile selection |

---

## Style Guidelines

**Style:** Modern Swiss Editorial for EdTech (Content-First Learning)

**Keywords:** Content-centric, distraction-free, high-contrast, structured hierarchy, balanced whitespace, cognitive ease, micro-elevation

**Best For:** Vocabulary platforms, language flashcards, academic reference, quiz engines, spaced repetition apps

**Key Effects:** Hairline borders (`1px solid var(--border)`), subtle card lift (`shadow-xs` / `shadow-sm`), zero layout-shifting hovers, snappy transitions (`150ms-220ms ease-out`)

### Learning Experience Layout Patterns

**Pattern Name:** Focused Study Deck (Single-Column Focus)

- **Study Modes (Learn, Quiz, Write, Match):** Centered container `max-w-2xl` to eliminate eye travel and cognitive fatigue.
- **Word List & Directory:** 2-column on tablet / 3-column on desktop (`max-w-6xl`) with uniform card heights.
- **Card Stability:** Flashcard containers reserve fixed `min-h-[280px]` so flipping between short term and multi-line examples never triggers Cumulative Layout Shift (CLS).
- **Keyboard-First Ergonomics:** Visible hotkeys (`Space`, `←`, `→`, `1-4`, `Enter`) displayed in subtle badges.

### Anti-Patterns to Avoid in Vocabulary Learning

- ❌ **Cartoonish / Childish Gamification:** Avoid bubbly shapes, bloated claymorphic 3D or noisy candy buttons that distract adult B2–C1 learners.
- ❌ **Pure Black Dark Mode (`#000000`):** Prolonged reading on pure pitch black causes halation and eye fatigue. Light mode is primary; dark mode should use deep slate (`#0B0F17`).
- ❌ **Color-Only Status:** Never use red/green alone to indicate right/wrong without supporting icons (Check/X) or text labels.
- ❌ **Slow Animations (>250ms):** Active recall demands snappy, fluent review cycles. Never lock the UI behind prolonged transitions.
- ❌ **Low-Contrast Secondary Text:** Example sentences and IPA phonetic guides must remain easily readable (minimum 4.5:1 ratio).

---

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
