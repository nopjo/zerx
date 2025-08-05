import { select, outro, confirm, text } from "@clack/prompts";
import colors from "picocolors";
import { existsSync } from "fs";
import path from "path";
import { getConfigValue, updateConfig, configExists } from "@/utils/config";

export async function editLDPlayerPath(): Promise<void> {
  console.log();
  console.log(colors.cyan("[>] " + colors.bold("Edit LDPlayer Path")));
  console.log(colors.gray("   Update your saved LDPlayer installation path"));
  console.log();

  const currentPath = getConfigValue("ldPlayerPath");

  if (currentPath) {
    console.log(colors.green("[@] Current saved path:"));
    console.log(colors.gray(`   ${currentPath}`));

    if (existsSync(currentPath)) {
      console.log(colors.green("   [+] Path is valid"));
    } else {
      console.log(colors.red("   [X] Path no longer exists"));
    }
  } else {
    console.log(colors.yellow("[@] No LDPlayer path currently saved"));
  }

  console.log();

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

    console.log();
    console.log(colors.cyan("[#] Testing current path..."));

    if (existsSync(currentPath)) {
      console.log(colors.green("[+] Path exists and is accessible"));
      console.log(colors.gray(`   ${currentPath}`));
      outro(colors.green("Path test successful!"));
    } else {
      console.log(colors.red("[X] Path does not exist or is not accessible"));
      console.log(colors.gray(`   ${currentPath}`));
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
    console.log();
    console.log(colors.cyan("[~] Enter new LDPlayer path"));
    console.log(
      colors.gray("   Please provide the full path to your LDPlayer directory")
    );
    console.log();

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

    console.log();
    console.log(colors.cyan("[#] Path Update Summary:"));
    if (currentPath) {
      console.log(colors.gray("   Old path: ") + colors.red(currentPath));
    }
    console.log(colors.gray("   New path: ") + colors.green(fullConsolePath));
    console.log();

    const confirmUpdate = await confirm({
      message: "Save this new path?",
    });

    if (!confirmUpdate) {
      outro(colors.yellow("[!] Update cancelled"));
      return;
    }

    updateConfig("ldPlayerPath", fullConsolePath);

    console.log();
    console.log(colors.green("[+] LDPlayer path updated successfully!"));
    console.log(colors.gray(`   New path: ${fullConsolePath}`));
  }
}
