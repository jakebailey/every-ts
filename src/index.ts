import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { execa } from "execa";

const __filename = url.fileURLToPath(new URL(import.meta.url));

// src or dist
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "..", ".data");

await fs.promises.mkdir(dataDir, { recursive: true });

const checkoutDir = path.resolve(dataDir, "TypeScript");

const fnmDir = path.resolve(dataDir, "fnm");
const fnmExe = path.resolve(fnmDir, process.platform === "win32" ? "fnm.exe" : "fnm");
process.env["FNM_DIR"] = fnmDir;

async function tryStat(p: string) {
    try {
        return await fs.promises.stat(p);
    } catch {
        return undefined;
    }
}

let repoCloned = false;

async function ensureRepo() {
    if (repoCloned) {
        return;
    }

    const stat = await tryStat(checkoutDir);
    if (stat?.isDirectory()) {
        console.log("Updating TypeScript checkout");
        await execa("git", ["fetch", "origin"], { cwd: checkoutDir, stdio: "inherit" });
        return;
    }
    console.log("Cloning TypeScript using a blobless clone");
    await execa("git", ["clone", "--filter=blob:none", "https://github.com/microsoft/TypeScript.git", checkoutDir], {
        stdio: "inherit",
    });

    repoCloned = true;
}

type FnmPlatform = "arm32" | "arm64" | "linux" | "macos" | "windows";

function getPlatform(): FnmPlatform {
    switch (process.platform) {
        case "win32":
            return "windows";
        case "darwin":
            return "macos";
        case "linux":
            switch (process.arch) {
                case "arm":
                    return "arm32";
                case "arm64":
                    return "arm64";
                case "x64":
                    return "linux";
            }
    }

    throw new Error(`Unsupported system ${process.platform} ${process.arch}`);
}

let fnmInstalled = false;

async function ensureFnm() {
    if (fnmInstalled) {
        return;
    }

    const stat = await tryStat(fnmDir);
    if (stat?.isDirectory()) {
        return;
    }

    const fetch = (await import("node-fetch")).default;
    const url = `https://github.com/Schniz/fnm/releases/latest/download/fnm-${getPlatform()}.zip`;
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(Buffer.from(buffer));

    await new Promise<void>((resolve, reject) => {
        zip.extractAllToAsync(fnmDir, undefined, undefined, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });

    if (process.platform !== "win32") {
        await fs.promises.chmod(fnmExe, 0o755);
    }

    fnmInstalled = true;
}

async function runInNode(version: string, command: string[]) {
    await ensureFnm();
    await execa(fnmExe, ["install", version], { env: { FNM_DIR: fnmDir } });
    return execa(fnmExe, ["exec", "--", ...command], { env: { FNM_DIR: fnmDir } });
}

await ensureRepo();
await runInNode("12", ["node", "--version"]);
