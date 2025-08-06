import colors from "picocolors";

interface LogOptions {
  spaceBefore?: boolean;
  spaceAfter?: boolean;
  indent?: number;
  prefix?: string;
}

export class Logger {
  private static getIndent(level: number): string {
    return "   ".repeat(level);
  }

  private static log(
    message: string,
    colorFn: (text: string) => string,
    options: LogOptions = {}
  ): void {
    const {
      spaceBefore = false,
      spaceAfter = false,
      indent = 0,
      prefix = "",
    } = options;

    if (spaceBefore) console.log();

    const indentStr = this.getIndent(indent);
    const prefixStr = prefix ? `${prefix} ` : "";

    console.log(`${indentStr}${prefixStr}${colorFn(message)}`);

    if (spaceAfter) console.log();
  }

  static success(message: string, options?: LogOptions): void {
    this.log(message, colors.green, options);
  }

  static error(message: string, options?: LogOptions): void {
    this.log(message, colors.red, options);
  }

  static warning(message: string, options?: LogOptions): void {
    this.log(message, colors.yellow, options);
  }

  static info(message: string, options?: LogOptions): void {
    this.log(message, colors.cyan, options);
  }

  static muted(message: string, options?: LogOptions): void {
    this.log(message, colors.gray, options);
  }

  static normal(message: string, options?: LogOptions): void {
    this.log(message, colors.white, options);
  }

  static bold(message: string, options?: LogOptions): void {
    this.log(message, colors.bold, options);
  }

  static blue(message: string, options?: LogOptions): void {
    this.log(message, colors.blue, options);
  }

  static title(
    message: string,
    options?: Omit<LogOptions, "spaceBefore" | "spaceAfter">
  ): void {
    this.log(message, (text) => colors.cyan(colors.bold(text)), {
      spaceBefore: true,
      spaceAfter: true,
      ...options,
    });
  }

  static subtitle(message: string, options?: LogOptions): void {
    this.log(message, colors.cyan, options);
  }

  static deviceFound(
    deviceId: string,
    model?: string,
    options?: LogOptions
  ): void {
    const deviceInfo = model ? `${deviceId} (${model})` : deviceId;
    this.success(`• ${deviceInfo} - Found`, { indent: 1, ...options });
  }

  static deviceMissing(
    deviceId: string,
    model?: string,
    options?: LogOptions
  ): void {
    const deviceInfo = model ? `${deviceId} (${model})` : deviceId;
    this.warning(`• ${deviceInfo} - Missing`, { indent: 1, ...options });
  }

  static deviceError(
    deviceId: string,
    model?: string,
    options?: LogOptions
  ): void {
    const deviceInfo = model ? `${deviceId} (${model})` : deviceId;
    this.error(`• ${deviceInfo}`, { indent: 1, ...options });
  }

  static fileItem(
    index: number,
    icon: string,
    name: string,
    type: string,
    options?: LogOptions
  ): void {
    const indexStr = colors.gray(index.toString().padStart(2));
    const nameStr = colors.white(name);
    console.log(`   ${indexStr}. ${icon} ${nameStr} ${type}`);
  }

  static path(label: string, path: string, options?: LogOptions): void {
    this.muted(`   ${label}: ${path}`, options);
  }

  static separator(char: string = "─", length: number = 60): void {
    console.log(colors.white(char.repeat(length)));
  }

  static currentDirectory(path: string): void {
    console.log();
    console.log(colors.cyan(`Current Directory: ${colors.white(path)}`));
  }

  static emptyDirectory(): void {
    this.warning("Directory is empty (or newly created)");
  }

  static totalItems(count: number): void {
    console.log();
    this.muted(`Total: ${count} items`);
  }

  static operationResult(
    success: number,
    failed: number,
    operation: string = "operation"
  ): void {
    console.log();
    if (failed === 0) {
      this.success(
        `Successfully completed ${operation} on all ${success} device(s)!`
      );
    } else {
      this.warning(`Completed: ${success} successful, ${failed} failed`);
    }
  }

  static space(): void {
    console.log();
  }

  static divider(): void {
    console.log();
    console.log(colors.gray("─".repeat(50)));
    console.log();
  }
}
