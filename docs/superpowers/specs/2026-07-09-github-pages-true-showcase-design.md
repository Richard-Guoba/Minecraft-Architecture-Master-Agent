# GitHub Pages True Showcase Design

Date: 2026-07-09

## Goal

Refresh `docs/index.html` into a polished GitHub Pages project homepage that matches the clean product-page style of the user-provided reference image while keeping every visible claim grounded in the current repository.

## Design Principle

Use the reference image for layout rhythm, density, whitespace, thin rules, green accents, command rows, benchmark strip, and four-column lower summary. Do not copy fake data from the image.

## Truth Constraints

- Use the real project name: Minecraft Architecture Master Agent.
- Use real commands: `npm test`, `npm start -- --mode mock ...`, `npm run benchmark:baseline ...`.
- Use real current status: `210/210` tests passing, `10/10` baseline prompts, average scorecard `100/100`, repair priorities `0`.
- Use real roadmap state: Stage 2 Template Knowledge Base v2 complete, Stage 3 Concept Studio next.
- Use real repository paths: `src/construction`, `src/llm`, `src/lib`, `test`, `mc_templates`, `docs`.
- Do not show invented model names, fake run times, fake dates, fake benchmark percentages, or fake preview renders.

## Page Structure

1. Sticky white header with brand mark, navigation, and GitHub link.
2. First viewport split into:
   - Left: large title, precise project copy, two real command rows, README/docs links.
   - Right: code-native system overview diagram showing prompt -> semantic agents -> deterministic geometry -> output artifacts.
3. Status strip with real benchmark/test metrics.
4. Lower four-column band:
   - Pipeline.
   - Current Capabilities.
   - Roadmap.
   - Project Files.
5. Footer with license, reproducibility, and GitHub actions.

## Responsive Behavior

Desktop should match the reference density. Tablet/mobile should stack the hero, keep command text readable, prevent horizontal overflow, and retain all metrics without clipping.

## Verification

Use Playwright/Chrome screenshot checks for desktop and mobile, static local resource checking, stale fake-data scanning, and `npm test`.
