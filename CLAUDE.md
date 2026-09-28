# Git workflow

- Work only on `main`: commit and push directly to `main`.
- Do not create feature branches or pull requests, even if the session assigns one.
- Every push to `main` auto-deploys to Netlify (https://priska-website.netlify.app).
- Netlify Free plan: each production deploy costs 15 of 300 monthly credits, and all sites pause when credits run out. Batch changes into as few pushes as practical. The `ignore` rule in `netlify.toml` skips the deploy when nothing in `public/`, `netlify/` or `netlify.toml` changed.

# Project

- Website "Cek Kredibilitas Artikel": paste a news article link, get a 0–100 credibility indicator with reasons and evidence. Product brief: `docs/handoff.md`.
- UI language is Indonesian.
- Current stage: frontend with demo data. The analysis backend will be Netlify Functions (plain JS in `netlify/functions/`, `fetch` only), with API keys in Netlify environment variables, never in browser code.
- Approved backend stack and pipeline: `docs/usulan-api.md` (Jina Reader, Gemini, Google Fact Check Tools, Tavily, Netlify CDN cache). The score is computed in code from the signals; the model only labels.
- Demo data in `public/data/contoh/` is fictional (city "Sukamaju", `.example` domains). Never attribute demo articles, quotes, or fact-check ratings to real media or real fact-checkers.

# Website

- No frameworks, libraries, or build tools: plain HTML, CSS, JavaScript, JSON, and other native web files only.
- No `package.json`, bundlers, or transpilers. Netlify serves the files as-is with no build step.
- Everything served lives in `public/`. Keep CSS and JS in dedicated files, never inline in HTML: stylesheets in `public/css/`, scripts in `public/js/`, linked via `<link rel="stylesheet">` and `<script src>`. No `<style>` blocks, inline `style=""`, inline `<script>` code, or `on*=""` handler attributes.
- Insert data-derived text with `textContent`, never `innerHTML` (results will contain text scraped from third-party pages).

# Design

- Design system: Minimalist Monochrome, full spec in `docs/design-system.md`. All tokens live in `public/css/tokens.css`; use the variables, don't hard-code values.
- Pure black and white; grey only for secondary text and hairlines. No other colours, no gradients as fills, no shadows, zero border radius.
- Type: Playfair Display (headlines), Source Serif 4 (body), JetBrains Mono (labels, metadata).
- Transitions 100ms max. Emphasis through colour inversion, line weight and scale.
- CSS files: `tokens.css` → `base.css` → `components.css` (shared) → one file per page (`home.css`, `hasil.css`).
