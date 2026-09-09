# Display font — Neue Haas Grotesk Display Pro

The public website's page titles (h1) and section titles (h2) are set in
**Neue Haas Grotesk Display Pro Roman** (the regular weight). Everything else
stays in Geist.

Files in this folder and how the stylesheet maps them:

    NeueHaasDisplay-Roman.ttf       55 Roman  → weight 400  (USED by the headings)
    NeueHaasDisplay-Medium.woff2    65 Medium → weight 500  (declared, not currently used)
    NeueHaasDisplay-Thin.ttf        25 Thin   → not declared (kept for later)

`app/rovora-site.css` declares the matching `@font-face` rules. If a file is
ever missing, browsers silently fall back to Geist, so nothing breaks — the
titles just don't switch over.

Licensing note: this is a Monotype typeface used under Rovora's own web-font
licence. The files have to be committed, because production (Coolify) builds
straight from this repository — a self-hosted web font is served to visitors
either way, so keeping them in the repo does not expose anything the live site
doesn't already.
