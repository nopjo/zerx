import type { ExecutorKeyInfo } from "./types";

export const EXECUTOR_KEYS: ExecutorKeyInfo[] = [
  {
    name: "Delta",
    keyPath: "/storage/emulated/0/Delta/Internals/Settings/delta_key",
    description: "Delta (https://deltaexploits.gg)",
  },
  {
    name: "Cryptic",
    keyPath: "/storage/emulated/0/Cryptic/Workspace/cryptic_key.DEPOSIBLE",
    description: "Cryptic (https://getcryptic.net/)",
  },
  {
    name: "VegaX",
    keyPath: "/storage/emulated/0/VegaX/Workspace/vegax_key.txt",
    description: "VegaX (https://vegax.gg/)",
  },
];

export function getExecutorKeyByName(
  name: string
): ExecutorKeyInfo | undefined {
  return EXECUTOR_KEYS.find((e) => e.name.toLowerCase() === name.toLowerCase());
}

export function validateKeyContent(content: string): {
  isValid: boolean;
  error?: string;
} {
  if (!content || !content.trim()) {
    return {
      isValid: false,
      error: "Key content cannot be empty",
    };
  }

  const trimmed = content.trim();

  if (trimmed.length < 5) {
    return {
      isValid: false,
      error: "Key content seems too short (minimum 5 characters)",
    };
  }

  return { isValid: true };
}
