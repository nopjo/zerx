import { outro, confirm, spinner } from "@clack/prompts";
import colors from "picocolors";
import { exec } from "child_process";
import { promisify } from "util";
import { getLDPlayerPath } from "@/utils/ld";

const execAsync = promisify(exec);

export async function arrangeWindows(): Promise<void> {
  console.log();
  console.log(colors.cyan("[>] " + colors.bold("Arrange LDPlayer Windows")));
  console.log(
    colors.gray("   Automatically arrange all emulator windows on screen")
  );
  console.log();

  const ldPath = await getLDPlayerPath();

  if (!ldPath) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  const shouldProceed = await confirm({
    message: "Arrange all LDPlayer windows on screen?",
  });

  if (!shouldProceed) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  const arrangeSpinner = spinner();
  arrangeSpinner.start(colors.gray("Arranging LDPlayer windows..."));

  try {
    await execAsync(`"${ldPath}" sortwnd`);

    arrangeSpinner.stop(colors.green("[+] Windows arranged successfully!"));
  } catch (error) {
    arrangeSpinner.stop(colors.red("[X] Failed to arrange windows"));
  }
}
