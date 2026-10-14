# 0010. Tailwind rather than plain CSS

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

Contour has a small, tightly specified visual language: a dark palette, one accent colour, a
monospace numeric scale, and a handful of marks and controls, all written down in
`design/DESIGN.md` with mockups in `design/mockups/*.html`. Six screens, no theming, no white
label, no second brand.

At that size, plain CSS is a perfectly defensible answer and the velocity argument for a utility
framework is weak. The argument that decided it is a different one. Plain CSS accumulates ad-hoc
class names and near-duplicate rules across features — a `.ride-stat` here, a `.stat-large`
there, subtly different for no recoverable reason — and the cascade means a rule written for one
screen can change another. On a codebase that is largely generated and only lightly reviewed,
that is a slow drift nobody catches, because each individual addition looks fine.

With utilities there is no cascade to reason about. A component's appearance is legible at the
component, and a duplicate is visible as a duplicate rather than hiding behind a new class name.

CSS Modules and CSS-in-JS were not seriously considered: the first has the same naming-drift
problem with better scoping, and the second adds a runtime for an app with no dynamic theming.

## Decision

Tailwind v4, wired in through `@tailwindcss/vite`.

Design tokens — accent colour, dark palette, monospace scale, spacing — are defined once in the
`@theme` block and referenced by name everywhere else. A raw hex value in a component is a bug,
not a shortcut. Where `design/DESIGN.md` and a mockup disagree, the written rule wins.

## Consequences

- Markup carries long utility strings, and a component's class attribute is often the least
  readable line in the file. This is the standard, real complaint about Tailwind and it applies
  here in full.
- Repeated combinations have to be pulled into a component rather than a shared class, so the
  component layer is doing work the stylesheet would otherwise do. For this app that is the right
  place for it, but it does mean "just restyle it" sometimes means touching a component.
- The SVG charts use the same tokens as the rest of the UI, so the accent colour is one value
  rather than two that drift apart.
- **Version drift is the live hazard.** Tailwind v4 moved configuration into CSS (`@theme`), while
  most documentation and almost all generated code describes v3 — `tailwind.config.js`,
  `@tailwind base`, the old plugin wiring. Generated setup code will routinely be a version
  behind and will sometimes half-work, which is worse than failing outright. The mitigations are
  to record the installed version and its conventions in `CLAUDE.md` so local context overrides
  the model's prior, and to check generated setup against the installed version rather than
  assuming. The same hazard applies to any dependency that has recently changed its public shape.
- Removing Tailwind later is a genuine rewrite of the view layer, not an afternoon. That is
  accepted: unlike Vite, this one is not cheaply reversible.
- Fonts are self-hosted rather than CDN-linked as the mockups have them. Offline operation is a
  stated virtue of this app and a webfont request is the one thing that would break it.
