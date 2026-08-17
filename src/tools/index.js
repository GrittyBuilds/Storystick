import { SelectTool } from './select.js';
import { WallTool, DoorTool, WindowTool, DimensionTool } from './build.js';
import {
  LineTool,
  RectTool,
  CircleTool,
  ArcTool,
  PolylineTool,
  RoomTool,
  PartTool,
  TextTool,
  MeasureTool,
} from './draw.js';
import {
  RoofTool,
  FootingTool,
  PadFootingTool,
  SlabTool,
  BeamTool,
  FixtureTool,
} from './systems.js';

const icon = (paths) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths
    .map((d) => `<path d="${d}"/>`)
    .join('')}</svg>`;

export const TOOL_GROUPS = [
  {
    name: 'Modify',
    tools: [
      { Tool: SelectTool, key: 'v', icon: icon(['M5 3l14 8-6 1.6L10.5 19z']) },
    ],
  },
  {
    name: 'Structure',
    tools: [
      { Tool: WallTool, key: 'w', icon: icon(['M3 8h18v3H3zM3 14h18v3H3z']) },
      { Tool: DoorTool, key: 'd', icon: icon(['M4 20V4h9v16zM13 20a9 9 0 0 0-9-9']) },
      { Tool: WindowTool, key: 'n', icon: icon(['M3 6h18v12H3zM12 6v12M3 12h18']) },
      { Tool: RoomTool, key: 'r', icon: icon(['M4 5h16v14H4zM4 12h9v7']) },
    ],
  },
  {
    name: 'Shell',
    tools: [
      { Tool: RoofTool, key: 'f', icon: icon(['M2 13L12 5l10 8M5 13v7h14v-7']) },
      { Tool: FootingTool, key: 'g', icon: icon(['M3 10h18M3 14h18M6 10v4M18 10v4']) },
      { Tool: PadFootingTool, key: 'j', icon: icon(['M4 4h16v16H4zM9 9h6v6H9z']) },
      { Tool: SlabTool, key: 'h', icon: icon(['M3 7h18v10H3zM3 7l4-4h14l-4 4M21 7v10l-4 4']) },
      { Tool: BeamTool, key: 'i', icon: icon(['M2 9h20v6H2zM6 9v6M18 9v6']) },
    ],
  },
  {
    name: 'Systems',
    tools: [
      { Tool: FixtureTool, key: 'q', icon: icon(['M12 3a9 9 0 1 0 .01 0M3 12h18M9 3v18']) },
    ],
  },
  {
    name: 'Draw',
    tools: [
      { Tool: LineTool, key: 'l', icon: icon(['M4 20L20 4']) },
      { Tool: RectTool, key: 'b', icon: icon(['M4 6h16v12H4z']) },
      { Tool: PolylineTool, key: 'p', icon: icon(['M3 18l5-9 5 5 8-11']) },
      { Tool: CircleTool, key: 'c', icon: icon(['M12 3a9 9 0 1 0 .01 0']) },
      { Tool: ArcTool, key: 'a', icon: icon(['M3 19a12 12 0 0 1 18-8']) },
    ],
  },
  {
    name: 'Woodworking',
    tools: [{ Tool: PartTool, key: 'k', icon: icon(['M3 7h18v10H3zM7 7v10M17 7v10']) }],
  },
  {
    name: 'Annotate',
    tools: [
      { Tool: DimensionTool, key: 'm', icon: icon(['M3 12h18M3 8v8M21 8v8']) },
      { Tool: TextTool, key: 't', icon: icon(['M5 5h14M12 5v14M9 19h6']) },
      { Tool: MeasureTool, key: 'e', icon: icon(['M2 15L15 2l7 7L9 22zM7 10l2 2M11 6l2 2M12 15l2 2']) },
    ],
  },
];

export const TOOL_ENTRIES = TOOL_GROUPS.flatMap((group) =>
  group.tools.map((t) => ({ ...t, group: group.name }))
);

export const TOOL_CLASSES = TOOL_ENTRIES.map((t) => t.Tool);

export function toolEntryById(id) {
  return TOOL_ENTRIES.find((t) => t.Tool.id === id) || null;
}

export function toolByShortcut(key) {
  return TOOL_ENTRIES.find((t) => t.key === key) || null;
}
