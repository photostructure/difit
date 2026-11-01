import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let directory: string;
let entrypoint: string;
let revisions: string[];

function withoutGitEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => !key.toUpperCase().startsWith('GIT_')),
  );
}

async function compile(directoryName: string): Promise<void> {
  const source = join(repository, 'src', directoryName);
  for (const item of await readdir(source, { withFileTypes: true })) {
    if (item.isDirectory()) {
      await compile(join(directoryName, item.name));
    } else if (
      item.name.endsWith('.ts') &&
      !item.name.endsWith('.test.ts') &&
      !item.name.endsWith('.d.ts')
    ) {
      const destination = join(directory, 'dist', directoryName, item.name.replace(/\.ts$/, '.js'));
      await mkdir(dirname(destination), { recursive: true });
      const result = ts.transpileModule(await readFile(join(source, item.name), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      });
      await writeFile(destination, result.outputText);
    }
  }
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'difit-cli-protocol-'));
  await symlink(join(repository, 'node_modules'), join(directory, 'node_modules'), 'junction');
  await writeFile(
    join(directory, 'package.json'),
    await readFile(join(repository, 'package.json')),
  );
  for (const folder of ['cli', 'server', 'types', 'utils']) await compile(folder);
  entrypoint = join(directory, 'dist/cli/index.js');
  // Hook Git variables must not redirect fixture setup into the caller's repository.
  const fixtureEnvironment = {
    ...withoutGitEnvironment(process.env),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_SYSTEM: devNull,
  };
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: directory, env: fixtureEnvironment, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'CLI protocol fixture');
  git('config', 'user.email', 'cli@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  for (let index = 0; index < 3; index += 1) {
    await writeFile(join(directory, 'fixture.txt'), `revision ${index}\n`);
    git('add', 'fixture.txt');
    git('-c', `core.hooksPath=${devNull}`, 'commit', '-qm', `fixture ${index}`);
  }
  revisions = [git('rev-parse', 'HEAD~1'), git('rev-parse', 'HEAD~2')];
}, 30000);

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

function launch(
  args: string[],
  readySignal?: 'SIGINT' | 'SIGTERM',
  environment: Record<string, string> = {},
) {
  const child = spawn(process.execPath, [entrypoint, ...args], {
    cwd: directory,
    env: {
      ...withoutGitEnvironment(process.env),
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_SYSTEM: devNull,
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let signalled = false;
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
    // Signal from the complete readiness record, without a polling or timer grace period.
    if (
      readySignal &&
      !signalled &&
      stdout
        .split('\n')
        .slice(0, -1)
        .some((line) => line.includes('"type":"server.ready"'))
    ) {
      signalled = true;
      child.kill(readySignal);
    }
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const closed = new Promise<number | null>((resolveClose, reject) => {
    child.once('error', reject);
    child.once('close', resolveClose);
  });
  return { child, closed, output: () => ({ stdout, stderr }) };
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await new Promise<void>((resolveClose) => child.once('close', () => resolveClose()));
}

describe('actual CLI launch protocol', () => {
  // Ground truth: node <compiled-cli> <target-sha> <base-sha> --host 127.0.0.1 --port 0 --no-open --keep-alive.
  // Windows process.kill does not deliver these catchable POSIX signals; rejection coverage still runs there.
  it.skipIf(process.platform === 'win32').each(['SIGINT', 'SIGTERM'] as const)(
    'keeps immutable-comparison stdout JSONL through %s',
    async (signal) => {
      const fixture = launch(
        [...revisions, '--host', '127.0.0.1', '--port', '0', '--no-open', '--keep-alive'],
        signal,
      );
      try {
        expect(await fixture.closed).toBe(0);
        const events = fixture
          .output()
          .stdout.trim()
          .split('\n')
          .map((line) => JSON.parse(line) as { type: string; reason?: string; port?: number });
        expect(events[0]).toMatchObject({ type: 'server.ready', port: expect.any(Number) });
        expect(events[0]!.port).toBeGreaterThan(0);
        expect(events.at(-1)).toMatchObject({ type: 'server.shutdown', reason: signal });
        expect(events.filter((event) => event.type === 'server.shutdown')).toHaveLength(1);
        expect(fixture.output().stderr).toContain('File watching disabled');
      } finally {
        await stop(fixture.child);
      }
    },
    15000,
  );

  it.skipIf(process.platform === 'win32').each(['SIGINT', 'SIGTERM'] as const)(
    'cancels on the first %s while Git startup is blocked',
    async (signal) => {
      const wrapperDirectory = await mkdtemp(join(directory, 'git-wrapper-'));
      const markerPath = join(wrapperDirectory, 'blocked');
      const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
      const wrapper = join(wrapperDirectory, 'git');
      await writeFile(
        wrapper,
        `#!${process.execPath}
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (process.argv.slice(2).includes('diff')) {
  writeFileSync(${JSON.stringify(markerPath)}, String(process.pid));
  setInterval(() => {}, 1000);
} else {
  const result = spawnSync(${JSON.stringify(realGit)}, process.argv.slice(2), { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
`,
      );
      await chmod(wrapper, 0o755);
      let notifyBlocked!: () => void;
      const blocked = new Promise<void>((resolveBlocked) => {
        notifyBlocked = resolveBlocked;
      });
      const watcher = watch(wrapperDirectory, (_event, filename) => {
        if (filename === 'blocked') notifyBlocked();
      });
      const fixture = launch(
        [...revisions, '--host', '127.0.0.1', '--port', '0', '--keep-alive'],
        undefined,
        {
          PATH: `${wrapperDirectory}:${process.env.PATH ?? ''}`,
        },
      );
      try {
        // The Git wrapper's marker proves startup is blocked; no elapsed-time guess triggers cancellation.
        await blocked;
        fixture.child.kill(signal);
        await expect.poll(() => fixture.child.signalCode, { timeout: 1000 }).toBe(signal);
        expect(await fixture.closed).toBeNull();
        expect(fixture.output().stdout).toBe('');
        expect(fixture.output().stderr).not.toContain('difit server started');
        expect(fixture.output().stderr).not.toContain('Opening browser');
      } finally {
        watcher.close();
        await stop(fixture.child);
        try {
          process.kill(Number(await readFile(markerPath, 'utf8')), 'SIGKILL');
        } catch {
          // The Git worker may already have exited with its parent.
        }
      }
    },
    15000,
  );

  it.skipIf(process.platform === 'win32')(
    'keeps the untracked-file prompt on stderr and stdout JSONL',
    async () => {
      const untracked = join(directory, 'prompt-untracked.txt');
      await writeFile(untracked, 'untracked prompt fixture\n');
      const child = spawn(
        process.execPath,
        [entrypoint, '.', '--host', '127.0.0.1', '--port', '0', '--no-open', '--keep-alive'],
        {
          cwd: directory,
          env: {
            ...withoutGitEnvironment(process.env),
            GIT_CONFIG_GLOBAL: devNull,
            GIT_CONFIG_SYSTEM: devNull,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      let answered = false;
      let signalled = false;
      const answerPrompt = (output: string) => {
        if (!answered && output.includes('Would you like to include')) {
          answered = true;
          child.stdin.write('n\n');
        }
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        // Also answer a misrouted prompt so that regression fails on JSON purity, not a timeout.
        answerPrompt(stdout);
        if (
          !signalled &&
          stdout
            .split('\n')
            .slice(0, -1)
            .some((line) => line.includes('"type":"server.ready"'))
        ) {
          signalled = true;
          child.kill('SIGTERM');
        }
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
        answerPrompt(stderr);
      });
      const closed = new Promise<number | null>((resolveClose, reject) => {
        child.once('error', reject);
        child.once('close', resolveClose);
      });
      try {
        expect(await closed).toBe(0);
        const events = stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as { type: string });
        expect(stderr).toContain('Would you like to include');
        expect(events[0]?.type).toBe('server.ready');
        expect(events.at(-1)?.type).toBe('server.shutdown');
      } finally {
        child.stdin.destroy();
        await stop(child);
        await rm(untracked, { force: true });
      }
    },
    15000,
  );

  it.skipIf(process.platform === 'win32')(
    'isolates real fixture setup and CLI startup from linked-worktree hook variables',
    async () => {
      // The nested selected cases wait for real readiness and shutdown, so both setup and child Git lookup are exercised.
      const hookRoot = await mkdtemp(join(tmpdir(), 'difit-protocol-hook-'));
      const caller = join(hookRoot, 'caller');
      const linked = join(hookRoot, 'linked');
      const environment = withoutGitEnvironment(process.env);
      let probe: ReturnType<typeof spawn> | undefined;
      let exited: Promise<number | null> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        execFileSync('git', ['init', '-q', caller], { env: environment });
        await writeFile(join(caller, 'caller.txt'), 'caller repository fixture\n');
        execFileSync('git', ['-C', caller, 'add', 'caller.txt'], { env: environment });
        execFileSync(
          'git',
          [
            '-C',
            caller,
            '-c',
            `core.hooksPath=${devNull}`,
            '-c',
            'commit.gpgsign=false',
            '-c',
            'user.name=Hook caller fixture',
            '-c',
            'user.email=hook@example.invalid',
            'commit',
            '-qm',
            'caller fixture',
          ],
          { env: environment },
        );
        execFileSync(
          'git',
          [
            '-C',
            caller,
            '-c',
            `core.hooksPath=${devNull}`,
            'worktree',
            'add',
            '--detach',
            '-q',
            linked,
            'HEAD',
          ],
          { env: environment },
        );
        const gitDirectory = execFileSync(
          'git',
          ['-C', linked, 'rev-parse', '--absolute-git-dir'],
          { env: environment, encoding: 'utf8' },
        ).trim();
        const configPath = join(caller, '.git', 'config');
        const indexPath = join(gitDirectory, 'index');
        const configBefore = await readFile(configPath);
        const indexBefore = await readFile(indexPath);
        const reportPath = join(hookRoot, 'result.json');
        probe = spawn(
          process.execPath,
          [
            join(repository, 'node_modules/vitest/vitest.mjs'),
            'run',
            'src/cli/index.integration.test.ts',
            '-t',
            'keeps (immutable-comparison stdout JSONL through SIGTERM|the untracked-file prompt on stderr and stdout JSONL)$',
            '--reporter=json',
            '--outputFile',
            reportPath,
          ],
          {
            cwd: repository,
            env: { ...environment, GIT_DIR: gitDirectory, GIT_INDEX_FILE: indexPath },
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        let diagnostics = '';
        probe.stdout?.setEncoding('utf8');
        probe.stderr?.setEncoding('utf8');
        probe.stdout?.on('data', (chunk: string) => {
          diagnostics += chunk;
        });
        probe.stderr?.on('data', (chunk: string) => {
          diagnostics += chunk;
        });
        exited = new Promise<number | null>((resolveExit, rejectExit) => {
          probe!.once('error', rejectExit);
          probe!.once('close', resolveExit);
        });
        const code = await Promise.race([
          exited,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`Nested fixture did not exit: ${diagnostics}`)),
              20000,
            );
          }),
        ]);
        expect(
          (await readFile(configPath)).equals(configBefore),
          'fixture setup must preserve caller Git config',
        ).toBe(true);
        expect(
          (await readFile(indexPath)).equals(indexBefore),
          'fixture setup and CLI Git operations must preserve caller index',
        ).toBe(true);
        expect(code, diagnostics).toBe(0);
        const report = JSON.parse(await readFile(reportPath, 'utf8')) as { numPassedTests: number };
        expect(
          report.numPassedTests,
          'both selected real readiness cases must run, not merely skip',
        ).toBe(2);
      } finally {
        if (timeout) clearTimeout(timeout);
        if (probe?.pid) {
          try {
            process.kill(-probe.pid, 'SIGKILL');
          } catch (error) {
            // A completed runner may already have reaped its process group.
            expect((error as NodeJS.ErrnoException).code).toBe('ESRCH');
          }
        }
        await exited?.catch(() => undefined);
        await rm(hookRoot, { recursive: true, force: true });
      }
    },
    30000,
  );

  it('rejects --no-conversation alone before starting the server', async () => {
    const fixture = launch(['--no-conversation']);
    try {
      expect(await fixture.closed).toBe(1);
      expect(fixture.output().stdout).toBe('');
      expect(fixture.output().stderr).toContain('--no-conversation requires --no-jsonl');
    } finally {
      await stop(fixture.child);
    }
  });
});
