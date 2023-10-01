import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { Command } from "clipanion";
import { execa as _execa, type Options as ExecaOptions } from "execa";

const __filename = url.fileURLToPath(new URL(import.meta.url));
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "..");
const dataDir = path.join(packageRoot, ".data");
export const tsDir = path.join(dataDir, "TypeScript");
export const fnmDir = path.join(dataDir, "fnm");
export const nodeModulesHashPath = path.join(dataDir, "node_modules.hash");
export const buildCommitHashPath = path.join(dataDir, "builtCommit.hash");

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
    return _execa(file, args, { verbose, ...options });
}

export { type Options as ExecaOptions } from "execa";

export async function hashFile(p: string) {
    const contents = await fs.promises.readFile(p);
    return crypto.createHash("sha256").update(contents).digest("hex");
}

export function rimraf(p: fs.PathLike) {
    return fs.promises.rm(p, { recursive: true, force: true, maxRetries: process.platform === "win32" ? 10 : 0 });
}

export class ExitError extends Error {
    constructor(message: string, public readonly exitCode = 1) {
        super(message);
    }
}

export abstract class BaseCommand extends Command {
    // verbose = Option.Boolean(`-v,--verbose`, false, { description: `Print verbose output` });

    override catch(error: any): Promise<void> {
        if (error instanceof ExitError) {
            this.context.stderr.write(`${error.message}\n`);
            return Promise.resolve<any>(error.exitCode);
        }
        return super.catch(error);
    }
}
