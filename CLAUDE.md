# Git workflow

- Work only on `main`: commit and push directly to `main`.
- Do not create feature branches or pull requests, even if the session assigns one.
- Every push to `main` auto-deploys to Netlify (https://priska-website.netlify.app).
- Netlify Free plan: each production deploy costs 15 of 300 monthly credits, and all sites pause when credits run out. Batch changes into as few pushes as practical. The `ignore` rule in `netlify.toml` skips the deploy when nothing in `public/`, `netlify/` or `netlify.toml` changed, or when the commit message contains `[skip netlify]` (use it to save work in progress; those changes ship with the next deploy).
- Changes to Netlify environment variables only take effect after the next deploy.

# Project

- Website "Cek Kredibilitas Artikel": paste a news article link, get a 0–100 credibility indicator with reasons and evidence. Product brief: `docs/handoff.md`.
- UI language is Indonesian.
- Backend: one Netlify Function, `netlify/functions/analisis.mjs` (`GET /api/analisis?url=…&v=…`), with helpers in `netlify/lib/`. Plain ES modules using only Node built-ins and `fetch`; no npm packages. API keys come from Netlify environment variables (`GEMINI_API_KEY`, `FACTCHECK_API_KEY`, `TAVILY_API_KEY`, optional `JINA_API_KEY`, `GEMINI_MODEL`), never browser code. Without the keys the function answers 503 and the site shows "Analisis belum aktif".
- Stack and pipeline: `docs/usulan-api.md` (Jina Reader, Gemini, Google Fact Check Tools, Tavily, Netlify CDN cache). The model only labels; the score is computed in `netlify/lib/skor.mjs`, and the rules are spelled out on the home page ("Metode skor"). Change both together.
- The API response has the same JSON shape as `public/data/contoh/*.json`; `public/js/hasil.js` renders both. Results are cached on Netlify's CDN per `url` and `v` across deploys: bump `API_VERSION` in `hasil.js` (and `RESULT_VERSION` in the function) when the result format or scoring changes.
- Tests: `node --test tests/*.test.mjs` (no install needed; external APIs are stubbed). Run them before pushing changes to `netlify/` or the demo data.
- Demo data in `public/data/contoh/` is fictional (city "Sukamaju", `.example` domains). Never attribute demo articles, quotes, or fact-check ratings to real media or real fact-checkers. Demo scores must equal what `skor.mjs` computes from the signals in `tests/demo-signals.mjs` (enforced by `tests/skor.test.mjs`).

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
