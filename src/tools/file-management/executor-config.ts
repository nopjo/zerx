import type { ExecutorInfo } from "./types";

export const EXECUTORS: ExecutorInfo[] = [
  {
    name: "Delta",
    path: "/storage/emulated/0/Delta",
    description: "Delta (https://deltaexploits.gg)",
  },
  {
    name: "Krnl",
    path: "/storage/emulated/0/krnl",
    description: "Krnl (https://krnl.cat/)",
  },
  {
    name: "CodeX",
    path: "/storage/emulated/0/Codex",
    description: "CodeX (https://codex.lol/)",
  },
  {
    name: "Cryptic",
    path: "/storage/emulated/0/Cryptic",
    description: "CodeX (https://getcryptic.net/)",
  },
  {
    name: "VegaX",
    path: "/storage/emulated/0/VegaX",
    description: "VegaX (https://vegax.gg/)",
  },
];

export function getExecutorByName(name: string): ExecutorInfo | undefined {
  return EXECUTORS.find((e) => e.name.toLowerCase() === name.toLowerCase());
}
