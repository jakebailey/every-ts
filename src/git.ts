import { Command, Option } from "clipanion";
import { execa } from "execa";

import {
    BaseCommand,
    buildCommitHashPath,
    ensureDataDir,
    ExitError,
    nodeModulesHashPath,
    rimraf,
    tryStat,
    tsDir,
} from "./common.js";
import { build } from "./repo.js";

const actionsWithSideEffects = new Set(["start", "reset", "bad", "good", "new", "old", "skip", "replay"]);

export class Bisect extends BaseCommand {
    static override paths = [[`bisect`]];

    static override usage = Command.Usage({
        description: `git bisect`,
    });

    subcommand = Option.String({ required: true });
    args = Option.Proxy();

    override async execute(): Promise<number | void> {
        let revs = [...this.args];

        switch (this.subcommand) {
            case "bad":
            case "good":
            case "new":
            case "old":
            case "skip":
                revs = await Promise.all(revs.map((r) => findRev(r)));
                break;
        }

        await ensureRepo();

        if (await isBisecting() && actionsWithSideEffects.has(this.subcommand)) {
            await resetTypeScript("node_modules", "built");
        }

        await execa("git", ["bisect", this.subcommand, ...revs], { cwd: tsDir, stdio: "inherit" });
        await build();
    }
}

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

export class BisectRun extends BaseCommand {
    static override paths = [[`bisect`, `run`]];

    static override usage = Command.Usage({
        description: `git bisect run`,
    });

    args = Option.Proxy({ required: 1 });

    override async execute(): Promise<number | void> {
        await ensureRepo();

        if (!await isBisecting()) {
            throw new ExitError("Not bisecting");
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

export class Switch extends BaseCommand {
    static override paths = [[`switch`]];

    rev = Option.String();

    override async execute(): Promise<number | void> {
        await ensureRepo();
        const current = await revParse("HEAD");
        const target = await findRev(this.rev, true);

        if (current === target) {
            return;
        }

        await resetTypeScript("node_modules", "built");
        await execa("git", ["switch", "--detach", await findRev(this.rev)], { cwd: tsDir, stdio: "inherit" });
        await build();
    }
}

export class Fetch extends BaseCommand {
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

async function findRev(rev: string, toHash = false) {
    const cancidates = [
        `origin/${rev}`,
        `release-${rev}`,
        `origin/release-${rev}`,
        `v${rev}`,
        rev, // Try this last, so we refer to newer fetched revs first.
    ];

    for (const candidate of cancidates) {
        try {
            const hash = await revParse(candidate);
            if (toHash) {
                return hash;
            }
            console.log(`Converted ${rev} to ${candidate}`);
            return candidate;
        } catch {
            // ignore
        }
    }

    throw new ExitError(`Could not find ${rev}`);
}

async function revParse(rev: string) {
    const { stdout } = await execa("git", ["rev-parse", rev], { cwd: tsDir });
    return stdout;
}
