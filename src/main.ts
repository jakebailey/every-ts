import { Builtins, Cli } from "clipanion";

import { bisectActionCommands, Switch } from "./git.js";
import { Fetch } from "./typescript.js";

const cli = new Cli({
    binaryName: "ts-bisect",
    enableCapture: true,
});

cli.register(Builtins.HelpCommand);
for (const command of bisectActionCommands) {
    cli.register(command);
}
cli.register(Switch);
cli.register(Fetch);

void cli.runExit(process.argv.slice(2));
