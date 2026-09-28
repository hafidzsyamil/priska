# Cek Kredibilitas Artikel

Paste a news article link and get a 0–100 credibility indicator, with reasons and evidence you can check yourself. Currently a frontend with demo data; the analysis backend is not built yet.

- `public/` — everything Netlify serves
  - `index.html` — home page and link form
  - `hasil.html` + `js/hasil.js` — results page, rendered from JSON
  - `css/` — `tokens.css` (design tokens), `base.css`, `components.css`, and one file per page
  - `data/contoh/` — fictional demo results
- `docs/` — product brief (`handoff.md`), design system (`design-system.md`), approved backend API plan (`usulan-api.md`)
- `netlify.toml` — publishes `public/` with no build step, and skips deploys when only files outside `public/`, `netlify/` and `netlify.toml` change

Run locally: `python3 -m http.server -d public 8000`, then open http://localhost:8000.
