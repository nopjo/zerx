import { Logger } from "@/utils/logger";
import type { LaunchResult, LaunchSummary } from "./types";

export function displayLaunchResults(results: LaunchResult[]): LaunchSummary {
  Logger.title("[^] Launch Results:");

  const successfulLaunches = results.filter((result) => result.success);
  const failedLaunches = results.filter((result) => !result.success);

  if (successfulLaunches.length > 0) {
    Logger.success("[+] Successfully launched:");
    for (const result of successfulLaunches) {
      Logger.success(`• ${result.instance.name}`, { indent: 1 });
    }
  }

  if (failedLaunches.length > 0) {
    Logger.error("[X] Failed to launch:", { spaceBefore: true });
    for (const result of failedLaunches) {
      Logger.error(`• ${result.instance.name}: ${result.error}`, { indent: 1 });
    }
  }

  return {
    total: results.length,
    successful: successfulLaunches.length,
    failed: failedLaunches.length,
    results,
  };
}
