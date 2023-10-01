import fs from "node:fs";
import path from "node:path";

import { ensureDataDir, execa, type ExecaOptions, ExitError, fnmDir, tryStat } from "./common.js";

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

    throw new ExitError(`Unsupported system ${process.platform} ${process.arch}`);
}

let fnmInstalled = false;

export async function ensureFnm() {
    if (fnmInstalled) {
        return;
    }

    await ensureDataDir();
    const stat = await tryStat(fnmDir);
    if (stat?.isDirectory()) {
        return;
    }

    console.log("downloading fnm");
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
        const fnmExe = path.join(fnmDir, "fnm");
        await fs.promises.chmod(fnmExe, 0o755);
    }

    fnmInstalled = true;
    process.env["PATH"] = `${fnmDir}${path.delimiter}${process.env["PATH"]}`;
}

const installedNode = new Set<string>();

export async function runInNode(version: string, command: string[], opts?: ExecaOptions) {
    await ensureFnm();
    if (!installedNode.has(version)) {
        await execa("fnm", ["install", version], { env: { FNM_DIR: fnmDir } });
        installedNode.add(version);
    }

    return run(command, opts);

    // eslint-disable-next-line unicorn/consistent-function-scoping
    function run(command: string[], opts?: ExecaOptions) {
        return execa(
            "fnm",
            ["exec", `--using=${version}`, "--", ...command],
            {
                ...opts,
                env: { ...opts?.env, FNM_DIR: fnmDir },
            },
        );
    }
}
