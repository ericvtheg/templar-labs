import type { ShowColors } from "./identity";

interface World {
  name: string;
  type: string;
  description: string;
}
interface Profile {
  name: string;
  inspiration: string;
  description: string;
  colors: ShowColors;
  impact: number;
  velocity: number;
  worlds: readonly World[];
}
export const profiles = [
  {
    name: "Excision",
    inspiration: "EXCISION-INSPIRED",
    description: "Creatures. Machines. Impact.",
    colors: ["#ed3e1c", "#ffa51f", "#fff2db"],
    impact: 95,
    velocity: 85,
    worlds: [
      { name: "Sentinel", type: "MECH / AWAKENING", description: "The machine wakes up" },
      { name: "Ravager", type: "CREATURE / BREACH", description: "Something is coming through" },
      {
        name: "Dreadnought",
        type: "WARSHIP / INVASION",
        description: "Arrival on a different scale",
      },
    ],
  },
  {
    name: "Abstract",
    inspiration: "PURE LIGHT / ORIGINAL",
    description: "Geometry. Lasers. Velocity.",
    colors: ["#00d9ff", "#ff287e", "#edfcff"],
    impact: 90,
    velocity: 95,
    worlds: [
      { name: "Laser cathedral", type: "FANS / SWEEPS", description: "A room built from light" },
      { name: "Hyperspace", type: "TUNNEL / ACCELERATION", description: "Straight into the drop" },
      { name: "Prism riot", type: "SHARDS / SYMMETRY", description: "Light that hits back" },
    ],
  },
  {
    name: "Eric Prydz",
    inspiration: "PRYDZ-INSPIRED",
    description: "Holograms. Scale. Illusion.",
    colors: ["#68e9ff", "#5772ff", "#eeffff"],
    impact: 65,
    velocity: 55,
    worlds: [
      { name: "Leviathan", type: "HOLOGRAM / LIFEFORM", description: "Life beyond the glass" },
      { name: "Chronosphere", type: "ORBIT / DEPTH", description: "Time in three dimensions" },
      { name: "Monument", type: "ARCHITECTURE / SCALE", description: "An impossible room" },
    ],
  },
  {
    name: "deadmau5",
    inspiration: "DEADMAU5-INSPIRED",
    description: "LED architecture. Precision.",
    colors: ["#ff351a", "#6f50ff", "#fff0dc"],
    impact: 80,
    velocity: 70,
    worlds: [
      { name: "The construct", type: "LED / ROTATION", description: "Light has a structure" },
      {
        name: "Disassembly",
        type: "PANELS / REFORMATION",
        description: "Break it. Build it again.",
      },
      { name: "Infinite grid", type: "VOXELS / CHASE", description: "Every surface is a screen" },
    ],
  },
] as const satisfies readonly Profile[];
