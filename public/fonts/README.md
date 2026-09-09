# Display font — Neue Haas Grotesk Display Pro (Medium)

The public website's H1 titles (the hero title and each page's main title) are
set in **Neue Haas Grotesk Display Pro Medium**. Everything else stays in Geist.

    NeueHaasDisplay-Medium.woff2    (65 Medium → weight 500)

`app/rovora-site.css` declares the matching `@font-face`. If the file is ever
missing, browsers silently fall back to Geist, so nothing breaks — the titles
just don't switch over.

Licensing note: this is a Monotype typeface used under Rovora's own web-font
licence. The file has to be committed, because production (Coolify) builds
straight from this repository — a self-hosted web font is served to visitors
either way, so keeping it in the repo does not expose anything the live site
doesn't already.

Optional extra weights, if ever wanted, use the same naming:

    NeueHaasDisplay-Roman.woff2     (55 Roman → 400)
    NeueHaasDisplay-Bold.woff2      (75 Bold  → 700)
