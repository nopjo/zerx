import { exec } from "child_process";
import { promisify } from "util";
import {
  checkRobloxPresenceById,
  checkRobloxPresenceWithCookie,
  searchRobloxUserByUsername,
  validateRobloxCookie,
} from "@/utils/roblox";
import { Logger } from "@/utils/logger";
import { PRESENCE_CACHE_DURATION_MS } from "./constants";
import type { InstanceStatus } from "./types";

const execAsync = promisify(exec);

export async function checkRobloxPresence(
  username: string,
  deviceId?: string,
  packageName?: string
): Promise<boolean> {
  try {
    if (deviceId && packageName) {
      try {
        const cookiePath = `/data/data/${packageName}/app_webview/Default/Cookies`;
        const sqlQuery = `SELECT value FROM cookies WHERE host_key = '.roblox.com' AND name = '.ROBLOSECURITY';`;
        const command = `adb -s ${deviceId} shell "su -c \\"sqlite3 ${cookiePath} \\\\\\"${sqlQuery}\\\\\\"\\"`;
        const { stdout } = await execAsync(command);
        const cookie = stdout
          .trim()
          .replace(/[\r\n\t]/g, "")
          .replace(/^["']|["']$/g, "");

        if (cookie && cookie.length > 0) {
          const validation = await validateRobloxCookie(cookie);
          if (validation.isValid && validation.userInfo?.userId) {
            const presenceInfo = await checkRobloxPresenceWithCookie(
              validation.userInfo.userId,
              cookie
            );

            if (presenceInfo) {
              Logger.muted(
                `[*] ${username} presence: ${presenceInfo.isInGame ? "In Game" : presenceInfo.isOnline ? "Online" : "Offline"}${
                  presenceInfo.isInGame && presenceInfo.lastLocation
                    ? ` (${presenceInfo.lastLocation})`
                    : ""
                }`,
                { indent: 2 }
              );
              return presenceInfo.isInGame;
            }

            Logger.muted("[!] Enhanced presence check failed, using fallback", {
              indent: 2,
            });
            return await checkRobloxPresenceById(validation.userInfo.userId);
          }
        }
      } catch (error) {
        Logger.muted(
          "[!] Cookie-based presence check failed, falling back to username lookup",
          { indent: 1 }
        );
      }
    }

    const exactUser = await searchRobloxUserByUsername(username);

    if (!exactUser) {
      Logger.muted(`[!] Exact user match not found for ${username}`, {
        indent: 1,
      });
      return false;
    }

    return await checkRobloxPresenceById(exactUser.id);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.muted(`[!] Presence check failed for ${username}: ${errorMessage}`, {
      indent: 1,
    });
    return false;
  }
}

export async function checkPresenceForInstances(
  instances: InstanceStatus[]
): Promise<InstanceStatus[]> {
  const now = Date.now();
  const updatedInstances = [...instances];

  for (let i = 0; i < updatedInstances.length; i++) {
    const instance = updatedInstances[i];
    if (!instance || !instance.username) continue;

    const shouldCheckPresence =
      !instance.lastPresenceCheck ||
      now - instance.lastPresenceCheck > PRESENCE_CACHE_DURATION_MS;

    if (shouldCheckPresence) {
      Logger.muted(`[*] Checking presence for @${instance.username}...`, {
        indent: 1,
      });

      const isInGame = await checkRobloxPresence(
        instance.username,
        instance.deviceId,
        instance.packageName
      );
      updatedInstances[i] = {
        ...instance,
        isInGame,
        lastPresenceCheck: now,
      };
    }
  }

  return updatedInstances;
}
