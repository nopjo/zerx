import colors from "picocolors";
import { printInstancesList, type LDPlayerInstance } from "@/utils/emu/ld";
import { Logger } from "@/utils/logger";

export interface InstanceAnalysis {
  allInstances: LDPlayerInstance[];
  runningInstances: LDPlayerInstance[];
  stoppedInstances: LDPlayerInstance[];
  needsShutdown: boolean;
}

export function analyzeInstances(
  instances: LDPlayerInstance[]
): InstanceAnalysis {
  const runningInstances = instances.filter(
    (instance) => instance.status === "Running"
  );
  const stoppedInstances = instances.filter(
    (instance) => instance.status === "Stopped"
  );

  return {
    allInstances: instances,
    runningInstances,
    stoppedInstances,
    needsShutdown: runningInstances.length > 0,
  };
}

export function displayInstanceAnalysis(analysis: InstanceAnalysis): void {
  printInstancesList(analysis.allInstances);

  Logger.warning(
    `[!] Found ${colors.bold(
      analysis.runningInstances.length.toString()
    )} running instance(s)`,
    { spaceBefore: true }
  );

  Logger.success(
    `[+] Found ${colors.bold(
      analysis.stoppedInstances.length.toString()
    )} stopped instance(s)`
  );
}
