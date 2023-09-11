import { Builtins, Cli } from "clipanion";

import { BisectStart, Switch } from "./git.js";
import { Fetch } from "./typescript.js";

const cli = new Cli({
    binaryName: "ts-bisect",
    enableCapture: true,
});

cli.register(Builtins.HelpCommand);
cli.register(BisectStart);
cli.register(Switch);
cli.register(Fetch);

void cli.runExit(process.argv.slice(2));
