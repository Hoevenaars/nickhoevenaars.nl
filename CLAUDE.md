# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static, single-page personal portfolio site for Nick Hoevenaars (nickhoevenaars.nl), deployed via GitHub Pages with a custom domain configured in `CNAME`. There is no build system, package manager, or framework — the entire site is a single `index.html` file.

## Development Workflow

No build or install step is required. To preview locally, open `index.html` directly in a browser or use any static file server:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Deploying is done by pushing to the main branch on GitHub — GitHub Pages serves the files directly.

## Architecture

- **`index.html`** — the entire site. Contains all HTML, CSS (inline `<style>`), and SVG assets in one minified file.
- **`CNAME`** — contains `nickhoevenaars.nl` for GitHub Pages custom domain routing.

The current `index.html` is heavily minified. When editing, be aware of:

- **CSS design tokens** (CSS custom properties): `--bg`, `--surface`, `--ink`, `--mid`, `--line`, `--accent`, `--maxw` — used consistently throughout the inline styles.
- **Fonts**: Space Grotesk (display, wght 500/700) and Inter (body, wght 300/500) loaded from Google Fonts via `<link rel="preconnect">`.
- **Animation**: A `drift` keyframe animation (18s ease-in-out infinite alternate) drives the animated gradient background using radial gradients and CSS blur.
- **Accessibility**: A `prefers-reduced-motion` media query disables animations for users who have that preference set.
- **Responsive sizing**: Font sizes use `clamp()` rather than fixed breakpoints.
- **Language**: Page content is in Dutch (`lang="nl"`).

## Conventions

- Keep the file self-contained — no external CSS or JS files.
- Maintain the `prefers-reduced-motion` media query when adding or changing animations.
- The site links to `https://www.linkedin.com/in/nickhoevenaars` as its primary CTA.
