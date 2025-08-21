import { outro, intro, text } from "@clack/prompts";
import colors from "picocolors";
import { ToolRegistry } from "@/types/tool";
import { Logger } from "@/utils/logger";
import { updateConfig, getConfigValue } from "@/utils/config";
import { select } from "@/utils/prompts";

import "./mass-install-apk";
import "./cookie-checker";
import "./clone-vm";
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

type EmulatorType = "ldplayer" | "mumu";
type InputMethod = "arrows" | "numbers";

async function selectInputMethod(): Promise<InputMethod | null> {
  const savedInputMethod = getConfigValue("inputMethod") as InputMethod;

  if (savedInputMethod) {
    return savedInputMethod;
  }

  const inputChoice = await select({
    message: colors.cyan("[>] Choose your preferred input method:"),
    options: [
      {
        value: "numbers",
        label: "Number input",
      },
      {
        value: "arrows",
        label: "Arrow keys",
      },
    ],
  });

  if (!inputChoice || typeof inputChoice === "symbol") {
    return null;
  }

  updateConfig("inputMethod", inputChoice);

  Logger.success(
    `[+] Input method saved: ${inputChoice === "numbers" ? "Number input" : "Arrow keys"}`
  );

  return inputChoice as InputMethod;
}

async function selectEmulator(): Promise<EmulatorType | null> {
  const savedEmulator = getConfigValue("emulatorType") as EmulatorType;

  if (savedEmulator) {
    return savedEmulator;
  }

  const emulatorChoice = await select({
    message: colors.cyan("[>] Which Android emulator are you using?"),
    options: [
      {
        value: "ldplayer",
        label: "LDPlayer",
      },
      {
        value: "mumu",
        label: "MuMu Player",
      },
    ],
  });

  if (!emulatorChoice || typeof emulatorChoice === "symbol") {
    return null;
  }

  updateConfig("emulatorType", emulatorChoice);

  Logger.success(
    `[+] Emulator type saved: ${emulatorChoice === "ldplayer" ? "LDPlayer" : "MuMu Player"}`
  );

  return emulatorChoice as EmulatorType;
}

export async function runTool(): Promise<void> {
  const inputMethod = await selectInputMethod();

  if (!inputMethod) {
    outro(colors.yellow("[!] No input method selected. Goodbye!"));
    process.exit(0);
  }

  const emulatorType = await selectEmulator();

  if (!emulatorType) {
    outro(colors.yellow("[!] No emulator selected. Goodbye!"));
    process.exit(0);
  }

  while (true) {
    console.clear();

    const emulatorName =
      emulatorType === "ldplayer" ? "LDPlayer" : "MuMu Player";

    intro(
      colors.bold(
        colors.magenta("[*] ") +
          colors.cyan("zerx.lol") +
          colors.gray(" v1.2.3") +
          colors.white(" - ") +
          colors.green(emulatorName + "\n")
      )
    );

    const availableTools = ToolRegistry.getAll();

    const toolOptions = availableTools.map((tool) => ({
      value: tool.id,
      label: tool.label,
    }));

    toolOptions.push(
      {
        value: "change-emulator",
        label: "Change Emulator Type",
      },
      {
        value: "change-input",
        label: "Change Input Method",
      },
      {
        value: "exit",
        label: "[>] Exit Tool",
      }
    );

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

    if (toolChoice === "change-emulator") {
      updateConfig("emulatorType", undefined);
      Logger.info("[~] Emulator type cleared. Restarting...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return runTool();
    }

    if (toolChoice === "change-input") {
      updateConfig("inputMethod", undefined);
      Logger.info("[~] Input method cleared. Restarting...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return runTool();
    }

    const selectedTool = ToolRegistry.get(toolChoice as string);

    if (selectedTool) {
      try {
        const result = await selectedTool.run({ emulatorType });

        if (result.success) {
          if (result.message) {
            Logger.success(result.message, { spaceBefore: true });
          }
        } else {
          Logger.error(`Tool failed: ${result.message}`, { spaceBefore: true });
        }

        Logger.space();

        // fixes weird issue of crashing
        if (toolChoice === "cookie-extractor") {
          console.log("Returning to main menu in 3 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } else {
          await text({
            message: "Press Enter to return to main menu",
            placeholder: "",
            validate: () => undefined,
          });
        }
      } catch (error) {
        Logger.error(
          `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
          { spaceBefore: true }
        );

        Logger.space();
        await text({
          message: "Press Enter to return to main menu",
          placeholder: "",
          validate: () => undefined,
        });
      }
    } else {
      outro(colors.yellow("[!] Tool not found"));
    }
  }
}
