import { Command, Option } from "clipanion";
import { execa } from "execa";

import { getTscPath } from "./repo.js";

export class Tsc extends Command {
    static override paths: string[][] = [[`tsc`]];
    args = Option.Proxy();

    override async execute(): Promise<number | void> {
        await execa("node", [getTscPath(), ...this.args], { stdio: "inherit" });
    }
}
