import fs from "node:fs";
import path from "node:path";

import { Command } from "clipanion";
import { execa } from "execa";

import { ensureDataDir, tryStat, tsDir } from "./common.js";
import { runInNode } from "./fnm.js";

let repoCloned = false;

export class Fetch extends Command {
    static override paths = [[`fetch`]];

    override async execute(): Promise<number | void> {
        await ensureRepo();
        await execa("git", ["fetch", "origin"], { cwd: tsDir });
    }
}

async function ensureRepo() {
    if (repoCloned) {
        return;
    }

    await ensureDataDir();
    const stat = await tryStat(tsDir);
    if (!stat?.isDirectory()) {
        console.log("Cloning TypeScript...");
        await execa("git", ["clone", "--filter=blob:none", "https://github.com/microsoft/TypeScript.git", tsDir]);
    }

    repoCloned = true;
}

export async function cleanTypeScript(keepNodeModules?: boolean) {
    await execa("git", keepNodeModules ? ["clean", "-fdx", "-e", "/node_modules"] : ["clean", "-fdx"], { cwd: tsDir });
    await execa("git", ["reset", "--hard", "HEAD"], { cwd: tsDir });
}

async function getBuildCommand() {
    const dir = await fs.promises.readdir(tsDir);
    if (dir.some((v) => v.includes("Herebyfile"))) {
        return "hereby";
    }
    if (dir.some((v) => v.includes("Jakefile"))) {
        return "jake";
    }
    if (dir.some((v) => v.includes("Gulpfile"))) {
        return "gulp";
    }
    throw new Error("build command unknown");
}

async function getCommitDate() {
    const { stdout } = await execa("git", ["log", "-1", "--format=%cI"], { cwd: tsDir });
    return stdout;
}

function hasPackageLock() {
    return fs.existsSync(path.join(tsDir, "package-lock.json"));
}

async function getPackageManagerCommand() {
    const packageJsonContents = await fs.promises.readFile(path.join(tsDir, "package.json"), "utf8");
    const packageJson = JSON.parse(packageJsonContents);
    const packageManager = packageJson?.packageManager;
    if (packageManager) {
        return ["npx", packageManager];
    }
    return ["npm"];
}

async function tryInstall() {
    const packageManagerCommand = await getPackageManagerCommand();

    if (hasPackageLock()) {
        try {
            await runInNode("20", [...packageManagerCommand, "ci"], { cwd: tsDir });
            return;
        } catch {}
    }

    await cleanTypeScript(); // TODO: just delete node modules?
    const commitDate = await getCommitDate();
    await runInNode("20", [...packageManagerCommand, "install", `--before=${commitDate}`], { cwd: tsDir });
}

async function fixBuild() {
    // Early builds of TS were produce on a case-insensitive file system; confusingly
    // the input and output files plus the build config were inconsistent, so we need
    // to fix them up.
    for (const file of ["Jakefile.js", "Gulpfile.ts", "Gulpfile.js"]) {
        const p = path.join(tsDir, file);
        if (!fs.existsSync(p)) {
            continue;
        }
        // TODO: remove out of lib too
        let contents = await fs.promises.readFile(p, "utf8");
        contents = contents.replace(/pt-BR/g, "pt-br");
        contents = contents.replace(/zh-CN/g, "zh-cn");
        contents = contents.replace(/zh-TW/g, "zh-tw");
        await fs.promises.writeFile(p, contents, "utf8");
    }
}

const buildFuncs = [
    // async () => {
    //     const buildCommand = await getBuildCommand();
    //     await runInNode("20", ["npx", buildCommand, "LKG"], { cwd: tsDir });
    // },
    async () => {
        const buildCommand = await getBuildCommand();
        await runInNode("20", ["npx", buildCommand, "local"], { cwd: tsDir });
        await runInNode("20", ["npx", buildCommand, "LKG"], { cwd: tsDir });
    },
    async () => {
        const buildCommand = await getBuildCommand();
        await runInNode("8", ["npx", buildCommand, "local"], { cwd: tsDir });
        // await runInNode("8", ["npm", "run", "build:compiler"], { cwd: tsDir });
        await runInNode("8", ["npx", buildCommand, "LKG"], { cwd: tsDir });
    },
];

async function tryBuildFns() {
    for (const fn of buildFuncs) {
        try {
            await cleanTypeScript(/*keepNodeModules*/ true);
            await fixBuild();
            await fn();
            return;
        } catch {
            // console.log(e);
        }
    }
    throw new Error("could not build TypeScript");
}

async function tryBuild() {
    await ensureRepo();

    if (!hasPackageLock() && fs.existsSync(path.join(tsDir, "node_modules"))) {
        try {
            await tryBuildFns();
            return;
        } catch {
            // console.log(e);
        }
    }

    await tryInstall();
    await tryBuildFns();
}

export async function build() {
    await tryBuild();

    // Make sure it worked.
    const libTsc = path.join(tsDir, "lib", "tsc.js");
    const binTsc = path.join(tsDir, "bin", "tsc.js");
    const outputTsc = fs.existsSync(libTsc) ? libTsc : binTsc;
    // const builtTsc = path.join(tsDir, "built", "local", "tsc.js");
    // const builtTscRelease = path.join(tsDir, "built", "local", "tsc.release.js");
    // const inputTsc = fs.existsSync(builtTscRelease) ? builtTscRelease : builtTsc;

    // const contents1 = await fs.promises.readFile(outputTsc, "utf8");
    // const contents2 = await fs.promises.readFile(inputTsc, "utf8");
    // if (contents1 !== contents2) {
    //     throw new Error(`${outputTsc} does not match ${inputTsc}}`);
    // }

    await execa("node", [outputTsc, "--version"], { stdout: "inherit" });
    console.log("TypeScript built successfully!");
}
