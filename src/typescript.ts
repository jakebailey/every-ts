import { Option } from "clipanion";
import { execa } from "execa";

import { BaseCommand } from "./common.js";
import { ensureBuilt, getTscPath } from "./repo.js";

export class Tsc extends BaseCommand {
    static override paths: string[][] = [[`tsc`]];
    args = Option.Proxy();

    override async execute(): Promise<number | void> {
        await ensureBuilt();
        const result = await execa("node", [getTscPath(), ...this.args], { stdio: "inherit", reject: false });
        return result.exitCode;
    }
}
