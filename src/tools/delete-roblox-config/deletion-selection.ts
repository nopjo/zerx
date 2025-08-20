import { select } from "@/utils/prompts";
import type { DeleteOption } from "./types";

export async function getDeleteOption(): Promise<DeleteOption | null> {
  const deleteOption = await select({
    message: "What would you like to delete?",
    options: [
      { value: "all", label: "[X] Delete Everything (Complete Reset)" },
      { value: "assignments", label: "[-] Delete Device Assignments Only" },
      { value: "templates", label: "[#] Delete Game Templates Only" },
      { value: "default", label: "[>] Delete Default Game Only" },
      { value: "keepalive", label: "[~] Delete Keep Alive Settings Only" },
      { value: "cancel", label: "[!] Cancel" },
    ],
  });

  if (!deleteOption || typeof deleteOption === "symbol") {
    return null;
  }

  return deleteOption as DeleteOption;
}

export function getConfirmationMessage(
  option: DeleteOption,
  deviceCount: number,
  templateCount: number
): string {
  switch (option) {
    case "all":
      return "Delete ALL Roblox launcher configuration? This cannot be undone!";
    case "assignments":
      return `Delete all ${deviceCount} device assignments?`;
    case "templates":
      return `Delete all ${templateCount} game templates?`;
    case "default":
      return "Delete the default game setting?";
    case "keepalive":
      return "Delete keep alive and auto-reboot settings?";
    default:
      return "Confirm deletion?";
  }
}
