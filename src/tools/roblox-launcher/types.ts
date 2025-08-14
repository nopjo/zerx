import type { GameConfig, GameTemplate } from "@/utils/config";

export interface RobloxInstance {
  packageName: string;
  deviceId: string;
}

export interface DeviceStatus {
  deviceId: string;
  deviceModel?: string;
  instances: InstanceStatus[];
  isResponsive: boolean;
}

export interface InstanceStatus {
  packageName: string;
  deviceId: string;
  isRobloxRunning: boolean;
  username?: string;
  assignedGame?: GameConfig;
  isInGame?: boolean;
  lastPresenceCheck?: number;
}

export interface UsernameGameAssignment {
  username: string;
  gameConfig: GameConfig;
}

export interface InstanceCacheEntry {
  deviceId: string;
  packageName: string;
  username?: string;
  lastCookieCheck?: number;
}

export interface RobloxLauncherConfig {
  usernameAssignments: UsernameGameAssignment[];
  instanceCache: InstanceCacheEntry[];
  keepAliveInterval: number;
  autoRebootInterval: number;
  presenceCheckInterval: number;
  deviceTimeoutSeconds: number;
  defaultGame?: GameConfig;
  gameTemplates: GameTemplate[];
}

export type { GameConfig, GameTemplate };
