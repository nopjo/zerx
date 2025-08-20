import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export interface GameConfig {
  gameId?: string;
  privateServerLink?: string;
  gameName?: string;
}

export interface DeviceGameAssignment {
  deviceId: string;
  username?: string;
  gameConfig: GameConfig;
  lastCookieCheck?: number;
}

export interface GameTemplate {
  id: string;
  name: string;
  gameConfig: GameConfig;
  createdAt: number;
}

export interface RobloxLauncherConfig {
  deviceAssignments?: DeviceGameAssignment[];
  usernameAssignments?: UsernameGameAssignment[];
  keepAliveInterval: number;
  autoRebootInterval: number;
  defaultGame?: GameConfig;
  gameTemplates: GameTemplate[];
}

export interface UsernameGameAssignment {
  username: string;
  gameConfig: GameConfig;
}

export interface Config {
  ldPlayerPath?: string;
  mumuPath?: string;
  emulatorType?: "ldplayer" | "mumu";
  inputMethod?: "arrows" | "numbers";
  robloxLauncher?: RobloxLauncherConfig;
}

const CONFIG_FILE = "config.json";

function getConfigFilePath(): string {
  return path.join(process.cwd(), CONFIG_FILE);
}

export function loadConfig(): Config {
  const configPath = getConfigFilePath();

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const configData = readFileSync(configPath, "utf-8");
    return JSON.parse(configData) as Config;
  } catch (error) {
    console.warn("Warning: Could not parse config.json, using default config");
    return {};
  }
}

export function saveConfig(config: Config): void {
  const configPath = getConfigFilePath();

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    throw new Error(`Failed to save config: ${error}`);
  }
}

export function updateConfig(key: keyof Config, value: any): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  const config = loadConfig();
  return config[key];
}

export function configExists(): boolean {
  return existsSync(getConfigFilePath());
}

export function resetConfig(): void {
  saveConfig({});
}
