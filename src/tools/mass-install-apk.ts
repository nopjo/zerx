import { text, spinner, outro, confirm } from "@clack/prompts";
import colors from "picocolors";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { getConnectedDevices, printConnectedDevices } from "@/utils/adb";

const execAsync = promisify(exec);

interface InstallResult {
  deviceId: string;
  success: boolean;
  error?: string;
}

async function installApkToDevice(
  deviceId: string,
  apkPath: string
): Promise<InstallResult> {
  try {
    const command = `adb -s ${deviceId} install "${apkPath}"`;
    const { stdout, stderr } = await execAsync(command);

    if (stdout.includes("Success") || stdout.includes("INSTALL_SUCCEEDED")) {
      return { deviceId, success: true };
    } else {
      return {
        deviceId,
        success: false,
        error: stderr || stdout || "Unknown installation error",
      };
    }
  } catch (error) {
    return {
      deviceId,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function massInstallApk(): Promise<void> {
  console.log();
  console.log(
    colors.cyan(
      "[-] " +
        colors.bold("Mass APK Installer (helpful for when updating Roblox)")
    )
  );
  console.log(colors.gray("   Install an APK across devices"));
  console.log();

  const apkPath = await text({
    message: "Enter the APK file path:",
    placeholder: "/path/to/your/app.apk",
    validate(value) {
      if (value.length === 0) return "Please enter a file path";

      const cleanPath = String(value).replace(/^["']|["']$/g, "");

      if (!existsSync(cleanPath)) return "File does not exist";
      if (!cleanPath.toLowerCase().endsWith(".apk"))
        return "File must be an APK";
    },
  });

  if (!apkPath) {
    outro(colors.yellow("[!] Operation cancelled"));
    return;
  }

  const cleanApkPath = String(apkPath).replace(/^["']|["']$/g, "");

  const s = spinner();
  s.start(colors.gray("Scanning for connected devices..."));

  const devices = await getConnectedDevices();

  s.stop(colors.green("[+] Device scan complete"));

  printConnectedDevices(devices);

  if (devices.length === 0) {
    outro(colors.red("[X] No devices found. Connect devices and try again."));
    return;
  }

  const readyDevices = devices.filter((device) => device.status === "device");

  if (readyDevices.length === 0) {
    outro(
      colors.red("[X] No authorized devices found. Check device permissions.")
    );
    return;
  }

  const shouldInstall = await confirm({
    message: `Install ${colors.cyan(cleanApkPath)} to ${colors.bold(
      readyDevices.length.toString()
    )} device(s)?`,
  });

  if (!shouldInstall) {
    outro(colors.yellow("[!] Installation cancelled"));
    return;
  }

  console.log();
  console.log(colors.green("[^] Starting installation..."));
  console.log(colors.gray(`   APK: ${cleanApkPath}`));
  console.log(colors.gray(`   Devices: ${readyDevices.length}`));
  console.log();

  const installSpinner = spinner();
  installSpinner.start(colors.gray("Installing APK to devices..."));

  const installPromises = readyDevices.map((device) =>
    installApkToDevice(device.id, cleanApkPath)
  );

  const results = await Promise.all(installPromises);

  installSpinner.stop();

  console.log();
  console.log(colors.cyan("[#] " + colors.bold("Installation Results:")));
  console.log();

  const successfulInstalls = results.filter((result) => result.success);

  results.forEach((result, index) => {
    const device = readyDevices[index];
    const deviceName = device?.model
      ? `${device.id} (${device.model})`
      : device?.id || result.deviceId;

    if (result.success) {
      console.log(
        colors.green(`   [+] ${deviceName} - Installation successful`)
      );
    } else {
      console.log(colors.red(`   [X] ${deviceName} - Installation failed`));
      if (result.error) {
        console.log(colors.gray(`      Error: ${result.error}`));
      }
    }
  });

  console.log();

  if (successfulInstalls.length === readyDevices.length) {
    outro(
      colors.green(
        `Mass APK installation completed successfully! (${successfulInstalls.length}/${readyDevices.length} devices)`
      )
    );
  } else if (successfulInstalls.length > 0) {
    outro(
      colors.yellow(
        `[!] Installation completed with some failures. (${successfulInstalls.length}/${readyDevices.length} devices successful)`
      )
    );
  } else {
    outro(
      colors.red(
        `[X] All installations failed. (0/${readyDevices.length} devices successful)`
      )
    );
  }
}
