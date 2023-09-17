import fs from "node:fs";
import path from "node:path";

import { ensureDataDir, execa, hashFile, nodeModulesHashPath, tryStat, tsDir } from "./common.js";
import { runInNode } from "./fnm.js";

let repoCloned = false;

export async function ensureRepo() {
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

export async function resetTypeScript(...keep: string[]) {
    const excludes = [];
    for (const exclude of keep ?? []) {
        excludes.push("-e", exclude);
    }
    await execa("git", ["clean", "-fdx", ...excludes], { cwd: tsDir });
    await execa("git", ["reset", "--hard", "HEAD"], { cwd: tsDir });

    if (!keep?.includes("node_modules")) {
        await fs.promises.rm(nodeModulesHashPath);
    }
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
        let oldHash: string;
        try {
            oldHash = await fs.promises.readFile(nodeModulesHashPath, "utf8");
        } catch {
            oldHash = "";
        }

        const newHash = await hashFile(path.join(tsDir, "package-lock.json"));
        if (oldHash === newHash) {
            return;
        }

        // TODO: remember previous package-lock.json hash and skip?
        try {
            await runInNode("20", [...packageManagerCommand, "ci"], { cwd: tsDir });
            await fs.promises.writeFile(nodeModulesHashPath, newHash, "utf8");
            return;
        } catch {}
    }

    await fs.promises.rm(nodeModulesHashPath, { force: true, recursive: true });
    await fs.promises.rm(path.join(tsDir, "node_modules"), { recursive: true, force: true });
    const commitDate = await getCommitDate();
    await runInNode("20", [...packageManagerCommand, "install", `--before=${commitDate}`], { cwd: tsDir });
}

const badLocales = [
    [/pt-BR/g, "pt-BR", "pt-br"],
    [/zh-CN/g, "zh-CN", "zh-cn"],
    [/zh-TW/g, "zh-TW", "zh-tw"],
] as const;

async function fixBuild() {
    // Early builds of TS were produced on a case-insensitive file system; confusingly
    // the input and output files plus the build config were inconsistent, so we need
    // to fix them up.
    for (const file of ["Jakefile.js", "Gulpfile.ts", "Gulpfile.js"]) {
        const p = path.join(tsDir, file);
        if (!fs.existsSync(p)) {
            continue;
        }
        let contents = await fs.promises.readFile(p, "utf8");
        for (const [re, bad, good] of badLocales) {
            contents = contents.replace(re, good);
            await fs.promises.rm(path.join(tsDir, "lib", bad), { recursive: true, force: true });
        }
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
            // TODO: don't delete built too, for quicker bisects?
            await resetTypeScript("node_modules");
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
    await execa("node", [getTscPath(), "--version"], { stdout: "inherit" });
    console.log("TypeScript built successfully!");
}

export function getTscPath() {
    const libTsc = path.join(tsDir, "lib", "tsc.js");
    const binTsc = path.join(tsDir, "bin", "tsc.js");
    return fs.existsSync(libTsc) ? libTsc : binTsc;
}
