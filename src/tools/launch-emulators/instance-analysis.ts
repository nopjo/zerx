import colors from "picocolors";
import { printInstancesList, type LDPlayerInstance } from "@/utils/ld";
import { Logger } from "@/utils/logger";

export interface InstanceAnalysis {
  allInstances: LDPlayerInstance[];
  stoppedInstances: LDPlayerInstance[];
  runningInstances: LDPlayerInstance[];
  needsLaunch: boolean;
}

export function analyzeInstances(
  instances: LDPlayerInstance[]
): InstanceAnalysis {
  const stoppedInstances = instances.filter(
    (instance) => instance.status === "Stopped"
  );
  const runningInstances = instances.filter(
    (instance) => instance.status === "Running"
  );

  return {
    allInstances: instances,
    stoppedInstances,
    runningInstances,
    needsLaunch: stoppedInstances.length > 0,
  };
}

export function displayInstanceAnalysis(analysis: InstanceAnalysis): void {
  printInstancesList(analysis.allInstances);

  if (!analysis.needsLaunch) {
    Logger.success("All instances are already running!", { spaceBefore: true });
    return;
  }

  Logger.warning(
    `[!] Found ${colors.bold(
      analysis.stoppedInstances.length.toString()
    )} stopped instance(s)`,
    { spaceBefore: true }
  );

  Logger.success(
    `[+] Found ${colors.bold(
      analysis.runningInstances.length.toString()
    )} running instance(s)`
  );
}
