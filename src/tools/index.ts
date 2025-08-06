import { select, outro, confirm, intro } from "@clack/prompts";
import colors from "picocolors";
import { massInstallApk } from "./mass-install-apk";
import { checkRobloxCookies } from "./cookie-checker";
import { cloneVirtualMachine } from "./clone-vm";
import { deleteLDPlayerBackups } from "./delete-backups";
import { extractRobloxCookies } from "./cookie-extractor";
import { automaticLogin } from "./automatic-login";
import { launchAllEmulators } from "./launch-all";
import { closeAllEmulators } from "./close-all";
import { editLDPlayerPath } from "./edit-ldplayer-path";
import { executorFileManagement } from "./executor-file-management";
import { arrangeWindows } from "./arrange-windows";
import { closeAllRobloxProcesses } from "./close-roblox";
import { optimizeDevices } from "./optimize-devices";
import { robloxLauncher } from "./roblox-launcher";
import { deleteRobloxConfig } from "./delete-roblox-config";
import { systemResourceMonitor } from "./system-resource-manager";
import { Logger } from "@/utils/logger";

interface Tool {
  value: string;
  label: string;
  handler: () => Promise<void>;
}

const tools: Tool[] = [
  {
    value: "roblox-launcher",
    label: "Roblox Launcher (Private Servers, Keep Alive & Auto-Reboot)",
    handler: robloxLauncher,
  },
  {
    value: "automatic-login",
    label: "Automatic Login (With Cookie List)",
    handler: automaticLogin,
  },
  {
    value: "launch-all-emulators",
    label: "Launch All Emulators (Boot Up All Stopped Instances)",
    handler: launchAllEmulators,
  },
  {
    value: "executor-file-management",
    label:
      "Executor File Management (Navigate through entire Executor Workspace, AutoExec, Scripts etc.)",
    handler: executorFileManagement,
  },
  {
    value: "system-resource-monitor",
    label: "System Resource Monitor (RAM/CPU Usage Per Roblox Instance)",
    handler: systemResourceMonitor,
  },
  {
    value: "cookie-extractor",
    label: "Cookie Extractor (Get Account Cookies From Roblox Account Manager)",
    handler: extractRobloxCookies,
  },
  {
    value: "roblox-cookie-checker",
    label: "Roblox Cookie Checker (Checks All Cookies For Every Device Open)",
    handler: checkRobloxCookies,
  },
  {
    value: "close-all-roblox",
    label: "Close Roblox Processes (Close All, Specific Users / Instances)",
    handler: closeAllRobloxProcesses,
  },
  {
    value: "close-all-emulators",
    label: "Close All Emulators (Shut Down All Running Instances)",
    handler: closeAllEmulators,
  },
  {
    value: "arrange-windows",
    label: "Arrange Windows (Auto-arrange All LDPlayer Windows On Screen)",
    handler: arrangeWindows,
  },
  {
    value: "optimize-devices",
    label: "Optimize Devices (Change device specs)",
    handler: optimizeDevices,
  },
  {
    value: "mass-install-apk",
    label: "Mass APK Installer (Helpful For When Updating Roblox)",
    handler: massInstallApk,
  },
  {
    value: "clone-vm",
    label: "Clone Virtual Machine (Same HWID For Key Systems)",
    handler: cloneVirtualMachine,
  },
  {
    value: "delete-roblox-config",
    label: "Delete Roblox Launcher Configuration (Reset All Settings)",
    handler: deleteRobloxConfig,
  },
  {
    value: "delete-backups",
    label: "Delete LD Player Backups",
    handler: deleteLDPlayerBackups,
  },
  {
    value: "edit-ldplayer-path",
    label: "Edit LDPlayer Path",
    handler: editLDPlayerPath,
  },
];

export async function runTool(): Promise<void> {
  while (true) {
    console.clear();

    intro(
      colors.bold(
        colors.magenta("[*] ") +
          colors.cyan("zerx.lol") +
          colors.white(" CLI Tool ") +
          colors.gray("v1.0")
      )
    );

    const toolOptions = tools.map((tool) => ({
      value: tool.value,
      label: tool.label,
    }));

    toolOptions.push({
      value: "exit",
      label: "[>] Exit Tool",
    });

    const toolChoice = await select({
      message: colors.cyan("[>] Select a tool to run:"),
      options: toolOptions,
    });

    if (
      !toolChoice ||
      typeof toolChoice === "symbol" ||
      toolChoice === "exit"
    ) {
      console.clear();
      outro(colors.yellow("[!] Goodbye!"));
      process.exit(0);
    }

    const selectedTool = tools.find((tool) => tool.value === toolChoice);

    if (selectedTool) {
      try {
        await selectedTool.handler();
      } catch (error) {
        Logger.error(
          `Tool error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          { spaceBefore: true }
        );
      }

      Logger.space();
      await confirm({
        message: "Press Enter to return to main menu",
        initialValue: true,
      });
    } else {
      outro(colors.yellow("[!] Tool not implemented yet lol"));
    }
  }
}
