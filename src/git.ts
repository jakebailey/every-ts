import { Command, type CommandClass, Option } from "clipanion";
import { execa } from "execa";

import { tsDir } from "./common.js";
import { build, cleanTypeScript } from "./typescript.js";

async function isBisecting() {
    try {
        const { stdout } = await execa("git", ["bisect", "log"], { cwd: tsDir });
        const lines = stdout.split(/\r?\n/);
        if (lines.some((v) => v.startsWith("# first "))) {
            return false;
        }
        const actions = lines.filter((v) => !v.startsWith("#"));
        return actions.length >= 3;
    } catch {
        return false;
    }
}

const actions = ["bad", "good", "skip", "new", "old", "start", "reset"];

export const bisectActionCommands: CommandClass[] = actions.map((action) => {
    return class extends Command {
        static override paths: string[][] = [[`bisect`, action]];
        args = Option.Rest();

        override async execute(): Promise<number | void> {
            await cleanTypeScript(true);
            await execa("git", ["bisect", action, ...this.args], { cwd: tsDir, stdio: "inherit" });
            if (await isBisecting()) {
                await build();
            }
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
