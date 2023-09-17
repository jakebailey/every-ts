import { Command, type CommandClass, Option } from "clipanion";

import { execa, tsDir } from "./common.js";
import { build, cleanTypeScript, ensureRepo } from "./repo.js";

// TODO: add origin/ if needed

const actions = ["bad", "good", "skip", "new", "old", "start", "reset"];

export const bisectActionCommands: CommandClass[] = actions.map((action) => {
    return class extends Command {
        static override paths: string[][] = [[`bisect`, action]];
        args = Option.Proxy();

        override async execute(): Promise<number | void> {
            await cleanTypeScript(true);
            await execa("git", ["bisect", action, ...this.args], { cwd: tsDir, stdio: "inherit" });
            await build();
        }
    };
});

export class Switch extends Command {
    static override paths = [[`switch`]];

    ref = Option.String();

    override async execute(): Promise<number | void> {
        await cleanTypeScript(true);
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
