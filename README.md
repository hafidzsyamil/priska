# priska

A minimal hello-world static site for testing the Claude Code → GitHub → Netlify pipeline.

- `index.html` — the page
- `netlify.toml` — tells Netlify to publish the repo root with no build step

To check that a new deploy went live, bump the `Version` string in `index.html`, push, and reload the Netlify URL.
