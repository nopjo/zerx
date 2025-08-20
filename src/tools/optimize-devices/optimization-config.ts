import { Logger } from "@/utils/logger";
import type { OptimizeConfiguration } from "./types";
import { select } from "@/utils/prompts";

const coreOptions = [
  { value: 1, label: "1 Core - Ultra Light" },
  { value: 2, label: "2 Cores - Light" },
  { value: 3, label: "3 Cores - Moderate" },
  { value: 4, label: "4 Cores - Balanced" },
  { value: 6, label: "6 Cores - High Performance" },
  { value: 8, label: "8 Cores - Maximum Performance" },
];

const ramOptions = [
  {
    value: 1536,
    label:
      "1536 MB (1.5 GB) - Testing Only (Not recommended for multiple Roblox)",
  },
  { value: 2048, label: "2048 MB (2 GB) - Light (1 Roblox instances max)" },
  { value: 3072, label: "3072 MB (3 GB) - Basic (2 Roblox instances)" },
  { value: 4096, label: "4096 MB (4 GB) - Recommended (2-3 Roblox instances)" },
  {
    value: 6144,
    label: "6144 MB (6 GB) - High Performance (3-4 Roblox instances)",
  },
  { value: 8192, label: "8192 MB (8 GB) - Maximum (5+ Roblox instances)" },
];

const resolutionOptions = [
  {
    value: "320,180,60",
    label: "320x180 @ 60 DPI - Ultra Performance (Recommended)",
  },
  { value: "400,240,60", label: "400x240 @ 60 DPI - High Performance" },
  { value: "480,270,70", label: "480x270 @ 70 DPI - Balanced" },
  { value: "540,300,80", label: "540x300 @ 80 DPI - Good Quality" },
  { value: "640,360,90", label: "640x360 @ 90 DPI - High Quality" },
  { value: "720,405,100", label: "720x405 @ 100 DPI - Premium" },
  { value: "800,450,100", label: "800x450 @ 100 DPI - Ultra Quality" },
  { value: "960,540,110", label: "960x540 @ 110 DPI - Maximum Quality" },
  { value: "1280,720,120", label: "1280x720 @ 120 DPI - Full HD" },
];

export async function getCustomConfiguration(): Promise<OptimizeConfiguration | null> {
  Logger.info("[>] Device Optimization Configuration", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const cores = await select({
    message: "Select CPU cores:",
    options: coreOptions,
  });

  if (!cores || typeof cores === "symbol") {
    return null;
  }

  const ram = await select({
    message: "Select RAM allocation:",
    options: ramOptions,
  });

  if (!ram || typeof ram === "symbol") {
    return null;
  }

  const resolution = await select({
    message: "Select resolution:",
    options: resolutionOptions,
  });

  if (!resolution || typeof resolution === "symbol") {
    return null;
  }

  return {
    cores: Number(cores),
    ram: Number(ram),
    resolution: String(resolution),
  };
}

export function displayConfiguration(config: OptimizeConfiguration): void {
  Logger.warning("[>] Selected Configuration:", { spaceBefore: true });
  Logger.muted(`CPU Cores: ${config.cores}`, { indent: 1 });
  Logger.muted(`RAM: ${config.ram} MB`, { indent: 1 });
  Logger.muted(
    `Resolution: ${config.resolution.replace(/,/g, "x").replace(/x(\d+)$/, " @ $1 DPI")}`,
    { indent: 1 }
  );
}

export function displayOptimizationNotes(): void {
  Logger.warning("[!] Important Notes:", { spaceBefore: true });
  Logger.muted("• Each Roblox instance uses ~0.7 CPU cores and ~1GB RAM", {
    indent: 1,
  });
  Logger.muted("• 4GB+ RAM recommended for running 3+ Roblox instances", {
    indent: 1,
  });
  Logger.muted("• Performance is highly game dependent", { indent: 1 });
  Logger.muted("• Complex games require more resources", { indent: 1 });
  Logger.muted("• Monitor system resources during use", { indent: 1 });
}
