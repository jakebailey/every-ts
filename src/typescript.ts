import { Command, Option } from "clipanion";
import { execa } from "execa";

import { BaseCommand, getPATHWithBinDir } from "./common.js";
import { ensureBuilt, getPaths } from "./repo.js";

export class Tsc extends BaseCommand {
    static override paths: string[][] = [[`tsc`]];

    static override usage = Command.Usage({
        description: `Runs "tsc".`,
    });

    args = Option.Proxy();

    override async execute(): Promise<number | void> {
        await ensureBuilt();
        const { tsc } = getPaths();
        const result = await execa(`node`, [tsc, ...this.args], { stdio: `inherit`, reject: false });
        return result.exitCode;
    }
}

export class Exec extends BaseCommand {
    static override paths: string[][] = [[`exec`]];

    static override usage = Command.Usage({
        description: `Runs the provided command in with TypeScript's executables on PATH.`,
    });

    args = Option.Proxy({ required: 1 });

    override async execute(): Promise<number | void> {
        await ensureBuilt();
        const result = await execa(
            this.args[0],
            this.args.slice(1),
            { stdio: `inherit`, reject: false, env: { PATH: getPATHWithBinDir() } },
        );
        return result.exitCode;
    }
}
