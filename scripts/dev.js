#!/usr/bin/env node
import { spawn } from 'child_process';

import { getCompileCloseExitCode } from '../dev/dev-lifecycle.js';
import { createCliStdoutProxy } from '../dev/dev-stdout.js';

const rawArgs = process.argv.slice(2);
const cliArgs = [...rawArgs, '--no-open'];

// Wait for CLI server to be ready, then start Vite
let cliProcess = null;
let compileProcess = null;
let viteProcess = null;
let isShuttingDown = false;

function startVite(cliServerUrl) {
  if (viteProcess) return;
  console.error('🚀 Starting Vite dev server...');
  const serverUrl = new URL(cliServerUrl);
  viteProcess = spawn('pnpm', ['exec', 'vite', '--clearScreen=false'], {
    stdio: ['inherit', 2, 'inherit'],
    env: {
      ...process.env,
      VITE_DIFIT_API_URL: serverUrl.origin,
      DIFIT_VITE_OPEN_PATH: `/${serverUrl.search}${serverUrl.hash}`,
    },
  });
}

const cliStdoutProxy = createCliStdoutProxy({
  onServerUrl: startVite,
  onOutput: (output) => process.stdout.write(output),
});
const cliStderrProxy = createCliStdoutProxy({
  onServerUrl: startVite,
  onOutput: (output) => process.stderr.write(output),
});

function startCliProcess() {
  cliProcess = spawn(process.execPath, ['dist/cli/index.js', ...cliArgs], {
    // Keep stdin attached so CLI can decide stdin mode by itself.
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });

  cliProcess.stdout.setEncoding('utf8');
  cliProcess.stderr.setEncoding('utf8');
  cliProcess.stdout.on('data', (data) => {
    // Wait for CLI server before starting Vite to prevent proxy connection errors.
    // Forward protocol records intact while readiness starts the development UI.
    cliStdoutProxy.push(data);
  });

  cliProcess.stderr.on('data', (data) => cliStderrProxy.push(data));

  cliProcess.on('close', (code) => {
    cliStdoutProxy.flush();
    cliStderrProxy.flush();

    if (code !== 0 && code !== null && !isShuttingDown) {
      console.error(`CLI server exited with code ${code}`);
    }

    if (viteProcess && !viteProcess.killed) {
      viteProcess.kill('SIGINT');
    }

    process.exitCode = code || 0;
  });
}

function startCompileProcess() {
  compileProcess = spawn('pnpm', ['exec', 'tsc', '--project', 'tsconfig.cli.json'], {
    stdio: ['inherit', 2, 'inherit'],
  });

  compileProcess.on('close', (code) => {
    compileProcess = null;

    const exitCode = getCompileCloseExitCode(code, isShuttingDown);

    if (exitCode !== null) {
      process.exit(exitCode);
      return;
    }

    startCliProcess();
  });
}

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  compileProcess?.kill(signal);
  cliProcess?.kill(signal);
  viteProcess?.kill(signal);
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

startCompileProcess();
