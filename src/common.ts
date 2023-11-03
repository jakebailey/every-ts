import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { Command } from "clipanion";
import { execa } from "execa";

const __filename = url.fileURLToPath(new URL(import.meta.url));
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, `..`);
const dataDir = path.join(packageRoot, `.data`);
export const tsDir = path.join(dataDir, `TypeScript`);
export const fnmDir = path.join(dataDir, `fnm`);
export const binDir = path.join(dataDir, `bin`);
export const nodeModulesHashPath = path.join(dataDir, `node_modules.hash`);
export const buildCommitHashPath = path.join(dataDir, `builtCommit.hash`);

export function getPackageVersion() {
    return JSON.parse(fs.readFileSync(path.join(packageRoot, `package.json`), `utf8`)).version;
}

export function getPATHWithBinDir() {
    return `${binDir}${path.delimiter}${process.env[`PATH`]}`;
}

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

export async function hashFile(p: string) {
    const contents = await fs.promises.readFile(p);
    return crypto.createHash(`sha256`).update(contents).digest(`hex`);
}

export function rimraf(p: fs.PathLike) {
    return fs.promises.rm(p, { recursive: true, force: true, maxRetries: process.platform === `win32` ? 10 : 0 });
}

export class ExitError extends Error {
    constructor(message: string, public readonly exitCode = 1) {
        super(message);
    }
}

export abstract class BaseCommand extends Command {
    override async execute(): Promise<number | void> {
        try {
            return await this.executeOrThrow();
        } catch (e) {
            if (e instanceof ExitError) {
                this.context.stderr.write(`${e.message}\n`);
                return e.exitCode;
            }
            throw e;
        }
    }

    abstract executeOrThrow(): Promise<number | void>;
}

export async function revParse(rev: string) {
    const { stdout } = await execa(`git`, [`rev-parse`, rev], { cwd: tsDir });
    return stdout;
}
