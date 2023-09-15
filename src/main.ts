import { Builtins, Cli } from "clipanion";

import { bisectActionCommands, Switch } from "./git.js";
import { Fetch } from "./repo.js";
import { Tsc } from "./typescript.js";

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
cli.register(Tsc);

void cli.runExit(process.argv.slice(2));
