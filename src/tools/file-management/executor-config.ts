import type { ExecutorInfo } from "./types";

export const EXECUTORS: ExecutorInfo[] = [
  {
    name: "Delta",
    path: "/storage/emulated/0/Delta",
    description: "Delta (https://deltaexploits.gg)",
  },
  {
    name: "CodeX",
    path: "/storage/emulated/0/Codex",
    description: "CodeX (https://codex.lol/)",
  },
  {
    name: "Cryptic",
    path: "/storage/emulated/0/Cryptic",
    description: "Cryptic (https://getcryptic.net/)",
  },
  {
    name: "VegaX",
    path: "/storage/emulated/0/VegaX",
    description: "VegaX (https://vegax.gg/)",
  },
  {
    name: "Ronix",
    path: "/storage/emulated/0/RonixExploit",
    description: "Ronix (https://ronixstudios.com/)",
  },
  {
    name: "Krnl",
    path: "/storage/emulated/0/krnl",
    description: "Krnl (https://krnl.cat/)",
  },
];

export function getExecutorByName(name: string): ExecutorInfo | undefined {
  return EXECUTORS.find((e) => e.name.toLowerCase() === name.toLowerCase());
}
