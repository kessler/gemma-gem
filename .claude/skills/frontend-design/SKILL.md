---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when building web components, pages, or applications.
license: Complete terms in LICENSE.txt
---

# Frontend Design

Use this skill for frontend work in Gemma Gem. Build real working code with a clear visual point of view, production-quality interaction states, and careful fit inside the browser-extension surface.

## Design Thinking

Before coding, commit to a specific aesthetic direction:

- Purpose: what problem does this interface solve, and who uses it?
- Tone: choose a precise direction, such as brutally minimal, retro-futuristic, refined, playful, editorial, brutalist, art deco, soft, industrial, or utilitarian.
- Constraints: framework, performance, accessibility, extension shadow DOM, page isolation, and small-screen fit.
- Differentiation: identify the one visual or interaction detail people will remember.

The result should be functional, visually deliberate, cohesive, and refined in spacing, typography, color, motion, and states.

## Frontend Aesthetics Guidelines

- Typography: avoid default-feeling choices such as Arial, Roboto, Inter, or plain system stacks when a more characterful local font fits. Pair distinctive display text with readable body text.
- Color and theme: use CSS variables or coherent tokens. Prefer decisive palettes with sharp accents over timid, evenly distributed colors. Avoid generic purple-gradient-on-white patterns.
- Motion: use restrained animations where they communicate state or create a memorable moment. Prefer CSS motion for extension UI unless the app already uses a motion library.
- Spatial composition: use intentional asymmetry, strong alignment, controlled density, and stable dimensions.
- Background and detail: add atmosphere with contextual surfaces, texture, borders, and shadows when they support the product concept.

## Gemma Gem Direction

Gemma Gem is a compact browser tool, not a landing page. UI should feel like a private local agent console: dense, readable, technical, and calm. For the background browser helper, use the name "Gemma Relay" and make background activity visible without stealing focus from the current page.

For extension surfaces:

- Keep controls compact and predictable.
- Separate foreground chat from background agent activity.
- Show live state on the floating gem icon.
- Make details available in the overlay without exposing excessive page data by default.
- Ensure text wraps cleanly in the small panel and never overlaps controls.
