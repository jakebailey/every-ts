import { Command, Option } from "clipanion";
import { execa } from "execa";

import { tsDir } from "./common.js";
import { build, cleanTypeScript } from "./typescript.js";

export class BisectStart extends Command {
    static override paths = [[`bisect`, `start`]];

    override async execute(): Promise<number | void> {
        await execa("git", ["bisect", "start"], { cwd: tsDir });
    }
}

export class Switch extends Command {
    static override paths = [[`switch`]];

    ref = Option.String();

    override async execute(): Promise<number | void> {
        await cleanTypeScript(true);
        await execa("git", ["switch", "--detach", this.ref], { cwd: tsDir });
        await build();
    }
}
