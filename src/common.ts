import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { execa as _execa, type Options as ExecaOptions } from "execa";

const __filename = url.fileURLToPath(new URL(import.meta.url));
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "..");
const dataDir = path.join(packageRoot, ".data");
export const tsDir = path.join(dataDir, "TypeScript");
export const fnmDir = path.join(dataDir, "fnm");
export const fnmExe = path.join(fnmDir, process.platform === "win32" ? "fnm.exe" : "fnm");
export const nodeModulesHashPath = path.join(dataDir, "node_modules.hash");

export async function tryStat(p: string) {
    try {
        return await fs.promises.stat(p);
    } catch {
        return undefined;
    }
}

export async function ensureDataDir() {
    await fs.promises.mkdir(dataDir, { recursive: true });
}

// TODO: make a flag?
const verbose = true;

export function execa(file: string, args?: readonly string[], options?: ExecaOptions) {
    return _execa(file, args, { ...options, verbose });
}

export { type Options as ExecaOptions } from "execa";

export async function hashFile(p: string) {
    const contents = await fs.promises.readFile(p);
    return crypto.createHash("sha256").update(contents).digest("hex");
}

export function rimraf(p: fs.PathLike) {
    return fs.promises.rm(p, { recursive: true, force: true, maxRetries: process.platform === "win32" ? 10 : 0 });
}
