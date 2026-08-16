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
npm test              # 185 unit tests — units, geometry, documents, 3D, codes, structural
npm run smoke         # 22 end-to-end browser checks (needs the optional playwright dep)
npm run smoke:mobile  # 9 checks on a phone and tablet viewport
```

### Mobile and desktop

The same code runs everywhere. Under 860 px the shell reflows: the action row
collapses into a menu, the tool palette becomes a bottom scroller, and the side
panels become a bottom sheet. One finger draws, two fingers pan and pinch, long
press selects. Touch input is offset above the fingertip with a crosshair on the
true target, because a fingertip covers most of a stud bay at working zoom.

It installs as a PWA and works offline. For a real desktop app:

```bash
npm run desktop:install   # fetches Electron (not vendored)
npm run desktop
```

That adds native open/save dialogs, an application menu and `.storystick` file
association, with context isolation on, node integration off and a strict CSP.

## 3D

Any sheet extrudes into a solid model: walls rise to the project wall height and
keep their status material, doors and windows become real voids with headers
above and sills below, windows get glazing, rooms become floor slabs, and the
footprint generates a gable, hip or flat roof at a pitch and overhang you set.
Woodworking parts become boards of their own thickness. Orbit with a drag, pan
with two fingers or a right-drag, zoom with the wheel or a pinch, and save the
view as a PNG.

The renderer is hand-written WebGL — about 1,250 lines against roughly 750 KB
for the smallest usable three.js build, and it keeps the app's no-build-step
property. The geometry layer is DOM-free and unit tested, including ray-cast
solid-membership tests proving a doorway is genuinely a void.

The massing is honest rather than photographic. The roof is generated from the
bounding box of the walls, so an L-shaped plan gets a rectangular roof floating
over the notch; wall corners are handled by overlap rather than mitring.

## Code checking

**Storystick ships no Michigan code values.** Not one could be verified against
a primary source, so rather than hardcode numbers that look authoritative, the
app catalogues the *requirements* — 26 of them, each with its label, unit and
the section to look it up in — and leaves every value empty until you confirm
it in Code settings against your own code book. A confirmed value records where
it came from and when, and travels with the project file.

Checks come in two kinds, and the difference is the whole point:

- **Drawing checks** are answerable from the plan alone and give real answers
  with no code data at all. A sleeping room with no door and no window is a
  problem in every edition of every code; an opening taller than its wall is a
  geometric fact.
- **Threshold checks** need a number from the code. They measure the drawing,
  name the requirement and the section, and then either compare against a value
  you have confirmed — or report **needs checking** with the measurement and
  where to look. They never guess.

Findings have four outcomes: *does not meet*, *needs checking*, *meets*, *not
applicable*. A check that crashes becomes *needs checking*, never a silent pass.
Where the drawing genuinely cannot answer — a window's net clear opening depends
on the unit installed, not on the rough opening — Storystick says so and gives
the bound rather than a verdict.

Every finding names what to do about it, and can jump you to the thing it is
about.

## Structural checking

Allowable-stress arithmetic on a simply supported, uniformly loaded member:
bending, shear, live and total deflection, and bearing, each reported with its
margin and which one governs. It also sizes the shallowest member that works and
generates a span table you can compare against the published one.

The mechanics are edition-independent and verified — the section-property
formulas reproduce the published values for a 2x10 (S = 21.39 in³, I = 98.93
in⁴), and each span solver exactly inverts its own stress check. The *reference
design values* are not: Fb, Fv, Fc⊥ and E are species-, grade- and
edition-specific, so they ship empty and you enter them from the NDS Supplement,
your grading agency, or the grade stamp on the material. Until you do, the tool
will not calculate.

This is a design aid, not engineering. It covers one simply supported member and
nothing else: no point loads, no cantilevers, no continuous spans, no notches or
holes, and nothing about the load path below. The assumptions are printed with
every result.

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
  model3d/
    mesh.js           mesh primitives, ear clipping, polygon extrusion
    build.js          plan to solids: walls, openings, slabs, roofs, parts
    mat4.js           matrix and vector maths
    viewer.js         WebGL viewer, orbit camera, two-pass transparency
  codes/
    context.js        what the drawing measurably contains, and what it cannot
    engine.js         rule evaluation: pass / fail / needs checking / n-a
    jurisdiction.js   code requirements as data, with provenance per value
    rules.js          drawing rules and threshold rules
  engineering/
    sections.js       dressed lumber sizes and NDS adjustment factors
    beam.js           simple-span mechanics and the span solvers
    species.js        reference design values (empty until confirmed)
    analysis.js       limit-state checks, member sizing, span tables
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
- The code check is a design aid, not a plan review and not a code
  determination. It checks what a plan can show; it cannot see construction,
  materials, systems or workmanship. Your building official decides compliance.
- Only construction-code items are checked. Zoning setbacks, floodplain,
  historic districts, soil erosion and local fire requirements are administered
  separately and are not covered.
- The structural check is arithmetic on values you supply, for one simply
  supported uniformly loaded member. Anything structural that matters should be
  reviewed by a licensed engineer.
- Which edition of the Michigan Residential Code is currently in force could not
  be confirmed, and it has been the subject of litigation. Confirm it with the
  Bureau of Construction Codes or your building official before relying on any
  section number.
- The bundled typefaces are SIL OFL 1.1 — free to use, embed and ship. The
  licence files stay alongside them in `brand/fonts/`.
- The brand package's own README flags trademark screening as unfinished: a
  USPTO search in classes 9 and 42 has not been run. Worth doing before the
  name goes anywhere public.
