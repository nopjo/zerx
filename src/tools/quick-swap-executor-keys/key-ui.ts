import { select, confirm, text } from "@clack/prompts";
import colors from "picocolors";
import { Logger } from "@/utils/logger";
import {
  EXECUTOR_KEYS,
  getExecutorKeyByName,
  validateKeyContent,
} from "./key-config";
import type { ExecutorKeyInfo, DeviceKeyStatus } from "./types";

export async function selectExecutor(): Promise<{
  success: boolean;
  data?: ExecutorKeyInfo;
  message: string;
}> {
  const executorChoice = await select({
    message: "Select executor to swap keys for:",
    options: EXECUTOR_KEYS.map((executor) => ({
      value: executor.name.toLowerCase(),
      label: `${executor.name} - ${executor.description}`,
    })),
  });

  if (!executorChoice || typeof executorChoice === "symbol") {
    return {
      success: false,
      message: "cancelled",
    };
  }

  const executor = getExecutorKeyByName(executorChoice as string);
  if (!executor) {
    return {
      success: false,
      message: "Executor not found",
    };
  }

  Logger.success(`Selected: ${executor.name}`);
  Logger.muted(`Key path: ${executor.keyPath}`);

  return {
    success: true,
    message: `Selected executor: ${executor.name}`,
    data: executor,
  };
}

export async function showCurrentKeyContent(
  deviceStatuses: DeviceKeyStatus[],
  executor: ExecutorKeyInfo
): Promise<void> {
  const deviceWithKey = deviceStatuses.find(
    (status) => status.hasKey && status.currentKeyContent
  );

  if (!deviceWithKey || !deviceWithKey.currentKeyContent) {
    Logger.warning("No current key content found to display");
    return;
  }

  Logger.info(`Current ${executor.name} key content:`, {
    spaceBefore: true,
  });

  Logger.separator();
  console.log(colors.dim(deviceWithKey.currentKeyContent));
  Logger.separator();

  Logger.muted(
    `Key length: ${deviceWithKey.currentKeyContent.length} characters`
  );
}

export async function getNewKeyContent(): Promise<{
  success: boolean;
  data?: string;
  message: string;
}> {
  const newKey = await text({
    message: "Enter new key content:",
    placeholder: "Paste your new key here...",
    validate: (value) => {
      const validation = validateKeyContent(value);
      return validation.isValid ? undefined : validation.error;
    },
  });

  if (!newKey || typeof newKey === "symbol") {
    return {
      success: false,
      message: "No key content provided",
    };
  }

  const trimmedKey = newKey.trim();
  Logger.success(`New key length: ${trimmedKey.length} characters`);

  return {
    success: true,
    message: "Key content received",
    data: trimmedKey,
  };
}

export async function confirmKeyReplacement(
  executor: ExecutorKeyInfo,
  deviceCount: number,
  newKeyContent: string
): Promise<boolean> {
  Logger.info("Key replacement summary:", { spaceBefore: true });
  Logger.muted(`Executor: ${executor.name}`);
  Logger.muted(`Devices: ${deviceCount}`);
  Logger.muted(`New key length: ${newKeyContent.length} characters`);

  const confirmed = await confirm({
    message: colors.yellow(
      `Replace ${executor.name} key on ${deviceCount} device(s)?`
    ),
  });

  return confirmed === true;
}

export async function askForBackup(): Promise<boolean> {
  const shouldBackup = await confirm({
    message: "Create backup of current keys before replacement?",
  });

  return shouldBackup === true;
}

export async function askToContinue(): Promise<boolean> {
  const continueSwapping = await confirm({
    message: "Swap keys for another executor?",
  });

  return continueSwapping === true;
}

export async function askToTryAnother(): Promise<boolean> {
  const tryAnother = await confirm({
    message: "Try another executor?",
  });

  return tryAnother === true;
}

export function displayDeviceStatuses(deviceStatuses: DeviceKeyStatus[]): void {
  const devicesWithKey = deviceStatuses.filter((status) => status.hasKey);
  const devicesWithoutKey = deviceStatuses.filter((status) => !status.hasKey);

  if (devicesWithKey.length > 0) {
    Logger.success(`Devices with key file:`, { spaceBefore: true });
    devicesWithKey.forEach((status) => {
      Logger.deviceFound(status.device.id, status.device.model || "Unknown");
    });
  }

  if (devicesWithoutKey.length > 0) {
    Logger.warning(`Devices without key file:`);
    devicesWithoutKey.forEach((status) => {
      Logger.deviceMissing(status.device.id, status.device.model || "Unknown");
      if (status.error) {
        Logger.muted(`  Error: ${status.error}`, { indent: 1 });
      }
    });
  }
}
