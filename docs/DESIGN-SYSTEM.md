# V-Guard Rishta design system

Applies to every module. Source of truth: `src/styles/tokens.css` (CSS variables) and
`src/lib/chartColors.ts` (chart SVG colours, kept in step with the tokens).

> No official V-Guard brand file or logo is in the repository. The palette below is the proposed
> default from refinement brief 01.1. Replace the `--vg-*` values when official codes arrive;
> components read tokens only. The yellow "V" mark in the sidebar is a placeholder for the
> official logo.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `--vg-yellow` | `#FFD000` | Primary: actions, active states, key accents |
| `--vg-yellow-deep` | `#F2B900` | Gradient stop, hover borders |
| `--vg-amber` | `#E5A000` | Gradient end, yellow chart strokes |
| `--vg-yellow-light` | `#FFF4C2` | Selected states, chips, soft tints |
| `--vg-yellow-wash` | `#FFFAEB` | Row and item hover |
| `--vg-yellow-ink` | `#8A6500` | Yellow-family text on white (5.3:1) |
| `--vg-black` | `#111318` | Sidebar, primary text, dark surfaces |
| `--vg-charcoal` | `#242833` | Secondary dark surfaces, comparison chart series |
| `--vg-white` | `#FFFFFF` | Cards and panels |
| `--vg-offwhite` | `#F7F7F4` | Application background |
| `--vg-grey-light` | `#E8E8E5` | Borders and dividers |
| `--vg-grey-muted` | `#737780` | Supporting text |

Semantic (meaning only): positive `#1E9E62` (text `#127A49`), warning `#F08C00` (text `#A35A00`),
negative `#E5484D` (text `#C4262E`), info `#3B82F6`, teal `#14A39A`.

Rules: text on yellow is always black. Yellow is never used as text on white; use
`--vg-yellow-ink`. Red, orange and green appear only when the data means failure, pending or success.

## Gradients

| Token | Definition | Used on |
| --- | --- | --- |
| `--grad-yellow` | `#FFD000 → #FFC400 → #F2B900` (135°) | Primary buttons, primary KPI cards, active icons, segmented selection |
| `--grad-amber` | `#FFD000 → #F5B000 → #E5A000` | Ranked bars, budget bars |
| `--grad-dark` | `#111318 → #1C1F27 → #2A2E3A` (145°) | Hero banner, dark KPI cards, drawer header, toasts |
| `--grad-light` | white 92% → `#FFFAEB` 78% | Light glass KPI cards, TDS cards |
| `--grad-yellow-wash` | `#FFF4C2` 55% → transparent | Callouts, identity header, geography bar |
| `--grad-nav-active` | yellow 20% → 4% (90°) | Active sidebar item |
| `--grad-glow-yellow` / `--grad-sheen` | radial glow / white sheen | Card illumination |

## Glass

`--glass-bg` (white 72%), `--glass-bg-strong` (white 88%), `--glass-border`, `--glass-edge`,
`--glass-blur` (`blur(14px) saturate(150%)`). Glass is used for the filter card, dashboard section
containers, light and status KPI cards, the header, popovers and the search dialog. Text on glass always sits
on at least 72% white.

## Type, spacing, radius, depth, motion

- Plus Jakarta Sans (400–700) for the interface, IBM Plex Mono for codes, IDs and chart axes.
  Scale: 12 · 13 · 14 · 16 · 18 · 22 · 28 · 32.
- 4px spacing grid. Radius: tags 6, controls 10, cards 14, panels and KPI cards 18.
- Shadows: `--shadow-1`, `--shadow-card`, `--shadow-lift` (hover), `--shadow-yellow`, `--shadow-dark`.
- Focus: `--focus-ring` (white gap, black ring, yellow halo) on every interactive element.
- Motion: one curve `cubic-bezier(0.22, 1, 0.36, 1)`; 150 ms feedback, 200 ms menus,
  340 ms entrances. Card lift on hover, staggered KPI entrance, sparkline draw, bar grow,
  chart entrance (700 ms). All disabled under `prefers-reduced-motion`.

## Components

| Component | Variants / notes |
| --- | --- |
| Button (`.btn`) | `--primary` (yellow gradient, black text), `--dark`, `--secondary`, `--tertiary`, `--ghost`, `--danger`; sizes `--sm`, `--xs` |
| KPI card (`KpiCard`) | `primary` yellow, `dark` black glass, `light` white glass, `status` + tone `positive`/`warning`/`negative`; icon, value, change pill, sparkline, description; always clickable |
| Status badge | pill; positive / warning / negative / info / neutral / accent |
| Select (`SelectField`) | `active` shows a yellow-tinted, yellow-edged control; disabled shows dashed border and lock icon |
| Table (`DataTable`) | gradient header, zebra rows, yellow hover with left accent, yellow sort icon, bordered pager |
| Panel | white card, the one container for charts, tables and figure rows |
| Dashboard section | glass container, yellow icon tile (filled when open), black/yellow chevron |
| Drawer / dialog | dark header with yellow rule / yellow top rule |
| Toast | dark with yellow (or semantic) edge |
| Charts | lead series yellow (amber stroke), comparison charcoal, success green, failure red, pending orange; gradient bars and area washes; dark tooltip with yellow rule |

Programme colours (config/programmes.ts): EP yellow `#FFC400`, Retailer charcoal `#242833`,
CS teal `#14A39A`, ST orange `#F07C1E`, DD blue `#4F7FD9`.
