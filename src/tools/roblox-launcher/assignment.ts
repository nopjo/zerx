import { select, confirm } from "@clack/prompts";
import { Logger } from "@/utils/logger";
import { getRobloxLauncherConfig, saveRobloxLauncherConfig } from "./config";
import { getDeviceStatuses } from "./device-manager";
import { getGameConfig } from "./game-config";
import type { UsernameGameAssignment, GameConfig } from "./types";

export async function assignGameToUsername(): Promise<void> {
  while (true) {
    const statuses = await getDeviceStatuses();

    const allUsernames = new Set<string>();
    statuses.forEach((device) => {
      device.instances.forEach((instance) => {
        if (instance.username) {
          allUsernames.add(instance.username);
        }
      });
    });

    if (allUsernames.size === 0) {
      Logger.error("[X] No logged-in users found");
      return;
    }

    const launcherConfig = getRobloxLauncherConfig();

    const usernameOptions = Array.from(allUsernames).map((username) => {
      const existingAssignment = launcherConfig.usernameAssignments.find(
        (a) => a.username === username
      );
      let gameInfo = "";
      if (existingAssignment) {
        gameInfo = existingAssignment.gameConfig.privateServerLink
          ? ` - [*] ${existingAssignment.gameConfig.gameName || "Private Server"}`
          : ` - [>] ${
              existingAssignment.gameConfig.gameName ||
              existingAssignment.gameConfig.gameId
            }`;
      } else {
        gameInfo = " - [-] No game assigned";
      }
      return {
        value: username,
        label: `@${username}${gameInfo}`,
      };
    });

    usernameOptions.push({ value: "back", label: "[<] Back to main menu" });

    const selectedUsername = await select({
      message: "Select username to assign game:",
      options: usernameOptions,
    });

    if (
      !selectedUsername ||
      typeof selectedUsername === "symbol" ||
      selectedUsername === "back"
    ) {
      return;
    }

    const gameType = await select({
      message: "What type of game link?",
      options: [
        { value: "template", label: "[#] Use Saved Template" },
        { value: "gameId", label: "[>] Game ID (e.g., 123456789)" },
        { value: "privateServer", label: "[*] Private Server Link" },
        { value: "remove", label: "[X] Remove game assignment" },
        { value: "cancel", label: "[!] Cancel - back to username selection" },
      ],
    });

    if (!gameType || typeof gameType === "symbol" || gameType === "cancel")
      continue;

    if (gameType === "remove") {
      launcherConfig.usernameAssignments =
        launcherConfig.usernameAssignments.filter(
          (a) => a.username !== selectedUsername
        );
      saveRobloxLauncherConfig(launcherConfig);
      Logger.success(`[+] Game assignment removed for @${selectedUsername}!`);
      Logger.space();
      continue;
    }

    let gameConfig: GameConfig = {};

    if (gameType === "template") {
      if (launcherConfig.gameTemplates.length === 0) {
        Logger.warning("[!] No saved game templates found");
        Logger.muted("Create templates using 'Manage Game Templates' first", {
          indent: 1,
        });
        continue;
      }

      const templateOptions = launcherConfig.gameTemplates.map((template) => ({
        value: template.id,
        label: `${template.name} - ${
          template.gameConfig.privateServerLink
            ? "[*] Private Server"
            : "[>] Game ID"
        }`,
      }));
      templateOptions.push({
        value: "cancel",
        label: "[!] Cancel - back to game type selection",
      });

      const selectedTemplate = await select({
        message: "Select a game template:",
        options: templateOptions,
      });
      if (
        !selectedTemplate ||
        typeof selectedTemplate === "symbol" ||
        selectedTemplate === "cancel"
      )
        continue;

      const template = launcherConfig.gameTemplates.find(
        (t) => t.id === selectedTemplate
      );
      if (template) {
        gameConfig = { ...template.gameConfig };
      } else {
        Logger.error("[X] Template not found");
        continue;
      }
    } else {
      const config = await getGameConfig(gameType);
      if (!config) continue;
      gameConfig = config;
    }

    const existingIndex = launcherConfig.usernameAssignments.findIndex(
      (a) => a.username === selectedUsername
    );
    const assignment: UsernameGameAssignment = {
      username: selectedUsername,
      gameConfig,
    };

    if (existingIndex >= 0) {
      launcherConfig.usernameAssignments[existingIndex] = assignment;
    } else {
      launcherConfig.usernameAssignments.push(assignment);
    }

    saveRobloxLauncherConfig(launcherConfig);
    Logger.success(`[+] Game assignment saved for @${selectedUsername}!`);
    Logger.space();

    const assignAnother = await confirm({
      message: "Assign game to another username?",
    });
    if (!assignAnother) break;
    Logger.space();
  }
}
