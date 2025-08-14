import { Logger } from "@/utils/logger";
import type { OptimizeResult, OptimizeSummary } from "./types";

export function displayOptimizeResults(
  results: OptimizeResult[]
): OptimizeSummary {
  Logger.title("[*] Optimization Results:");

  const successfulOptimizations = results.filter((result) => result.isSuccess);
  const previouslyRunning = results.filter((r) => r.wasRunning && r.isSuccess);

  for (const result of results) {
    if (result.isSuccess) {
      const runningNote = result.wasRunning ? " (was restarted)" : "";
      Logger.success(
        `[+] ${result.instanceName} - Optimized with custom settings${runningNote}`,
        { indent: 1 }
      );
    } else {
      Logger.error(
        `[X] ${result.instanceName} - ${result.error || "Optimization failed"}`,
        { indent: 1 }
      );
    }
  }

  return {
    total: results.length,
    successful: successfulOptimizations.length,
    failed: results.length - successfulOptimizations.length,
    results,
    previouslyRunning,
  };
}
