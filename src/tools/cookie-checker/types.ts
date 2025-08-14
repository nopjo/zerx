import type { RobloxUserInfo } from "@/utils/roblox";

export interface RobloxInstance {
  packageName: string;
  deviceId: string;
}

export interface CookieResult {
  deviceId: string;
  deviceModel?: string;
  packageName: string;
  cookie?: string;
  isValid: boolean;
  userInfo?: RobloxUserInfo;
  error?: string;
}

export type CheckType = "check-all" | "check-device" | "check-single";
