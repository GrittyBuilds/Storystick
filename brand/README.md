# Storystick — Brand Package v1.0

**Tagline:** Draw it before you build it.
**Issued:** August 2026

A design and drafting tool for people who build things — furniture, renovations, structures.
Precise enough for a permit set, simple enough for a Saturday project.

---

## Start here

| File | What it is |
|---|---|
| `brand/storystick-brand-guide.html` | **The main document.** Open in any browser. Self-contained — fonts and images are embedded, so it works offline and can be emailed as one file. |
| `brand/storystick-brand-guide.pdf` | Same thing, 30 pages, for printing or sending to a vendor. |
| `ui/storystick-ui-kit.html` | Interface components, tokens, and both canvas modes. Hand this to whoever builds the app. |
| `gtm/storystick-landing.html` | A working marketing page you can host as-is or use as a reference build. |

---

## Contents

```
logo/
  svg/     20 vectors — mark, wordmark, and every lockup
  png/     the same set at 1x and 2x, transparent
icon/
  app-icon.svg + PNG at 1024/512/256/192/180/120/96/64   (dark — primary)
  app-icon-light, app-icon-blue                          (alternates)
  app-icon-maskable                                      (Android / PWA — full bleed)
  favicon-mark  + PNG at 64/48/32/16, favicon.ico        (two-notch simplification)
brand/
  storystick-brand-guide.html / .pdf
ui/
  storystick-ui-kit.html / .pdf
gtm/
  storystick-landing.html
  social/       OG image, X banner, LinkedIn banner, YouTube banner, avatars
  screenshots/  four app-store frames at 1290x2796
fonts/          Space Grotesk, Inter, IBM Plex Mono (TTF) + OFL licenses
tokens.json     machine-readable design tokens
tokens.css      the same tokens as CSS custom properties
```

---

## The short version

**The mark** is a story pole standing on a floor line, with one measurement transferred out in cedar.
The notches are knocked out, not painted — the mark is one solid color plus one accent line, so a single
file works on any background.

**Color.** Blueprint `#0F2338` and Drafting Blue `#1B5FA6` do the work; Cedar `#D98235` is the accent and
should never exceed roughly 5% of a layout. Vellum `#F7F4ED` is the light ground.

**Type.** Space Grotesk for the brand and headings. Inter for interface and body. IBM Plex Mono for every
number a user has to read exactly. That last rule is the one that makes the product feel like an instrument.

**One accessibility trap to remember:** Cedar hits only 2.66:1 on Vellum. It is a shape color on light
backgrounds, never a text color. Use Cedar Deep `#9E5813` when cedar has to carry words on a light ground.

---

## Before you spend money on this

1. **Trademark.** Run a USPTO search in Class 9 (software) and Class 42 (SaaS) for "Storystick" and near
   neighbors before printing anything or filing. The screening behind this package covered live products
   and domains — it did **not** cover registry records. A short conversation with a trademark attorney
   before launch is cheaper than a rebrand after.
2. **Domains and handles.** `storystick.app` and `storystick.com`, plus the matching handles. YouTube and
   Instagram matter more than usual here — woodworking discovery runs through both.
3. **Fonts.** All three are SIL Open Font License 1.1: free to use commercially, free to embed in an
   application, free to ship. Keep the `OFL-*.txt` files alongside the fonts if you redistribute them.

---

## Regenerating anything

The package was generated from the scripts in `scripts/` (`build_fonts.py` first, then `build_logo.py`,
`build_icon.py`, `build_guide.py`, `build_web.py`, `build_landing.py`, `build_gtm.py`), with the mark
geometry and wordmark setting in `scripts/lib/sslogo.py`. If a color or a
proportion needs to change, change it in `scripts/lib/sslogo.py` or `tokens.json` and re-run — every asset rebuilds
from the same source of truth.
