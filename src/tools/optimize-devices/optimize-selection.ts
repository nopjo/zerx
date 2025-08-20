import type { LDPlayerInstance } from "@/utils/emu/ld";
import type { OptimizeMode } from "./types";
import { select } from "@/utils/prompts";

export async function getOptimizeMode(
  instances: LDPlayerInstance[],
  runningInstances: LDPlayerInstance[]
): Promise<OptimizeMode | null> {
  const optimizeMode = await select({
    message: "Which instances should be optimized?",
    options: [
      {
        value: "all",
        label: `[*] Optimize all instances (${instances.length} instances)`,
      },
      {
        value: "running-only",
        label: `[+] Only currently running instances (${runningInstances.length} instances)`,
      },
      {
        value: "stopped-only",
        label: `[-] Only stopped instances (${
          instances.length - runningInstances.length
        } instances)`,
      },
    ],
  });

  if (!optimizeMode || typeof optimizeMode === "symbol") {
    return null;
  }

  return optimizeMode as OptimizeMode;
}

export function getInstancesToOptimize(
  mode: OptimizeMode,
  instances: LDPlayerInstance[],
  runningInstances: LDPlayerInstance[]
): LDPlayerInstance[] {
  switch (mode) {
    case "all":
      return instances;
    case "running-only":
      return runningInstances;
    case "stopped-only":
      return instances.filter((i) => i.status !== "Running");
    default:
      return [];
  }
}
