import { select, outro, confirm, intro } from "@clack/prompts";
import colors from "picocolors";
import { ToolRegistry, type ToolResult } from "@/types/tool";
import { Logger } from "@/utils/logger";

import "./mass-install-apk";
import "./cookie-checker";
import "./clone-vm";
import "./delete-backups";
import "./cookie-extractor";
import "./automatic-login";
import "./launch-emulators";
import "./close-emulators";
import "./file-management";
import "./arrange-windows";
import "./close-roblox";
import "./optimize-devices";
import "./roblox-launcher";
import "./delete-roblox-config";
import "./resource-monitor";
import "./quick-swap-executor-keys";

export async function runTool(): Promise<void> {
  while (true) {
    console.clear();

    intro(
      colors.bold(
        colors.magenta("[*] ") +
          colors.cyan("zerx.lol") +
          colors.white(" CLI Tool ") +
          colors.gray("v1.1")
      )
    );

    const availableTools = ToolRegistry.getAll();

    const toolOptions = availableTools.map((tool) => ({
      value: tool.id,
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

    const selectedTool = ToolRegistry.get(toolChoice as string);

    if (selectedTool) {
      try {
        const result: ToolResult = await selectedTool.run();

        if (result.success) {
          if (result.message) {
            Logger.success(result.message, { spaceBefore: true });
          }
        } else {
          Logger.error(`Tool failed: ${result.message}`, { spaceBefore: true });
        }
      } catch (error) {
        Logger.error(
          `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
          { spaceBefore: true }
        );
      }

      Logger.space();
      await confirm({
        message: "Press Enter to return to main menu",
        initialValue: true,
      });
    } else {
      outro(colors.yellow("[!] Tool not found"));
    }
  }
}
