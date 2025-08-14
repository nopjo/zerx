import colors from "picocolors";
import { Logger } from "@/utils/logger";
import type { LDPlayerInstance } from "@/utils/ld";

export function displayInstances(instances: LDPlayerInstance[]): void {
  Logger.info("[#] Available LDPlayer Instances:", { spaceBefore: true });
  for (const instance of instances) {
    const statusColor =
      instance.status === "Running" ? colors.green : colors.gray;
    Logger.normal(
      `${colors.cyan(instance.index.toString())}. ${colors.white(
        instance.name
      )} ${statusColor(`[${instance.status}]`)}`,
      { indent: 1 }
    );
  }
  Logger.space();
}

export function displayRunningInstancesNotice(
  runningInstances: LDPlayerInstance[]
): void {
  if (runningInstances.length > 0) {
    Logger.warning("[!] Running Instances Notice:", { spaceBefore: true });
    Logger.muted(
      `${runningInstances.length} instance(s) are currently running`,
      { indent: 1 }
    );
    Logger.muted("These will be temporarily stopped to apply settings", {
      indent: 1,
    });
  }
}
