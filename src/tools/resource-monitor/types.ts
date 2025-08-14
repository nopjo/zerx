export interface RobloxInstance {
  packageName: string;
  deviceId: string;
}

export interface ProcessInfo {
  pid: string;
  packageName: string;
  deviceId: string;
  deviceModel?: string;
  ramUsageMB: number;
  cpuPercent: number;
  isRunning: boolean;
}

export interface DeviceResourceSummary {
  deviceId: string;
  deviceModel?: string;
  totalRamMB: number;
  availableRamMB: number;
  totalCpuPercent: number;
  cpuCores: number;
  robloxInstances: ProcessInfo[];
}

export interface OverallSummary {
  totalInstances: number;
  totalRamUsage: number;
  totalCpuUsage: number;
}
