# Site font — Neue Haas Grotesk Display Pro

The public website (marketing pages and auth screens) is set in
**Neue Haas Grotesk Display Pro**. Two cuts are used, by choice:

    NeueHaasDisplay-Roman.ttf       55 Roman → weight 400  (everything)
    NeueHaasDisplay-Thin.ttf        25 Thin  → weight 200  (only where something should read lighter)

Nothing heavier is declared on purpose: text set at weight 500 falls back to
Roman, and bold is synthesised by the browser. `NeueHaasDisplay-Medium.woff2`
is still in this folder but is NOT referenced by the stylesheet.

`app/rovora-site.css` declares the `@font-face` rules. If a file is ever
missing, browsers silently fall back to Geist, so nothing breaks.

Licensing note: this is a Monotype typeface used under Rovora's own web-font
licence. The files have to be committed, because production (Coolify) builds
straight from this repository — a self-hosted web font is served to visitors
either way, so keeping them in the repo does not expose anything the live site
doesn't already.
