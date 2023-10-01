import { Command, type CommandClass, Option } from "clipanion";

import { buildCommitHashPath, ensureDataDir, execa, nodeModulesHashPath, rimraf, tryStat, tsDir } from "./common.js";
import { build } from "./repo.js";

const actionsWithSideEffects = ["start", "reset", "bad", "good", "new", "old", "skip", "replay"];
const actionsWithoutSideEffects = ["terms", "visualize", "view", "log"];
const actions = [...actionsWithSideEffects, ...actionsWithoutSideEffects];

export const bisectActionCommands: CommandClass[] = actions.map((action) => {
    return class extends Command {
        static override paths: string[][] = [[`bisect`, action]];

        static override usage = Command.Usage({
            description: `git bisect ${action}`,
        });

        args = Option.Proxy();

        override async execute(): Promise<number | void> {
            let refs = [...this.args];

            switch (action) {
                case "bad":
                case "good":
                case "new":
                case "old":
                case "skip":
                    refs = await Promise.all(refs.map((r) => fixRef(r)));
                    break;
            }

            await ensureRepo();

            if (await isBisecting() && actionsWithSideEffects.includes(action)) {
                await resetTypeScript("node_modules", "built");
            }

            await execa("git", ["bisect", action, ...refs], { cwd: tsDir, stdio: "inherit" });
            await build();
        }
    };
});

async function isBisecting() {
    try {
        const { stdout } = await execa("git", ["bisect", "log"], { cwd: tsDir });
        const lines = stdout.split(/\r?\n/);
        if (lines.some((v) => v.startsWith("# first "))) {
            return false;
        }
        const actions = lines.filter((v) => !v.startsWith("#"));
        return actions.length >= 3;
    } catch {
        return false;
    }
}

export class BisectRun extends Command {
    static override paths = [[`bisect`, `run`]];

    static override usage = Command.Usage({
        description: `git bisect run`,
    });

    args = Option.Proxy({ required: 1 });

    override async execute(): Promise<number | void> {
        await ensureRepo();

        if (!await isBisecting()) {
            throw new Error("Not bisecting");
        }

        const { stdout: termGood } = await execa("git", ["bisect", "terms", "--term-good"], { cwd: tsDir });
        const { stdout: termBad } = await execa("git", ["bisect", "terms", "--term-bad"], { cwd: tsDir });

        while (await isBisecting()) {
            await resetTypeScript("node_modules", "built");
            await build();

            const result = await execa(this.args[0], this.args.slice(1), { reject: false, stdio: "inherit" });
            await resetTypeScript("node_modules", "built");
            if (result.exitCode === 0) {
                await execa("git", ["bisect", termGood], { cwd: tsDir, stdio: "inherit" });
            } else if (result.exitCode === 125) {
                await execa("git", ["bisect", "skip"], { cwd: tsDir, stdio: "inherit" });
            } else if (result.exitCode < 128) {
                await execa("git", ["bisect", termBad], { cwd: tsDir, stdio: "inherit" });
            } else {
                throw result;
            }
        }
    }
}

export class Switch extends Command {
    static override paths = [[`switch`]];

    ref = Option.String();

    override async execute(): Promise<number | void> {
        await ensureRepo();
        const currentRef = await parseRef("HEAD");
        const targetRef = await fixRef(this.ref, true);

        if (currentRef === targetRef) {
            return;
        }

        await resetTypeScript("node_modules", "built");
        await execa("git", ["switch", "--detach", await fixRef(this.ref)], { cwd: tsDir, stdio: "inherit" });
        await build();
    }
}

export class Fetch extends Command {
    static override paths = [[`fetch`]];

    override async execute(): Promise<number | void> {
        await ensureRepo();
        await execa("git", ["fetch", "--all", "--tags"], { cwd: tsDir });
    }
}

let repoCloned = false;

export async function ensureRepo() {
    if (repoCloned) {
        return;
    }

    await ensureDataDir();
    const stat = await tryStat(tsDir);
    if (!stat?.isDirectory()) {
        await execa("git", ["clone", "--filter=blob:none", "https://github.com/microsoft/TypeScript.git", tsDir], {
            stdio: "inherit",
        });
    }

    repoCloned = true;
}

export async function resetTypeScript(...keep: string[]) {
    const excludes = [];
    for (const exclude of keep ?? []) {
        excludes.push("-e", exclude);
    }
    await execa("git", ["clean", "-fdx", ...excludes], { cwd: tsDir });
    await execa("git", ["reset", "--hard", "HEAD"], { cwd: tsDir });

    if (!keep?.includes("node_modules")) {
        await rimraf(nodeModulesHashPath);
    }
    await rimraf(buildCommitHashPath);
}

async function fixRef(ref: string, toHash = false) {
    const possibleRefs = [
        ref,
        `origin/${ref}`,
        `release-${ref}`,
        `origin/release-${ref}`,
        `v${ref}`,
    ];

    for (const possibleRef of possibleRefs) {
        try {
            const hash = await parseRef(possibleRef);
            if (toHash) {
                return hash;
            }
            return possibleRef;
        } catch {
            // ignore
        }
    }

    throw new Error(`Could not find ref ${ref}`);
}

async function parseRef(ref: string) {
    const { stdout } = await execa("git", ["rev-parse", ref], { cwd: tsDir });
    return stdout;
}
