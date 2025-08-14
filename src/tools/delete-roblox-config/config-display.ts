import { Logger } from "@/utils/logger";
import type { ConfigAnalysis } from "./types";

export function displayConfigAnalysis(analysis: ConfigAnalysis): void {
  Logger.info("[#] Current Configuration:");
  Logger.normal(`Device Assignments: ${analysis.deviceCount}`, { indent: 1 });
  Logger.normal(`Game Templates: ${analysis.templateCount}`, { indent: 1 });
  Logger.normal(`Default Game: ${analysis.hasDefaultGame ? "Yes" : "No"}`, {
    indent: 1,
  });
  Logger.normal(
    `Keep Alive Settings: ${analysis.hasKeepAliveSettings ? "Yes" : "No"}`,
    {
      indent: 1,
    }
  );
}
