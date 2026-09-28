# Cek Kredibilitas Artikel

Paste a news article link and get a 0–100 credibility indicator, with reasons and evidence you can check yourself.

- `public/` — everything Netlify serves
  - `index.html` — home page and link form
  - `hasil.html` + `js/hasil.js` — results page, rendered from JSON
  - `css/` — `tokens.css` (design tokens), `base.css`, `components.css`, and one file per page
  - `data/contoh/` — fictional demo results
- `netlify/functions/analisis.mjs` + `netlify/lib/` — the analysis API (`/api/analisis`): extract, label, find evidence, score
- `tests/` — `node --test tests/*.test.mjs`, external APIs stubbed
- `docs/` — product brief (`handoff.md`), design system (`design-system.md`), approved backend API plan (`usulan-api.md`)
- `netlify.toml` — publishes `public/` with no build step; skips deploys when only files outside `public/`, `netlify/` and `netlify.toml` change, or when the commit message contains `[skip netlify]`

The API needs `GEMINI_API_KEY`, `FACTCHECK_API_KEY` and `TAVILY_API_KEY` (optional: `JINA_API_KEY`, `GEMINI_MODEL`) set in Netlify's environment variables. Without them it answers 503 and the site says the analysis is not active yet.

Run the static site locally: `python3 -m http.server -d public 8000`, then open http://localhost:8000 (the API needs `netlify dev` or a deploy).
