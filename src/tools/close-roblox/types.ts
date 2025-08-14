export interface RobloxInstance {
  packageName: string;
  deviceId: string;
  isRunning: boolean;
}

export interface InstanceWithUser {
  packageName: string;
  deviceId: string;
  deviceModel?: string;
  username?: string;
  isRunning: boolean;
}

export interface CloseResult {
  deviceId: string;
  deviceModel?: string;
  packageName: string;
  username?: string;
  isSuccess: boolean;
  error?: string;
}

export type CloseMode = "all-running" | "by-instance";
