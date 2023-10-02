import { Builtins, Cli } from "clipanion";

import { getPackageVersion } from "./common.js";
import { Bisect, BisectRun, Switch } from "./git.js";
import { Fetch } from "./git.js";
import { Exec, Tsc } from "./typescript.js";

const cli = new Cli({
    binaryLabel: `every-ts`,
    binaryName: `every-ts`,
    binaryVersion: getPackageVersion(),
    enableCapture: true,
});

cli.register(Builtins.HelpCommand);
cli.register(Bisect);
cli.register(BisectRun);
cli.register(Switch);
cli.register(Fetch);
cli.register(Tsc);
cli.register(Exec);

void cli.runExit(process.argv.slice(2));
