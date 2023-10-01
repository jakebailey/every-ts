import "@cspotcode/source-map-support/register.js";

import { Builtins, Cli } from "clipanion";

import { bisectActionCommands, BisectRun, Switch } from "./git.js";
import { Fetch } from "./git.js";
import { Tsc } from "./typescript.js";

const cli = new Cli({
    binaryName: "ts-bisect",
    enableCapture: true,
});

cli.register(Builtins.HelpCommand);
for (const command of bisectActionCommands) {
    cli.register(command);
}
cli.register(BisectRun);
cli.register(Switch);
cli.register(Fetch);
cli.register(Tsc);

void cli.runExit(process.argv.slice(2));
