import { validateRobloxCookie } from "@/utils/roblox";
import { injectCookieToClone } from "./cookie-injection";
import type { LoginResult } from "./types";

export async function loginToClone(
  deviceId: string,
  deviceModel: string | undefined,
  packageName: string,
  cookie: string
): Promise<LoginResult> {
  const result: LoginResult = {
    deviceId,
    deviceModel,
    packageName,
    cookie,
    isSuccess: false,
  };

  try {
    const validation = await validateRobloxCookie(cookie);
    if (!validation.isValid) {
      result.error = validation.error || "Invalid cookie";
      return result;
    }

    result.userInfo = validation.userInfo;

    const injectSuccess = await injectCookieToClone(
      deviceId,
      packageName,
      cookie
    );
    if (!injectSuccess) {
      result.error = "Failed to inject cookie";
      return result;
    }

    result.isSuccess = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}
