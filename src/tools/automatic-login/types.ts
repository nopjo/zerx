import { type RobloxUserInfo } from "@/utils/roblox";

export interface RobloxClone {
  packageName: string;
  deviceId: string;
  cloneIndex: number;
}

export interface LoginResult {
  deviceId: string;
  deviceModel?: string;
  packageName: string;
  cookie: string;
  isSuccess: boolean;
  userInfo?: RobloxUserInfo;
  error?: string;
}

export type LoginMode = "sequential" | "first-cookie" | "per-device";
