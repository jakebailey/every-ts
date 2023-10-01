import fs from "node:fs";
import path from "node:path";

import { execa } from "execa";

import { buildCommitHashPath, ExitError, hashFile, nodeModulesHashPath, rimraf, tsDir } from "./common.js";
import { runInNode } from "./fnm.js";
import { ensureRepo, resetTypeScript } from "./git.js";

async function getBuildCommand() {
    const dir = await fs.promises.readdir(tsDir);
    let name;
    if (dir.some((v) => v.includes("Herebyfile"))) {
        name = "hereby";
    } else if (dir.some((v) => v.includes("Jakefile"))) {
        name = "jake";
    } else if (dir.some((v) => v.includes("Gulpfile"))) {
        name = "gulp";
    } else {
        throw new ExitError("build command unknown");
    }

    if (process.platform === "win32") {
        name += ".cmd";
    }

    return path.join("node_modules", ".bin", name);
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

    await rimraf(nodeModulesHashPath);
    await rimraf(path.join(tsDir, "node_modules"));
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
    // Not including Gulpfile.mjs; the problem was fixed before that was added.
    for (const file of ["Jakefile.js", "Gulpfile.ts", "Gulpfile.js"]) {
        const p = path.join(tsDir, file);
        if (!fs.existsSync(p)) {
            continue;
        }
        let contents = await fs.promises.readFile(p, "utf8");
        for (const [re, bad, good] of badLocales) {
            contents = contents.replace(re, good);
            await rimraf(path.join(tsDir, "lib", bad));
        }
        await fs.promises.writeFile(p, contents, "utf8");
    }
}

const buildFuncs = [
    async () => {
        const buildCommand = await getBuildCommand();
        await runInNode("20", [buildCommand, "local"], { cwd: tsDir });
        await runInNode("20", [buildCommand, "LKG"], { cwd: tsDir });
    },
    async () => {
        const buildCommand = await getBuildCommand();
        await runInNode("8", [buildCommand, "local"], { cwd: tsDir });
        await runInNode("8", [buildCommand, "LKG"], { cwd: tsDir });
    },
];

async function tryBuildFns() {
    for (const fn of buildFuncs) {
        try {
            try {
                await resetTypeScript("node_modules", "built");
                await fixBuild();
                await fn();
                return;
            } catch {
                // console.log(e);
            }

            await resetTypeScript("node_modules");
            await fixBuild();
            await fn();
            return;
        } catch {
            // console.log(e);
        }
    }
    throw new ExitError("could not build TypeScript");
}

async function tryBuild() {
    await ensureRepo();

    const { stdout: commitHash } = await execa("git", ["rev-parse", "HEAD"], { cwd: tsDir });
    try {
        const contents = await fs.promises.readFile(buildCommitHashPath, "utf8");
        if (contents === commitHash) {
            return;
        }
    } catch {
        await rimraf(buildCommitHashPath);
    }

    let succeeded = false;
    try {
        if (!hasPackageLock() && fs.existsSync(path.join(tsDir, "node_modules"))) {
            try {
                await tryBuildFns();
                succeeded = true;
                return;
            } catch {
                // ignore
            }
        }

        await tryInstall();
        await tryBuildFns();
        succeeded = true;
    } finally {
        if (succeeded) {
            await fs.promises.writeFile(buildCommitHashPath, commitHash, "utf8");
        }
    }
}

// TODO: maintain a file with the last commit hash that was built, like the package-lock.json hash
export async function build() {
    await tryBuild();
    await execa("node", [getTscPath(), "--version"], { stdout: "ignore" });
}

export function getTscPath() {
    const libTsc = path.join(tsDir, "lib", "tsc.js");
    const binTsc = path.join(tsDir, "bin", "tsc.js");
    return fs.existsSync(libTsc) ? libTsc : binTsc;
}
