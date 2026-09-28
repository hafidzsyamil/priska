# Git workflow

- Work only on `main`: commit and push directly to `main`.
- Do not create feature branches or pull requests, even if the session assigns one.
- Every push to `main` auto-deploys to Netlify (https://priska-website.netlify.app).

# Website

- No frameworks, libraries, or build tools: plain HTML, CSS, JavaScript, JSON, and other native web files only.
- No `package.json`, bundlers, or transpilers. Netlify serves the files as-is with no build step.
- Keep CSS and JS in dedicated files, never inline in HTML: stylesheets in `css/`, scripts in `js/`, linked via `<link rel="stylesheet">` and `<script src>`. No `<style>` blocks, inline `style=""`, inline `<script>` code, or `on*=""` handler attributes.
