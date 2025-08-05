import { execSync } from "child_process";
import rcedit from "rcedit";
import { existsSync, unlinkSync, mkdirSync, rmSync, cpSync } from "fs";
import { createWriteStream } from "fs";
import archiver from "archiver";
import path from "path";
import readline from "readline";

const APP_NAME = "zerx";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log(`🚀 Building ${APP_NAME}...\n`);

const VERSION = await new Promise((resolve) => {
  rl.question("Enter version number (e.g., 1.0.0): ", (answer) => {
    const version = answer.trim() || "1.0.0";
    rl.close();
    resolve(version);
  });
});

console.log(`\n📦 Building ${APP_NAME} v${VERSION}...`);

const buildDir = "build";
const exeName = `${APP_NAME}.exe`;
const exePath = path.join(buildDir, exeName);
const zipName = `${APP_NAME}-v${VERSION}-windows-x64.zip`;
const zipPath = zipName;

if (existsSync(buildDir)) {
  try {
    rmSync(buildDir, { recursive: true, force: true });
    console.log("Removed existing build directory");
  } catch (error) {
    console.log("Could not remove existing build directory");
    console.log("Please close any running instances and try again");
    process.exit(1);
  }
}

if (existsSync(zipPath)) {
  try {
    unlinkSync(zipPath);
    console.log("Removed existing zip file");
  } catch (error) {
    console.log("Could not remove existing zip file");
  }
}

mkdirSync(buildDir, { recursive: true });

try {
  execSync(
    `bun build src/index.ts --compile --outfile ${exePath} --target bun-windows-x64`,
    { stdio: "inherit" }
  );
  console.log("Executable built successfully");
} catch (error) {
  console.error("Failed to build executable:", error.message);
  process.exit(1);
}

const iconPath = "assets/icon.ico";
if (!existsSync(iconPath)) {
  console.log(`Warning: Icon file not found at ${iconPath}`);
  console.log("Skipping icon setting...");
} else {
  console.log("Adding icon and metadata...");

  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    await rcedit(exePath, {
      icon: iconPath,
      "version-string": {
        FileDescription: "Zerx Emulator Manager",
        ProductName: "Zerx",
        CompanyName: "nopjo",
        FileVersion: VERSION,
        ProductVersion: VERSION,
        OriginalFilename: exeName,
        InternalName: "Zerx",
      },
    });

    console.log("Icon and metadata added!");
  } catch (error) {
    console.error("Failed to add resources:", error.message);
    console.log("The executable was built but without custom icon/metadata");
  }
}

const scriptsPath = "scripts";
const targetScriptsPath = path.join(buildDir, "scripts");

if (existsSync(scriptsPath)) {
  try {
    cpSync(scriptsPath, targetScriptsPath, { recursive: true });
    console.log("Scripts folder copied successfully");
  } catch (error) {
    console.error("Failed to copy scripts folder:", error.message);
    console.log("Continuing without scripts folder...");
  }
} else {
  console.log("Warning: Scripts folder not found, skipping copy");
}

console.log("Creating zip file...");

const output = createWriteStream(zipPath);
const archive = archiver("zip", {
  zlib: { level: 9 },
});

output.on("close", function () {
  console.log(`✅ Release package created: ${zipName}`);
  console.log(`   Size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Version: ${VERSION}`);
  console.log("🎉 Build complete!");
});

archive.on("error", function (err) {
  console.error("Failed to create zip file:", err.message);
  process.exit(1);
});

archive.pipe(output);

archive.directory(buildDir, false);

archive.finalize();
