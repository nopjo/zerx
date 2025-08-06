import { select, outro, confirm, text } from "@clack/prompts";
import colors from "picocolors";
import { existsSync } from "fs";
import path from "path";
import { getConfigValue, updateConfig, configExists } from "@/utils/config";
import { Logger } from "@/utils/logger";

export async function editLDPlayerPath(): Promise<void> {
  Logger.title("[>] Edit LDPlayer Path");
  Logger.muted("Update your saved LDPlayer installation path", { indent: 1 });

  const currentPath = getConfigValue("ldPlayerPath");

  if (currentPath) {
    Logger.success("[@] Current saved path:");
    Logger.muted(currentPath, { indent: 1 });

    if (existsSync(currentPath)) {
      Logger.success("[+] Path is valid", { indent: 1 });
    } else {
      Logger.error("[X] Path no longer exists", { indent: 1 });
    }
  } else {
    Logger.warning("[@] No LDPlayer path currently saved");
  }

  const actionChoice = await select({
    message: "What would you like to do?",
    options: [
      {
        value: "update",
        label: "[~] Update LDPlayer path",
      },
      {
        value: "remove",
        label: "[X] Remove saved path (will prompt next time)",
      },
      {
        value: "test",
        label: "[#] Test current path",
      },
      {
        value: "cancel",
        label: "[!] Cancel - go back",
      },
    ],
  });

  if (
    !actionChoice ||
    typeof actionChoice === "symbol" ||
    actionChoice === "cancel"
  ) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  if (actionChoice === "test") {
    if (!currentPath) {
      outro(colors.red("[X] No path saved to test"));
      return;
    }

    Logger.info("[#] Testing current path...", { spaceBefore: true });

    if (existsSync(currentPath)) {
      Logger.success("[+] Path exists and is accessible");
      Logger.muted(currentPath, { indent: 1 });
      outro(colors.green("Path test successful!"));
    } else {
      Logger.error("[X] Path does not exist or is not accessible");
      Logger.muted(currentPath, { indent: 1 });
      outro(colors.red("[!] Path test failed - consider updating your path"));
    }
    return;
  }

  if (actionChoice === "remove") {
    if (!currentPath) {
      outro(colors.yellow("[@] No path saved to remove"));
      return;
    }

    const confirmRemove = await confirm({
      message: "Remove the saved LDPlayer path?",
    });

    if (!confirmRemove) {
      outro(colors.yellow("[!] Operation cancelled"));
      return;
    }

    updateConfig("ldPlayerPath", undefined);
    outro(colors.green("[+] LDPlayer path removed successfully"));
    return;
  }

  if (actionChoice === "update") {
    Logger.info("[~] Enter new LDPlayer path", { spaceBefore: true });
    Logger.muted("Please provide the full path to your LDPlayer directory", {
      indent: 1,
    });

    const newPath = await text({
      message: "Enter the full path to your LDPlayer directory:",
      placeholder: "D:\\LDPlayer\\LDPlayer9",
      validate: (value) => {
        if (!value) return "Path is required";

        const consolePath = path.join(value, "ldconsole.exe");
        if (!existsSync(consolePath)) {
          return "ldconsole.exe not found in this directory";
        }

        return undefined;
      },
    });

    if (!newPath || typeof newPath === "symbol") {
      outro(colors.yellow("[!] Operation cancelled"));
      return;
    }

    const fullConsolePath = path.join(newPath, "ldconsole.exe");

    Logger.info("[#] Path Update Summary:", { spaceBefore: true });
    if (currentPath) {
      Logger.muted("Old path: " + colors.red(currentPath), { indent: 1 });
    }
    Logger.muted("New path: " + colors.green(fullConsolePath), { indent: 1 });

    const confirmUpdate = await confirm({
      message: "Save this new path?",
    });

    if (!confirmUpdate) {
      outro(colors.yellow("[!] Update cancelled"));
      return;
    }

    updateConfig("ldPlayerPath", fullConsolePath);

    Logger.success("[+] LDPlayer path updated successfully!", {
      spaceBefore: true,
    });
    Logger.muted(`New path: ${fullConsolePath}`, { indent: 1 });
  }
}
