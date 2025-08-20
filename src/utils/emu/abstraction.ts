import {
  getLDPlayerInstances,
  getLDPlayerPath,
  launchInstance as ldLaunchInstance,
  isInstanceRunning as ldIsInstanceRunning,
  stopInstance as ldStopInstance,
  createBackup as ldCreateBackup,
  createCopy as ldCreateCopy,
  renameInstance as ldRenameInstance,
  printInstancesList as printLDInstancesList,
  rebootAllLDPlayerInstances,
  type LDPlayerInstance,
} from "@/utils/emu/ld";
import {
  getMuMuInstances,
  getMuMuPath,
  launchMuMuInstance,
  isMuMuInstanceRunning,
  stopMuMuInstance,
  createMuMuBackup,
  importMuMuBackup,
  renameMuMuInstance,
  printMuMuInstancesList,
  optimizeMuMuInstance,
  rebootAllMuMuInstances,
  type MuMuInstance,
} from "@/utils/emu/mumu";
import type { EmulatorType } from "@/types/tool";
import type {
  OptimizeConfiguration,
  OptimizeResult,
} from "@/tools/optimize-devices/types";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface EmulatorInstance {
  index: number;
  name: string;
  status: string;
}

export interface EmulatorService {
  getPath(): Promise<string | null>;
  getInstances(): Promise<EmulatorInstance[]>;
  launchInstance(instanceIndex: number): Promise<void>;
  stopInstance(instanceIndex: number): Promise<void>;
  isInstanceRunning(instanceIndex: number): Promise<boolean>;
  printInstancesList(instances: EmulatorInstance[]): void;
  createBackup(instanceIndex: number, backupDir: string): Promise<string>;
  renameInstance(instanceIndex: number, newName: string): Promise<void>;
  optimizeInstance(
    instanceIndex: number,
    config: OptimizeConfiguration
  ): Promise<OptimizeResult>;
  rebootAllInstances(): Promise<void>;
  cloneInstance?(sourceIndex: number): Promise<void>;
  importBackup?(backupPath: string, count?: number): Promise<void>;
}

class LDPlayerService implements EmulatorService {
  private ldPath: string | null = null;

  async getPath(): Promise<string | null> {
    this.ldPath = await getLDPlayerPath();
    return this.ldPath;
  }

  async getInstances(): Promise<EmulatorInstance[]> {
    if (!this.ldPath) throw new Error("LDPlayer path not set");
    const instances = await getLDPlayerInstances(this.ldPath);
    return instances.map((instance) => ({
      index: instance.index,
      name: instance.name,
      status: instance.status,
    }));
  }

  async launchInstance(instanceIndex: number): Promise<void> {
    if (!this.ldPath) throw new Error("LDPlayer path not set");
    await ldLaunchInstance(this.ldPath, instanceIndex);
  }

  async stopInstance(instanceIndex: number): Promise<void> {
    if (!this.ldPath) throw new Error("LDPlayer path not set");
    await ldStopInstance(this.ldPath, instanceIndex);
  }

  async isInstanceRunning(instanceIndex: number): Promise<boolean> {
    if (!this.ldPath) throw new Error("LDPlayer path not set");
    return await ldIsInstanceRunning(this.ldPath, instanceIndex);
  }

  async createBackup(
    instanceIndex: number,
    backupDir: string
  ): Promise<string> {
    if (!this.ldPath) throw new Error("LDPlayer path not set");
    const backupPath = `${backupDir}\\instance_${instanceIndex}_backup_${Date.now()}.ldbk`;
    await ldCreateBackup(this.ldPath, instanceIndex, backupPath);
    return backupPath;
  }

  async optimizeInstance(
    instanceIndex: number,
    config: OptimizeConfiguration
  ): Promise<OptimizeResult> {
    if (!this.ldPath) throw new Error("LDPlayer path not set");

    const instances = await this.getInstances();
    const instance = instances.find((i) => i.index === instanceIndex);

    const result: OptimizeResult = {
      instanceName: instance?.name || `Instance ${instanceIndex}`,
      instanceIndex,
      isSuccess: false,
      wasRunning: instance?.status === "Running",
    };

    try {
      if (instance?.status === "Running") {
        await this.stopInstance(instanceIndex);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      await execAsync(
        `"${this.ldPath}" modify --index ${instanceIndex} --resolution ${config.resolution} --cpu ${config.cores} --memory ${config.ram}`
      );

      result.isSuccess = true;
      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : "Unknown error";
      return result;
    }
  }

  async rebootAllInstances(): Promise<void> {
    await rebootAllLDPlayerInstances();
  }

  async cloneInstance(sourceIndex: number): Promise<void> {
    if (!this.ldPath) throw new Error("LDPlayer path not set");
    const tempName = `temp_clone_${Date.now()}`;
    await ldCreateCopy(this.ldPath, sourceIndex, tempName);
  }

  async renameInstance(instanceIndex: number, newName: string): Promise<void> {
    if (!this.ldPath) throw new Error("LDPlayer path not set");
    await ldRenameInstance(this.ldPath, instanceIndex, newName);
  }

  printInstancesList(instances: EmulatorInstance[]): void {
    const ldInstances: LDPlayerInstance[] = instances.map((instance) => ({
      index: instance.index,
      name: instance.name,
      status: instance.status,
    }));
    printLDInstancesList(ldInstances);
  }
}

class MuMuService implements EmulatorService {
  private mumuPath: string | null = null;

  async getPath(): Promise<string | null> {
    this.mumuPath = await getMuMuPath();
    return this.mumuPath;
  }

  async getInstances(): Promise<EmulatorInstance[]> {
    const instances = await getMuMuInstances();
    return instances.map((instance) => ({
      index: instance.index,
      name: instance.name,
      status: instance.status,
    }));
  }

  async launchInstance(instanceIndex: number): Promise<void> {
    await launchMuMuInstance(instanceIndex);
  }

  async stopInstance(instanceIndex: number): Promise<void> {
    await stopMuMuInstance(instanceIndex);
  }

  async isInstanceRunning(instanceIndex: number): Promise<boolean> {
    return await isMuMuInstanceRunning(instanceIndex);
  }

  async createBackup(
    instanceIndex: number,
    backupDir: string
  ): Promise<string> {
    return await createMuMuBackup(instanceIndex, backupDir);
  }

  async optimizeInstance(
    instanceIndex: number,
    config: OptimizeConfiguration
  ): Promise<OptimizeResult> {
    const instances = await this.getInstances();
    const instance = instances.find((i) => i.index === instanceIndex);

    const result: OptimizeResult = {
      instanceName: instance?.name || `Instance ${instanceIndex}`,
      instanceIndex,
      isSuccess: false,
      wasRunning: instance?.status === "Running",
    };

    try {
      if (instance?.status === "Running") {
        await this.stopInstance(instanceIndex);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      await optimizeMuMuInstance(instanceIndex, config);
      result.isSuccess = true;
      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : "Unknown error";
      return result;
    }
  }

  async rebootAllInstances(): Promise<void> {
    await rebootAllMuMuInstances();
  }

  async importBackup(backupPath: string, count: number = 1): Promise<void> {
    await importMuMuBackup(backupPath, count);
  }

  async renameInstance(instanceIndex: number, newName: string): Promise<void> {
    await renameMuMuInstance(instanceIndex, newName);
  }

  printInstancesList(instances: EmulatorInstance[]): void {
    const mumuInstances: MuMuInstance[] = instances.map((instance) => ({
      index: instance.index,
      name: instance.name,
      status: instance.status,
      isProcessStarted: instance.status === "Running",
      isAndroidStarted: false,
    }));
    printMuMuInstancesList(mumuInstances);
  }
}

export function getEmulatorService(
  emulatorType: EmulatorType
): EmulatorService {
  switch (emulatorType) {
    case "ldplayer":
      return new LDPlayerService();
    case "mumu":
      return new MuMuService();
    default:
      throw new Error(`Unsupported emulator type: ${emulatorType}`);
  }
}

export async function rebootAllEmulatorInstances(
  emulatorType: EmulatorType
): Promise<void> {
  const emulatorService = getEmulatorService(emulatorType);
  await emulatorService.rebootAllInstances();
}
