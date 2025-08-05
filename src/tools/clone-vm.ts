import { text, spinner, outro, confirm, select } from "@clack/prompts";
import colors from "picocolors";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import {
  createCopy,
  getLDPlayerInstances,
  getLDPlayerPath,
  isInstanceRunning,
  stopInstance,
  createBackup,
  restoreBackup,
  renameInstance,
  type LDPlayerInstance,
} from "@/utils/ld";

export async function cloneVirtualMachine(): Promise<void> {
  console.log();
  console.log(
    colors.cyan("[-] " + colors.bold("LDPlayer Clone Virtual Machine"))
  );
  console.log(
    colors.gray("   Create VM backups and restore them to new instances")
  );
  console.log();

  console.log(
    colors.gray("[>] Please specify your LDPlayer installation path...")
  );
  const ldPath = await getLDPlayerPath();

  if (!ldPath) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  console.log(colors.green(`[+] Using LDPlayer at: ${ldPath}`));

  const loadingSpinner = spinner();
  loadingSpinner.start(colors.gray("Loading LDPlayer instances..."));

  let instances: LDPlayerInstance[] = [];
  try {
    instances = await getLDPlayerInstances(ldPath);
  } catch (error) {
    loadingSpinner.stop(colors.red("[X] Failed to load instances"));
    outro(
      colors.red(
        `[X] Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    return;
  }

  loadingSpinner.stop(colors.green("[+] Instances loaded"));

  if (instances.length === 0) {
    outro(
      colors.red(
        "[X] No LDPlayer instances found. Create some instances first."
      )
    );
    return;
  }

  console.log();
  console.log(colors.cyan("[#] Available LDPlayer Instances:"));
  for (const instance of instances) {
    const statusColor =
      instance.status === "Running" ? colors.green : colors.gray;
    console.log(
      `   ${colors.cyan(instance.index.toString())}. ${colors.white(
        instance.name
      )} ${statusColor(`[${instance.status}]`)}`
    );
  }
  console.log();

  const instanceOptions = instances.map((instance) => ({
    value: instance.name,
    label: `${instance.name} [${instance.status}]`,
  }));

  const sourceInstance = await select({
    message: "Select the VM to clone:",
    options: instanceOptions,
  });

  if (!sourceInstance || typeof sourceInstance === "symbol") {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  const sourceInstanceName = String(sourceInstance);

  const sourceInstanceObj = instances.find(
    (i) => i.name === sourceInstanceName
  );
  if (!sourceInstanceObj) {
    outro(colors.red("[X] Source instance not found"));
    return;
  }

  const newInstanceName = await text({
    message: "Enter name for the new cloned VM:",
    placeholder: "MyClonedVM",
    validate: (value) => {
      if (!value) return "Name is required";
      if (instances.some((i) => i.name === value)) return "Name already exists";
      return undefined;
    },
  });

  if (!newInstanceName || typeof newInstanceName === "symbol") {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  const newInstanceNameStr = String(newInstanceName);

  const cloneCount = await text({
    message: "How many clones do you want to create?",
    placeholder: "1",
    validate: (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 1 || num > 100)
        return "Enter a number between 1 and 100";
      return undefined;
    },
  });

  if (!cloneCount || typeof cloneCount === "symbol") {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  const numClones = parseInt(String(cloneCount));

  const shouldProceed = await confirm({
    message: `Create ${colors.bold(
      numClones.toString()
    )} clone(s) of ${colors.bold(sourceInstanceName)}?`,
  });

  if (!shouldProceed) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  console.log();
  console.log(colors.green("[^] Starting clone operation..."));
  console.log();

  const backupDir = path.join(process.cwd(), "ldplayer_backups");
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split(".")[0];
  const backupPath = path.join(
    backupDir,
    `${sourceInstanceName}_backup_${timestamp}.ldbk`
  );

  try {
    const cloneSpinner = spinner();
    cloneSpinner.start(colors.gray("Checking source instance status..."));

    const isRunning = await isInstanceRunning(ldPath, sourceInstanceObj.index);
    if (isRunning) {
      cloneSpinner.message(colors.yellow("Stopping source instance..."));
      await stopInstance(ldPath, sourceInstanceObj.index);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    cloneSpinner.message(colors.gray("Creating backup..."));
    await createBackup(ldPath, sourceInstanceObj.index, backupPath);
    cloneSpinner.stop(colors.green("[+] Backup created"));

    for (let i = 1; i <= numClones; i++) {
      const cloneName =
        numClones === 1 ? newInstanceNameStr : `${newInstanceNameStr}-${i}`;

      const cloneStepSpinner = spinner();
      cloneStepSpinner.start(
        colors.gray(`Creating clone ${i}/${numClones}: ${cloneName}...`)
      );

      try {
        const tempName = `temp_clone_${Date.now()}_${i}`;
        await createCopy(ldPath, sourceInstanceObj.index, tempName);

        await new Promise((resolve) => setTimeout(resolve, 2000));

        let updatedInstances = await getLDPlayerInstances(ldPath);
        let newInstance = updatedInstances.find(
          (inst) => inst.name === tempName
        );

        if (!newInstance) {
          throw new Error(
            `Failed to create instance "${tempName}" - instance not found after copy`
          );
        }

        cloneStepSpinner.message(
          colors.gray(`Restoring backup to ${cloneName}...`)
        );
        await restoreBackup(ldPath, newInstance.index, backupPath);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        cloneStepSpinner.message(
          colors.gray(`Renaming instance to ${cloneName}...`)
        );
        await renameInstance(ldPath, newInstance.index, cloneName);

        cloneStepSpinner.stop(
          colors.green(`[+] Clone ${i} created: ${cloneName}`)
        );
      } catch (error) {
        cloneStepSpinner.stop(colors.red(`[X] Failed to create clone ${i}`));
        console.log(
          colors.red(
            `   Error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          )
        );
      }
    }

    console.log();
    console.log(colors.green("Clone operation completed!"));
    console.log(colors.gray(`   Backup saved: ${backupPath}`));
  } catch (error) {
    console.log();
    console.log(colors.red("[X] Clone operation failed"));
    console.log(
      colors.red(
        `   Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
  }

  outro(colors.cyan("[*] Clone operation finished"));
}
