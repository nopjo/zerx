import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "@/utils/logger";
import type { GameConfig } from "./types";

const execAsync = promisify(exec);

export async function launchRobloxGame(
  deviceId: string,
  packageName: string,
  gameConfig: GameConfig
): Promise<boolean> {
  try {
    const launchUrl =
      gameConfig.privateServerLink ||
      (gameConfig.gameId ? `roblox://placeId=${gameConfig.gameId}` : null);

    if (!launchUrl) return false;

    Logger.muted(
      `[>] Launching: ${gameConfig.gameName || "Game"} on ${packageName.replace("com.roblox.", "")}`,
      { indent: 1 }
    );

    await execAsync(
      `adb -s ${deviceId} shell "am start -a android.intent.action.VIEW -d '${launchUrl}' -p ${packageName} -f 0x10000000"`
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));
    return true;
  } catch (error) {
    Logger.error(`[X] Launch failed: ${error}`, { indent: 1 });
    return false;
  }
}
