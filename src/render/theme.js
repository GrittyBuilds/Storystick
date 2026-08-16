// Canvas palettes. Storystick ships two drawing modes, drawn on their own
// terms rather than one inverted into the other:
//
//   blueprint — the default. Dark canvas, chalk geometry, cedar on selection.
//   paper     — for printing, sharing, and a phone screen in direct sun.
//
// Every value here traces back to brand/tokens.json. Nothing outside this file
// should contain a raw drawing colour.

export const TOKEN = {
  blueprint: '#0F2338',
  ink: '#0A1826',
  canvas: '#0B1A2B',
  panel: '#132B44',
  panelLine: '#23405E',
  blue: '#1B5FA6',
  sky: '#3E86CE',
  chalk: '#A9C7E5',
  cedar: '#D98235',
  ember: '#EFA860',
  cedarDeep: '#9E5813',
  vellum: '#F7F4ED',
  paper: '#FFFFFF',
  graphite: '#46525E',
  slate: '#65717C',
  slate40: '#8A97A3',
  mist: '#E4E9EE',
  green: '#1F9D6B',
  greenDeep: '#177C54',
  red: '#D14343',
  redDeep: '#B93636',
};

/** Brand line weights, in millimetres of plotted line. */
export const LINE_WEIGHT_MM = {
  sectionCut: 0.7,
  outline: 0.5,
  surface: 0.35,
  dimension: 0.25,
  construction: 0.18,
};

const PX_PER_MM = 96 / 25.4;

/** Millimetres of plotted line to screen pixels. */
export const mmToPx = (mm) => mm * PX_PER_MM;

export const FONT_SANS = "'Inter', -apple-system, 'Segoe UI', sans-serif";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
export const FONT_BRAND = "'Space Grotesk', 'Inter', sans-serif";

export const PALETTES = {
  blueprint: {
    id: 'blueprint',
    label: 'Blueprint',
    background: TOKEN.canvas,
    gridMinor: 'rgba(169,199,229,0.06)',
    gridMajor: 'rgba(169,199,229,0.12)',
    axis: 'rgba(169,199,229,0.22)',
    geometry: TOKEN.chalk,
    wallFill: 'rgba(169,199,229,0.20)',
    wallFillExisting: 'rgba(169,199,229,0.09)',
    roomFill: 'rgba(62,134,206,0.10)',
    partFill: 'rgba(169,199,229,0.09)',
    dimensionLine: TOKEN.sky,
    dimensionText: TOKEN.chalk,
    dimensionDash: [3, 2],
    selection: TOKEN.cedar,
    hover: TOKEN.sky,
    preview: TOKEN.sky,
    snap: TOKEN.green,
    error: TOKEN.red,
    marqueeWindow: TOKEN.sky,
    marqueeWindowFill: 'rgba(62,134,206,0.12)',
    marqueeCrossing: TOKEN.green,
    marqueeCrossingFill: 'rgba(31,157,107,0.12)',
    handleFill: TOKEN.canvas,
    labelHalo: 'rgba(11,26,43,0.86)',
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    background: TOKEN.vellum,
    gridMinor: 'rgba(15,35,56,0.06)',
    gridMajor: 'rgba(15,35,56,0.12)',
    axis: 'rgba(15,35,56,0.22)',
    geometry: TOKEN.blueprint,
    wallFill: TOKEN.mist,
    wallFillExisting: 'rgba(228,233,238,0.55)',
    roomFill: 'rgba(27,95,166,0.06)',
    partFill: 'rgba(27,95,166,0.08)',
    dimensionLine: TOKEN.blue,
    dimensionText: TOKEN.blueprint,
    dimensionDash: null,
    selection: TOKEN.cedar,
    hover: TOKEN.blue,
    preview: TOKEN.blue,
    snap: TOKEN.greenDeep,
    error: TOKEN.redDeep,
    marqueeWindow: TOKEN.blue,
    marqueeWindowFill: 'rgba(27,95,166,0.10)',
    marqueeCrossing: TOKEN.greenDeep,
    marqueeCrossingFill: 'rgba(23,124,84,0.10)',
    handleFill: TOKEN.paper,
    labelHalo: 'rgba(247,244,237,0.88)',
  },
};

export const CANVAS_MODES = Object.keys(PALETTES);

export function palette(mode) {
  return PALETTES[mode] || PALETTES.blueprint;
}

/**
 * A layer's stroke colour for the active mode. Layers carry a paper colour and
 * an optional blueprint colour; anything without one falls back to chalk, which
 * is the brand's geometry colour on the dark canvas.
 */
export function layerColor(layer, mode) {
  if (mode === 'blueprint') return layer.colorDark || TOKEN.chalk;
  return layer.color || TOKEN.blueprint;
}

/**
 * Renovation drawing convention: existing work reads back, demolition reads
 * dashed and red, new work carries the full section-cut weight. Colour is never
 * the only signal — demo also changes dash pattern and loses its poché fill.
 */
export const WALL_STATUS_STYLE = {
  existing: { paper: TOKEN.slate40, blueprint: '#5E7A97', dash: null },
  demo: { paper: TOKEN.redDeep, blueprint: TOKEN.red, dash: [8, 5] },
};

export function wallStatusColor(status, mode) {
  const style = WALL_STATUS_STYLE[status];
  if (!style) return null;
  return { color: mode === 'blueprint' ? style.blueprint : style.paper, dash: style.dash };
}
