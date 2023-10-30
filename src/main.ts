import { Builtins, Cli } from "clipanion";

import { getPackageVersion } from "./common.js";
import { Bisect, BisectRun, Switch } from "./git.js";
import { Fetch } from "./git.js";
import { Dir, Exec, Tsc, Tsdk } from "./typescript.js";

const cli = new Cli({
    binaryLabel: `every-ts`,
    binaryName: `every-ts`,
    binaryVersion: getPackageVersion(),
    enableCapture: true,
});

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(Bisect);
cli.register(BisectRun);
cli.register(Switch);
cli.register(Fetch);
cli.register(Tsc);
cli.register(Tsdk);
cli.register(Exec);
cli.register(Dir);

void cli.runExit(process.argv.slice(2));
