# Storystick

**Draw it before you build it.**

Design blueprints and plans for structures, buildings, renovation projects and
woodworking projects — floor plans, framing layouts, demo/new renovation
drawings, furniture and casework — then get the cut list, schedules and
materials estimate out the other side.

Storystick is a drafting app with a **construction brain**: it knows the
difference between a wall and a line, between existing work and demolition,
and between a sheet of plywood and a 2x4. Drawings are measured in real
feet-and-inches (or millimetres) and every takeoff is derived from the drawing
itself, so the numbers stay honest when the plan changes.

*The name comes from the story pole (or "story stick") — the marked-up stick a
carpenter uses to carry real measurements from the work to the drawing.*

## Running it

No build step, no bundler, no runtime dependencies.

```bash
npm start          # serves the app at http://127.0.0.1:4173
```

Then open the URL in a browser. Anything you draw is saved to the browser's
local storage automatically, and can be exported to a `.storystick` file to
move between machines.

```bash
npm test           # unit tests for units, geometry, documents, takeoffs
npm run smoke      # end-to-end browser test (needs the optional playwright dep)
```

## Two canvas modes

Storystick ships **Blueprint** and **Paper**, and neither is the other one
inverted:

- **Blueprint** is the default working mode — dark canvas, chalk geometry, sky
  dimension lines, cedar on whatever is selected.
- **Paper** is for printing, for sharing, and for a phone screen in direct sun.

The whole shell follows the canvas, and the choice is remembered per browser.
Exports are always drawn in Paper mode, because they exist to be printed.

## What you can draw

| Tool | Key | What it does |
| --- | --- | --- |
| Select | `V` | Pick, move, grip-edit, marquee-select |
| Wall | `W` | Chained walls with real thickness and a new / existing / demo status |
| Door · Window | `D` `N` | Hosted openings that cut a real hole in the wall they sit on |
| Room | `R` | Named polygon that reports its own area and perimeter |
| Line · Rectangle · Polyline · Circle · Arc | `L` `B` `P` `C` `A` | General drafting geometry |
| Part | `K` | A woodworking part: material, thickness, quantity — feeds the cut list |
| Dimension · Text · Measure | `M` `T` `E` | Annotation and on-the-fly measuring |

Projects hold **multiple sheets** (floor plan, elevations, part layout, …) and
a full **layer** stack with visibility, locking and per-layer colour and line
weight.

### Drawing accurately

- **Type the length.** While drawing, type `8'`, `8'-6 1/2"`, `102.5` or
  `2600mm` and press Enter — the segment is created at exactly that length in
  the direction you are pointing. Rectangles and parts accept `48 x 24`.
- **Snapping.** Endpoints, midpoints, centres, quadrants, intersections,
  perpendicular feet and nearest-point-on-edge, plus a grid snap. `F3` and `F7`
  toggle them; the status bar names whatever you are currently snapped to.
- **Ortho.** Hold `Shift` for 90°, `Alt` for 45°, or press `F8` to latch it on.
- **Units.** Imperial with real fractions (down to 1/64") or metric — switch
  the whole project at any time in Settings; every label reformats.

## What you get out

**Cut list & stock layout** — every part in the project, merged by size and
material, packed onto real sheet goods and boards with your saw kerf taken into
account, and drawn as cutting diagrams. Sheet goods use a shelf-packing
guillotine heuristic; solid stock is ripped into lanes of a given width and
then packed along its length. Parts that don't fit the stock are reported
rather than quietly dropped.

**Schedules & takeoff** — door schedule, window schedule, room schedule with
areas, and a wall takeoff split by new / existing / demo with opening areas
subtracted from the net wall area.

**Materials estimate** — studs and plates at your stud spacing, drywall sheets,
paint, flooring, doors and windows, demolition and the millwork from the cut
list, with a waste allowance and a contingency line.

**Exports** — vector SVG of any sheet (with a title block, scaled and
print-ready), PNG, CSV for each report, and the `.storystick` project file.
Drag a `.storystick` file onto the window to open it.

## Renovation work

Walls carry a status, and the drawing reads the way a renovation drawing
should: **light grey and thin** for existing to remain, **dashed red with no
poché** for demolition, **full section-cut weight** for new work — three
signals each, so the sheet still reads printed in greyscale. The wall takeoff
and the estimate keep those categories separate, so demolition is priced as
demolition and only new walls get framed.

## Templates

Storystick opens with a starting point rather than a blank page: blank plan,
12 × 16 storage shed, 16 × 12 deck, kitchen renovation, blank woodworking
project, 36 × 72 bookshelf and a 60 × 24 workbench. Everything in a template is
ordinary editable geometry.

## Brand

The full brand package lives in `brand/` and is the source of truth: tokens,
logo and icon sets, the three typefaces, the brand guide and the interface kit.
The app consumes it rather than duplicating it — `brand/tokens.css` supplies
every CSS custom property, and `src/render/theme.js` is the only file in the
codebase allowed to name a drawing colour.

A few rules the code actually enforces:

- **Mono means exact.** Anything a user could mis-read by a sixteenth —
  dimensions, coordinates, cut lists, quantities, costs — is set in IBM Plex
  Mono. Prose is Inter. Headings and the project name are Space Grotesk.
- **Cedar is singular.** Cedar marks the active tool and the selected geometry,
  nothing else. Hover, preview and primary buttons are Drafting Blue, so cedar
  always means "this is what you're working with". A test enforces it.
- **Line weights are plotted millimetres.** Layers store the brand's weight
  table — 0.7 mm section cut, 0.5 outline, 0.35 surface, 0.25 dimension,
  0.18 construction — and the renderer converts to pixels at draw time.
- **Colour is never alone.** Demolition is dashed *and* red *and* loses its
  poché; existing work is lighter *and* thinner. The drawing still reads in
  greyscale or in glare.
- **Errors name the fix.** "'12x' isn't a length Storystick can read. Try 8',
  8'-6 1/2" or 102.5." — not "invalid input".

Project files record a version. Files written before the brand pass are
migrated on load: layer weights are remapped from screen pixels to plotted
millimetres and each layer gains its Blueprint-mode colour.

## How it is put together

```
index.html            app shell
styles/app.css        all styling, built on the brand tokens
styles/fonts.css      self-hosted Space Grotesk, Inter, IBM Plex Mono
brand/                the brand package — tokens, logos, icons, fonts, guides
src/
  core/
    units.js          imperial/metric parsing and formatting (model unit = inch)
    geometry.js       2D kernel: vectors, segments, polygons, boxes, intervals
    entities.js       entity factories, outlines, hit testing, edit handles
    document.js       project model — layers, sheets, materials, validation
    history.js        snapshot undo/redo
    snap.js           object/grid snapping and ortho constraints
    store.js          localStorage persistence and file (de)serialisation
  render/
    viewport.js       screen <-> model transform
    theme.js          the two canvas palettes and the brand line weight table
    renderer.js       canvas renderer (world transform, screen-constant weights)
  tools/              one file per interaction: select, draw, build
  features/
    cutlist.js        part collection, sheet and board optimisation
    schedule.js       door/window/room schedules and wall takeoff
    estimate.js       quantity and cost estimate
    export.js         SVG and CSV generation (pure strings, no DOM)
    templates.js      starter projects
  ui/                 DOM helpers, toolbar, panels, dialogs
  app.js              controller wiring document, tools, input and panels
test/                 node:test suites plus the browser smoke test
```

Everything under `src/core` and `src/features` is DOM-free and unit tested; the
DOM only appears in `src/ui`, `src/render` and `src/app.js`.

## Notes and limits

- Drawings are 2D. There is no 3D model, no roof framing calculator and no
  structural engineering.
- The estimate is a rough order of magnitude built from default unit prices.
  It is a starting point for a conversation with a supplier, not a quote.
- Storystick does not check building codes. Confirm setbacks, permits, egress,
  headers and whether a wall is load-bearing before you cut anything.
- The bundled typefaces are SIL OFL 1.1 — free to use, embed and ship. The
  licence files stay alongside them in `brand/fonts/`.
- The brand package's own README flags trademark screening as unfinished: a
  USPTO search in classes 9 and 42 has not been run. Worth doing before the
  name goes anywhere public.
