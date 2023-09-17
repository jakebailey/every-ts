import { Command, type CommandClass, Option } from "clipanion";
import { execa } from "execa";

import { ensureDataDir, nodeModulesHashPath, rimraf, tryStat, tsDir } from "./common.js";
import { build } from "./repo.js";

// TODO: add origin/ if needed

const actions = ["bad", "good", "skip", "new", "old", "start", "reset"];

export const bisectActionCommands: CommandClass[] = actions.map((action) => {
    return class extends Command {
        static override paths: string[][] = [[`bisect`, action]];
        args = Option.Proxy();

        override async execute(): Promise<number | void> {
            await resetTypeScript("node_modules");
            await execa("git", ["bisect", action, ...this.args], { cwd: tsDir, stdio: "inherit" });
            await build();
        }
    };
});

export class Switch extends Command {
    static override paths = [[`switch`]];

    ref = Option.String();

    override async execute(): Promise<number | void> {
        await resetTypeScript("node_modules");
        await execa("git", ["switch", "--detach", this.ref], { cwd: tsDir });
        await build();
    }
}
export class Fetch extends Command {
    static override paths = [[`fetch`]];

    override async execute(): Promise<number | void> {
        await ensureRepo();
        await execa("git", ["fetch", "--all", "--tags"], { cwd: tsDir });
    }
}

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
        await rimraf(nodeModulesHashPath);
    }
}
