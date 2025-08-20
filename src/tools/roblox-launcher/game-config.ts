import { text, confirm } from "@clack/prompts";
import { Logger } from "@/utils/logger";
import { getRobloxLauncherConfig, saveRobloxLauncherConfig } from "./config";
import type { GameConfig, GameTemplate } from "./types";
import { select } from "@/utils/prompts";

export async function getGameConfig(
  gameType: string
): Promise<GameConfig | null> {
  if (gameType === "gameId") {
    const gameId = await text({
      message: "Enter Game ID:",
      placeholder: "123456789",
      validate: (value) =>
        !value
          ? "Game ID is required"
          : !/^\d+$/.test(value)
            ? "Game ID must be numbers only"
            : undefined,
    });
    if (!gameId || typeof gameId === "symbol") return null;

    const gameName = await text({
      message: "Enter game name (optional):",
      placeholder: "Game",
    });
    return {
      gameId: gameId.toString(),
      gameName: typeof gameName === "string" ? gameName : undefined,
    };
  } else {
    const privateServerLink = await text({
      message: "Enter Private Server Link:",
      placeholder:
        "https://www.roblox.com/games/123456789/Game?privateServerLinkCode=...",
      validate: (value) =>
        !value
          ? "Private server link is required"
          : !value.includes("privateServerLinkCode")
            ? "Invalid private server link"
            : undefined,
    });
    if (!privateServerLink || typeof privateServerLink === "symbol")
      return null;

    const gameName = await text({
      message: "Enter game name (optional):",
      placeholder: "Private Server Game",
    });
    return {
      privateServerLink: privateServerLink.toString(),
      gameName: typeof gameName === "string" ? gameName : undefined,
    };
  }
}

export async function setDefaultGame(): Promise<void> {
  Logger.info("[>] Set Default Game", { spaceBefore: true });
  Logger.muted(
    "This game will be used for users without specific assignments",
    { indent: 1 }
  );

  const gameType = await select({
    message: "What type of default game?",
    options: [
      { value: "gameId", label: "[>] Game ID" },
      { value: "privateServer", label: "[*] Private Server Link" },
      { value: "remove", label: "[X] Remove default game" },
    ],
  });

  if (!gameType || typeof gameType === "symbol") return;

  const launcherConfig = getRobloxLauncherConfig();

  if (gameType === "remove") {
    launcherConfig.defaultGame = undefined;
    saveRobloxLauncherConfig(launcherConfig);
    Logger.success("[+] Default game removed");
    return;
  }

  const gameConfig = await getGameConfig(gameType as string);
  if (!gameConfig) return;

  launcherConfig.defaultGame = gameConfig;
  saveRobloxLauncherConfig(launcherConfig);
  Logger.success("[+] Default game saved!");
}

async function createGameTemplate(): Promise<void> {
  Logger.info("[+] Create New Game Template", {
    spaceBefore: true,
    spaceAfter: true,
  });

  const templateName = await text({
    message: "Enter template name:",
    placeholder: "Template Name",
    validate: (value) => {
      if (!value) return "Template name is required";
      const launcherConfig = getRobloxLauncherConfig();
      return launcherConfig.gameTemplates.some((t) => t.name === value)
        ? "Template name already exists"
        : undefined;
    },
  });

  if (!templateName || typeof templateName === "symbol") return;

  const gameType = await select({
    message: "What type of game?",
    options: [
      { value: "gameId", label: "[>] Game ID" },
      { value: "privateServer", label: "[*] Private Server Link" },
    ],
  });

  if (!gameType || typeof gameType === "symbol") return;

  const gameConfig = await getGameConfig(gameType as string);
  if (!gameConfig) return;

  const launcherConfig = getRobloxLauncherConfig();
  const template: GameTemplate = {
    id: Date.now().toString(),
    name: templateName.toString(),
    gameConfig,
    createdAt: Date.now(),
  };

  launcherConfig.gameTemplates.push(template);
  saveRobloxLauncherConfig(launcherConfig);
  Logger.success(`[+] Template "${templateName}" created successfully!`);
}

export async function manageGameTemplates(): Promise<void> {
  while (true) {
    const launcherConfig = getRobloxLauncherConfig();

    Logger.title("[#] Manage Game Templates");
    Logger.muted("Create and manage reusable game configurations", {
      indent: 1,
    });

    if (launcherConfig.gameTemplates.length > 0) {
      Logger.info("[#] Saved Templates:");
      launcherConfig.gameTemplates.forEach((template, index) => {
        const gameType = template.gameConfig.privateServerLink
          ? "[*] Private Server"
          : "[>] Game ID";
        const gameInfo = template.gameConfig.privateServerLink
          ? template.gameConfig.privateServerLink.substring(0, 50) + "..."
          : template.gameConfig.gameId;
        Logger.normal(`${index + 1}. ${template.name}`, { indent: 1 });
        Logger.muted(`Type: ${gameType}`, { indent: 2 });
        Logger.muted(`Info: ${gameInfo}`, { indent: 2 });
        Logger.space();
      });
    } else {
      Logger.warning("[#] No templates saved yet", {
        spaceBefore: true,
        spaceAfter: true,
      });
    }

    const action = await select({
      message: "What would you like to do?",
      options: [
        { value: "create", label: "[+] Create New Template" },
        ...(launcherConfig.gameTemplates.length > 0
          ? [
              { value: "delete", label: "[X] Delete Template" },
              { value: "edit", label: "[>] Edit Template" },
            ]
          : []),
        { value: "back", label: "[<] Back to main menu" },
      ],
    });

    if (!action || typeof action === "symbol" || action === "back") return;

    if (action === "create") {
      await createGameTemplate();
    } else if (action === "delete") {
      const templateOptions = launcherConfig.gameTemplates.map((template) => ({
        value: template.id,
        label: `${template.name} - ${
          template.gameConfig.privateServerLink
            ? "[*] Private Server"
            : "[>] Game ID"
        }`,
      }));

      const selectedTemplate = await select({
        message: "Select template to delete:",
        options: templateOptions,
      });
      if (!selectedTemplate || typeof selectedTemplate === "symbol") continue;

      const template = launcherConfig.gameTemplates.find(
        (t) => t.id === selectedTemplate
      );
      if (!template) continue;

      const confirmDelete = await confirm({
        message: `Delete template "${template.name}"?`,
      });
      if (!confirmDelete) continue;

      launcherConfig.gameTemplates = launcherConfig.gameTemplates.filter(
        (t) => t.id !== selectedTemplate
      );
      saveRobloxLauncherConfig(launcherConfig);
      Logger.success(`[+] Template "${template.name}" deleted successfully!`);
    } else if (action === "edit") {
      const templateOptions = launcherConfig.gameTemplates.map((template) => ({
        value: template.id,
        label: `${template.name} - ${
          template.gameConfig.privateServerLink
            ? "[*] Private Server"
            : "[>] Game ID"
        }`,
      }));

      const selectedTemplate = await select({
        message: "Select template to edit:",
        options: templateOptions,
      });
      if (!selectedTemplate || typeof selectedTemplate === "symbol") continue;

      const templateIndex = launcherConfig.gameTemplates.findIndex(
        (t) => t.id === selectedTemplate
      );
      if (templateIndex === -1) continue;

      const template = launcherConfig.gameTemplates[templateIndex];
      if (!template) continue;

      const newName = await text({
        message: "Enter new template name:",
        placeholder: template.name,
        validate: (value) => {
          if (!value) return "Template name is required";
          return value !== template.name &&
            launcherConfig.gameTemplates.some((t) => t.name === value)
            ? "Template name already exists"
            : undefined;
        },
      });

      if (!newName || typeof newName === "symbol") continue;

      template.name = newName.toString();
      saveRobloxLauncherConfig(launcherConfig);
      Logger.success(`[+] Template renamed to "${newName}" successfully!`);
    }
  }
}
