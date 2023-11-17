import fs from "node:fs";

import { Command, Option } from "clipanion";
import { execa } from "execa";
import fetch from "node-fetch";
import semver from "semver";

import {
    BaseCommand,
    buildCommitHashPath,
    ensureDataDir,
    ExitError,
    getPATHWithBinDir,
    nodeModulesHashPath,
    revParse,
    rimraf,
    tryStat,
    tsDir,
} from "./common.js";
import { ensureBuilt } from "./repo.js";

const actionsAcceptingRevs = new Set([`start`, `bad`, `good`, `new`, `old`, `skip`]);
const actionsWithSideEffects = new Set([`reset`, `replay`, ...actionsAcceptingRevs]);

export class Bisect extends BaseCommand {
    static override paths = [[`bisect`]];

    static override usage = Command.Usage({
        description: `Wraps "git bisect".`,
    });

    subcommand = Option.String({ required: true });
    args = Option.Proxy();

    override async executeOrThrow(): Promise<number | void> {
        let startArgs: string[] = [];
        let revs;
        let endArgs: string[] = [];

        const dashDashIndex = this.args.indexOf(`--`);
        if (this.subcommand === `start` && dashDashIndex !== -1) {
            endArgs = this.args.slice(dashDashIndex);
            revs = this.args.slice(0, dashDashIndex);
            const nonFlagIndex = revs.findIndex((v) => !v.startsWith(`--`));
            if (nonFlagIndex !== -1) {
                startArgs = revs.slice(0, nonFlagIndex);
                revs = revs.slice(nonFlagIndex);
            }
        } else {
            revs = [...this.args];
        }

        if (actionsAcceptingRevs.has(this.subcommand)) {
            revs = await Promise.all(revs.map((r) => findRev(r)));
        }

        await ensureRepo();

        let shouldReset = false;
        const bisectInfo = await getBisectInfo();

        if (this.subcommand === `reset`) {
            shouldReset = true;
        } else if (this.subcommand === `start` && revs.length >= 2) {
            shouldReset = true;
        } else if (bisectInfo?.terms.size === 2) {
            shouldReset = true;
        } else {
            if (
                bisectInfo
                && actionsWithSideEffects.has(this.subcommand)
                && !bisectInfo.terms.has(this.subcommand)
                && bisectInfo.terms.size === 1
            ) {
                shouldReset = true;
            }
        }

        if (shouldReset) {
            await resetTypeScript(`node_modules`, `built`);
        }

        const result = await execa(
            `git`,
            [`bisect`, this.subcommand, ...startArgs, ...revs, ...endArgs],
            { cwd: tsDir, stdio: `inherit`, reject: false },
        );
        if (result.exitCode !== 0) {
            return result.exitCode;
        }
        await ensureBuilt();
    }
}

async function getBisectInfo() {
    try {
        const { stdout } = await execa(`git`, [`bisect`, `log`], { cwd: tsDir });
        const lines = stdout.split(/\r?\n/);
        const done = lines.some((v) => v.startsWith(`# first `));
        // Info lines look like "# bad: ...", "# good: ...", "# skip: ...", "# new: ...", "# old: ...", "# status: ..."
        const terms = new Set(
            lines
                .filter((v) => v.startsWith(`# `))
                .map((v) => v.split(` `)[1].slice(0, -1))
                .filter((v) => v !== `status` && v !== `skip`),
        );
        return { done, terms };
    } catch {
        return undefined;
    }
}

export class BisectRun extends BaseCommand {
    static override paths = [[`bisect`, `run`]];

    static override usage = Command.Usage({
        description: `Wraps "git bisect run".`,
    });

    args = Option.Proxy({ required: 1 });

    override async executeOrThrow(): Promise<number | void> {
        await ensureRepo();

        if (!await getBisectInfo()) {
            throw new ExitError(`Not bisecting`);
        }

        const { stdout: termGood } = await execa(`git`, [`bisect`, `terms`, `--term-good`], { cwd: tsDir });
        const { stdout: termBad } = await execa(`git`, [`bisect`, `terms`, `--term-bad`], { cwd: tsDir });

        while (!(await getBisectInfo())?.done) {
            await resetTypeScript(`node_modules`, `built`);
            await ensureBuilt();

            const result = await execa(
                this.args[0],
                this.args.slice(1),
                { stdio: `inherit`, reject: false, env: { PATH: getPATHWithBinDir() } },
            );
            await resetTypeScript(`node_modules`, `built`);

            let bResult;
            if (result.exitCode === 0) {
                console.log(`git bisect ${termGood}`);
                bResult = await execa(`git`, [`bisect`, termGood], { cwd: tsDir, stdio: `inherit`, reject: false });
            } else if (result.exitCode === 125) {
                console.log(`git bisect skip`);
                bResult = await execa(`git`, [`bisect`, `skip`], { cwd: tsDir, stdio: `inherit`, reject: false });
            } else if (result.exitCode < 128) {
                console.log(`git bisect ${termBad}`);
                bResult = await execa(`git`, [`bisect`, termBad], { cwd: tsDir, stdio: `inherit`, reject: false });
            } else {
                throw result;
            }

            if (bResult.exitCode !== 0) {
                return bResult.exitCode;
            }
        }
    }
}

export class Switch extends BaseCommand {
    static override paths = [[`switch`], [`checkout`], [`clone`], Command.Default];

    static override usage = Command.Usage({
        description: `Switches to the provided rev and builds it.`,
    });

    rev = Option.String({ required: false });

    override async executeOrThrow(): Promise<number | void> {
        await ensureRepo();

        const target = await findRev(this.rev ?? `main`, true);
        if (fs.existsSync(buildCommitHashPath)) {
            const current = await revParse(`HEAD`);

            if (current === target) {
                return;
            }
        }

        await resetTypeScript(`node_modules`, `built`);
        const result = await execa(`git`, [`switch`, `--detach`, target], {
            cwd: tsDir,
            stdio: `inherit`,
            reject: false,
        });
        if (result.exitCode !== 0) {
            return result.exitCode;
        }
        await ensureBuilt();
    }
}

export class Fetch extends BaseCommand {
    static override paths = [[`fetch`]];

    static override usage = Command.Usage({
        description: `Fetches the latest info for the TypeScript checkout.`,
    });

    override async executeOrThrow(): Promise<number | void> {
        await ensureRepo();
        await execa(`git`, [`fetch`, `--all`, `--tags`], { cwd: tsDir });
        // This will usually be a noop, but if this is what's used to fetch the first time,
        // it will be unbuilt which is less than good.
        await ensureBuilt();
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
        console.log(`Cloning TypeScript; this may take a bit...`);
        const args = [`clone`, `--filter=blob:none`];
        if (process.platform === `win32`) {
            args.push(`-c`, `core.longpaths=true`);
        }
        args.push(`https://github.com/microsoft/TypeScript.git`, tsDir);
        await execa(`git`, args, { stdio: `inherit` });
    }

    repoCloned = true;
}

export async function resetTypeScript(...keep: string[]) {
    const excludes = [];
    for (const exclude of keep) {
        excludes.push(`-e`, exclude);
    }
    await execa(`git`, [`clean`, `-fdx`, ...excludes], { cwd: tsDir });
    await execa(`git`, [`reset`, `--hard`, `HEAD`], { cwd: tsDir });

    if (!keep?.includes(`node_modules`)) {
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
            if (rev !== candidate) {
                console.log(`Resolved ${rev} to ${candidate}`);
            }
            return candidate;
        } catch {
            // ignore
        }
    }

    if (rev.includes(`-dev.`)) {
        const version = semver.parse(rev)?.format();
        if (version) {
            const response = await fetch(`https://registry.npmjs.org/typescript/${version}`);
            if (response.ok) {
                const { gitHead } = (await response.json()) as { gitHead?: string; };
                if (gitHead) {
                    console.log(`Resolved ${rev} to ${gitHead}`);
                    return gitHead;
                } else {
                    console.error(`${version} is too old to have commit metadata and cannot be resolved`);
                }
            }
        }
    }

    throw new ExitError(`Could not find ${rev}`);
}
