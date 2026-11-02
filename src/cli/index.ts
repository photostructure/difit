#!/usr/bin/env node

import { Command } from 'commander';
import { type SimpleGit } from 'simple-git';

import pkg from '../../package.json' with { type: 'json' };
import { createGitClient } from '../server/git-client.js';
import { startServer } from '../server/server.js';
import { type CommentImport, type DiffSelection } from '../types/diff.js';
import { createDiffSelection } from '../utils/diffSelection.js';
import { DiffMode } from '../types/watch.js';

import {
  shouldReadStdin,
  findUntrackedFiles,
  markFilesIntentToAdd,
  promptUser,
  parseCommentOptions,
  validateDiffArguments,
  getGitRoot,
  readStdin,
} from './utils.js';
import { createCommentCommand } from './comment.js';
import { createSchemaCommand } from './schema.js';
import { createReviewCommand, resolveNamedReview } from './review.js';
import { getPrPatch, getPrCommentImports } from './github.js';
import {
  BACKGROUND_CHILD_ENV,
  emitBackgroundHandshake,
  ignoreStdioErrorsForBackgroundDaemon,
  startBackgroundProcess,
} from './background.js';

type SpecialArg = 'working' | 'staged' | '.';

function isSpecialArg(arg: string): arg is SpecialArg {
  return arg === 'working' || arg === 'staged' || arg === '.';
}

function resolveDiffSelection(
  commitish: string,
  compareWith?: string,
  mergeBase?: boolean,
): DiffSelection {
  let baseCommitish: string;

  if (compareWith) {
    baseCommitish = compareWith;
  } else if (commitish === 'working') {
    baseCommitish = 'staged';
  } else if (isSpecialArg(commitish)) {
    baseCommitish = 'HEAD';
  } else {
    baseCommitish = commitish + '^';
  }

  return createDiffSelection(baseCommitish, commitish, mergeBase ? 'merge-base' : undefined);
}

function determineDiffMode(selection: DiffSelection, compareWith?: string): DiffMode {
  const { targetCommitish } = selection;

  // If comparing specific commits/branches (not involving HEAD), no watching needed
  // Exception: allow watching when targetCommitish is '.' even with compareWith
  if (compareWith && targetCommitish !== 'HEAD' && targetCommitish !== '.') {
    return DiffMode.SPECIFIC;
  }

  if (targetCommitish === 'working') {
    return DiffMode.WORKING;
  }

  if (targetCommitish === 'staged') {
    return DiffMode.STAGED;
  }

  if (targetCommitish === '.') {
    return DiffMode.DOT;
  }
  // Default mode: HEAD^ vs HEAD or HEAD vs other commits (watch for HEAD changes)
  return DiffMode.DEFAULT;
}

interface CliOptions {
  review?: string;
  capture?: string;
  pathspec: string[];
  select: string[];
  port?: number;
  host?: string;
  open: boolean;
  comment: string[];
  pr?: string;
  clean?: boolean;
  shipIt?: boolean;
  conversation?: boolean;
  jsonl: boolean;
  commitMessage?: string;
  why?: string;
  includeUntracked?: boolean;
  keepAlive?: boolean;
  background?: boolean;
  context?: number;
  mergeBase?: boolean;
}

const program = new Command();

program
  .name('difit')
  .description('A lightweight Git diff viewer with GitHub-like interface')
  .version(pkg.version, '-v, --version', 'output the version number')
  .enablePositionalOptions()
  .addCommand(createCommentCommand())
  .addCommand(createReviewCommand())
  .argument(
    '[commit-ish]',
    'Git commit, tag, branch, HEAD~n reference, or "working"/"staged"/"."',
    'HEAD',
  )
  .argument(
    '[compare-with]',
    'Optional: Compare with this commit/branch (shows diff between commit-ish and compare-with)',
  )
  .option('--port <port>', 'preferred port (auto-assigned if occupied)', parseInt)
  .option('--host <host>', 'host address to bind', '')
  .option('--no-open', 'do not automatically open browser')
  .option(
    '--comment <json>',
    'inject initial review comments (repeatable, accepts a JSON object or array)',
    (value: string, previous: string[]) => [...previous, value],
    [],
  )
  .option('--pr <url>', 'GitHub PR URL to review (e.g., https://github.com/owner/repo/pull/123)')
  .option('--clean', 'start with a clean slate by clearing all existing comments')
  .option(
    '--lgtm, --ship-it',
    'show an LGTM toggle to approve or revoke approval while the review stays open',
    true,
  )
  .option('--no-lgtm, --no-ship-it', 'hide the LGTM approval toggle')
  .option(
    '--conversation',
    'enable conversation APIs (replies, progress, snapshots); required by --jsonl',
    true,
  )
  .option('--no-conversation', 'disable agent conversations (requires --no-jsonl)')
  .option('--jsonl', 'emit review events as JSON Lines on stdout (default)', true)
  .option('--no-jsonl', 'use human-readable output instead of JSON Lines')
  .option('--commit-message <text>', 'seed the proposed commit message for the initial review')
  .option('--why <text>', 'seed a short rationale for the initial review')
  .option('--review <name>', 'start a named review of a frozen uncommitted patch')
  .option('--capture <file>', 'load a saved capture for --review')
  .option(
    '--pathspec <git-pathspec>',
    'filter a named capture with a Git pathspec; repeatable',
    (value: string, previous: string[]) => [...previous, value],
    [],
  )
  .option(
    '--select <file-or-hunk-id>',
    'select IDs from a named capture; repeatable',
    (value: string, previous: string[]) => [...previous, value],
    [],
  )
  .option('--include-untracked', 'automatically include untracked files in diff')
  .option('--keep-alive', 'keep server running even after browser disconnects')
  .option('--background', 'keep the server running in the background and output JSON info')
  .option('--context <lines>', 'number of context lines shown around each change', parseInt)
  .option(
    '--merge-base',
    'resolve the base revision with git merge-base before diffing (Git revision mode only)',
  )
  .addHelpText(
    'after',
    `
Editor configuration (set before starting difit):
  DIFIT_EDITOR          Editor preset: vscode (default), cursor, zed, textmate,
                        bbedit, emacs, macvim, sublime, nova, custom, or none.
                        Falls back to EDITOR when unset.
  DIFIT_EDITOR_COMMAND  Executable for DIFIT_EDITOR=custom.
  DIFIT_EDITOR_ARGS     Custom arguments; pass %file or %file:%line separately.
`,
  )
  .action(async (commitish: string, compareWith: string | undefined, options: CliOptions) => {
    try {
      const isBackgroundChild = process.env[BACKGROUND_CHILD_ENV] === '1';
      const backgroundMode = options.background || isBackgroundChild;
      if (options.review !== undefined && !options.conversation) {
        throw new Error('Named reviews require conversation mode; remove --no-conversation');
      }
      if (options.jsonl && !options.conversation) {
        console.error(
          'Error: --no-conversation requires --no-jsonl; JSONL events use the conversation protocol',
        );
        process.exit(1);
      }
      if (
        options.review === undefined &&
        (options.capture !== undefined || options.pathspec.length || options.select.length)
      ) {
        throw new Error('--capture, --pathspec and --select require --review');
      }
      if (
        options.review !== undefined &&
        (options.pr ||
          options.mergeBase ||
          options.context !== undefined ||
          compareWith ||
          (program.args.length > 0 && commitish !== '-'))
      ) {
        throw new Error(
          '--review accepts an uncommitted capture or positional -; --pr, --merge-base, --context and Git revision arguments are not supported',
        );
      }
      if (options.background && options.review !== undefined && commitish === '-') {
        throw new Error(
          'A background review cannot read stdin; save a capture and use --capture instead',
        );
      }
      let stdinDiff: string | undefined;
      let stdinReviewLabel = 'diff from stdin';
      let manualCommentImports: CommentImport[] = [];
      let commentImports: CommentImport[] = [];

      if (
        options.context !== undefined &&
        (!Number.isInteger(options.context) || options.context < 0)
      ) {
        console.error('Error: --context must be a non-negative integer');
        process.exit(1);
      }

      if (options.background && !isBackgroundChild) {
        await startBackgroundProcess();
        return;
      }

      try {
        manualCommentImports = parseCommentOptions(options.comment);
        commentImports = manualCommentImports;
      } catch (error) {
        console.error(
          `Error: ${error instanceof Error ? error.message : 'Invalid --comment value'}`,
        );
        process.exit(1);
      }

      if (backgroundMode) {
        options.keepAlive = true;
        options.open = false;
      }

      if (options.pr) {
        if (commitish !== 'HEAD' || compareWith) {
          console.error('Error: --pr option cannot be used with positional arguments');
          process.exit(1);
        }

        if (options.mergeBase) {
          console.error('Error: --merge-base option cannot be used with --pr');
          process.exit(1);
        }

        if (options.context !== undefined) {
          console.error('Error: --context option cannot be used with --pr');
          process.exit(1);
        }

        try {
          stdinDiff = getPrPatch(options.pr);
          stdinReviewLabel = options.pr;
        } catch (error) {
          console.error(
            `Error resolving PR: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          process.exit(1);
        }

        try {
          const prCommentImports = await getPrCommentImports(options.pr);
          commentImports = [...prCommentImports, ...manualCommentImports];
        } catch (error) {
          console.warn(
            `Warning: Failed to load PR review comments: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      } else {
        // Check if we should read from stdin
        const readFromStdin =
          options.review !== undefined
            ? commitish === '-'
            : shouldReadStdin({
                commitish,
                hasPositionalArgs: program.args.length > 0,
                hasPrOption: false,
              });

        if (readFromStdin) {
          if (options.context !== undefined) {
            console.error('Error: --context option cannot be used with stdin diff');
            process.exit(1);
          }
          if (options.mergeBase) {
            console.error('Error: --merge-base option cannot be used with stdin diff');
            process.exit(1);
          }
          // Read unified diff from stdin
          stdinDiff =
            options.review !== undefined
              ? await readStdin({ strictUtf8: true })
              : await readStdin();
          if (!stdinDiff.trim()) {
            console.error('Error: No diff content received from stdin');
            process.exit(1);
          }
        }
      }

      if (options.review !== undefined) {
        const namedReview = await resolveNamedReview({
          name: options.review,
          patch: stdinDiff,
          captureFile: options.capture,
          pathspecs: options.pathspec,
          selectedIds: options.select,
          includeUntracked: options.includeUntracked,
        });

        const { launchUrl, port, isEmpty } = await startServer({
          namedReview,
          repoPath: namedReview.capture.repositoryRoot,
          preferredPort: options.port,
          host: options.host,
          openBrowser: options.open,
          clearComments: options.clean,
          shipIt: options.shipIt,
          conversation: options.conversation,
          jsonl: options.jsonl && !backgroundMode,
          onReady: backgroundMode
            ? undefined
            : ({ shutdown, port }) => registerShutdownHandlers(shutdown, port, options.jsonl),
          commitMessage: options.commitMessage,
          why: options.why,
          keepAlive: options.keepAlive,
          diffMode: DiffMode.SPECIFIC,
          ...(commentImports.length > 0 ? { commentImports } : {}),
        });

        if (backgroundMode) {
          emitBackgroundHandshake({ port, url: launchUrl, pid: process.pid });
          if (isBackgroundChild) ignoreStdioErrorsForBackgroundDaemon();
          return;
        }
        console.error(`\n🚀 difit server started on ${launchUrl}`);
        console.error(`📋 Reviewing: ${namedReview.name}`);
        if (isEmpty) {
          console.error(
            '\n! \x1b[33mNo differences found. Browser will not open automatically.\x1b[0m',
          );
          console.error(`   Server is running at ${launchUrl} if you want to check manually.\n`);
        }
        return;
      }

      if (stdinDiff) {
        // Start server with stdin diff (including --pr patch)

        const { launchUrl, port } = await startServer({
          stdinDiff,
          preferredPort: options.port,
          host: options.host,
          openBrowser: options.open,
          clearComments: options.clean,
          shipIt: options.shipIt,
          conversation: options.conversation,
          jsonl: options.jsonl && !backgroundMode,
          onReady: backgroundMode
            ? undefined
            : ({ shutdown, port }) => registerShutdownHandlers(shutdown, port, options.jsonl),
          commitMessage: options.commitMessage,
          why: options.why,
          keepAlive: options.keepAlive,
          ...(commentImports.length > 0 ? { commentImports } : {}),
        });

        if (backgroundMode) {
          emitBackgroundHandshake({ port, url: launchUrl, pid: process.pid });
          if (isBackgroundChild) {
            ignoreStdioErrorsForBackgroundDaemon();
          }
          return;
        }
        console.error(`\n🚀 difit server started on ${launchUrl}`);
        console.error(`📋 Reviewing: ${stdinReviewLabel}`);
        if (options.keepAlive) {
          console.error('🔒 Keep-alive mode: server will stay running after browser disconnects');
        }
        console.error('\nPress Ctrl+C to stop the server');
        return;
      }

      // Detect git root
      let repoPath: string | undefined;
      try {
        repoPath = getGitRoot();
      } catch {
        // If not in a git repository, fall back to process.cwd()
        repoPath = undefined;
      }

      const selection = resolveDiffSelection(commitish, compareWith, options.mergeBase);

      if (options.mergeBase && isSpecialArg(selection.baseCommitish)) {
        console.error(
          `Error: --merge-base requires a commit-ish base, but resolved base was "${selection.baseCommitish}"`,
        );
        process.exit(1);
      }

      if (selection.targetCommitish === 'working' || selection.targetCommitish === '.') {
        const git = createGitClient(repoPath);
        if (isBackgroundChild && !options.includeUntracked) {
          // Skip interactive prompts in detached background mode.
        } else {
          await handleUntrackedFiles(git, options.includeUntracked);
        }
      }

      const validation = validateDiffArguments(selection.targetCommitish, compareWith);
      if (!validation.valid) {
        console.error(`Error: ${validation.error}`);
        process.exit(1);
      }

      const { launchUrl, port, isEmpty } = await startServer({
        selection,
        preferredPort: options.port,
        host: options.host,
        openBrowser: options.open,
        clearComments: options.clean,
        shipIt: options.shipIt,
        conversation: options.conversation,
        jsonl: options.jsonl && !backgroundMode,
        onReady: backgroundMode
          ? undefined
          : ({ shutdown, port }) => registerShutdownHandlers(shutdown, port, options.jsonl),
        commitMessage: options.commitMessage,
        why: options.why,
        keepAlive: options.keepAlive,
        contextLines: options.context,
        diffMode: determineDiffMode(selection, compareWith),
        repoPath,
        ...(commentImports.length > 0 ? { commentImports } : {}),
      });

      if (backgroundMode) {
        emitBackgroundHandshake({ port, url: launchUrl, pid: process.pid });
        if (isBackgroundChild) {
          ignoreStdioErrorsForBackgroundDaemon();
        }
        return;
      }

      console.error(`\n🚀 difit server started on ${launchUrl}`);
      console.error(`📋 Reviewing: ${selection.targetCommitish}`);

      if (options.keepAlive) {
        console.error('🔒 Keep-alive mode: server will stay running after browser disconnects');
      }

      if (options.clean) {
        console.error('🧹 Starting with a clean slate - all existing comments will be cleared');
      }

      if (isEmpty) {
        console.error(
          '\n! \x1b[33mNo differences found. Browser will not open automatically.\x1b[0m',
        );
        console.error(`   Server is running at ${launchUrl} if you want to check manually.\n`);
      } else if (options.open) {
        console.error('🌐 Opening browser...\n');
      } else {
        console.error('💡 Use --open to automatically open browser\n');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program.addCommand(createSchemaCommand());
program.addHelpText(
  'after',
  `
Agent protocol:
  A foreground server emits JSONL on stdout; diagnostics and prompts use stderr.
  Read server.ready for the actual API port, then consume review events directly.
  difit schema                  JSON Schema for events and all protocol definitions
  difit schema summary          Commit-message/TLDR edit request schema
  difit comment reply --help    Exact-thread reply payload
  difit comment status --help   Explicit delivery and progress receipts
  difit comment snapshot --port <port>  Recover the current review state

Summary JSON: {"reviewId":"...","commitMessage":"fix: ...","rationale":"Short TLDR","baseVersion":0}
Comment JSON events include type, reviewId, threadId, messageId, cursor, and body.
`,
);

void program.parseAsync();

function registerShutdownHandlers(
  shutdown: (reason: 'SIGINT' | 'SIGTERM') => Promise<void>,
  port: number,
  jsonl: boolean,
): void {
  let closing = false;
  const stop = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (closing) return;
    closing = true;
    console.error('\n👋 Shutting down difit server...');
    let exitCode = 0;
    if (!jsonl) {
      try {
        const response = await fetch(`http://localhost:${port}/api/comments-output`, {
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          const comments = await response.text();
          if (comments.trim()) console.log(comments);
        }
      } catch {
        // Review state may already be unavailable during shutdown.
      }
    }
    try {
      await shutdown(signal);
    } catch (error) {
      console.error('Error shutting down difit:', error instanceof Error ? error.message : error);
      exitCode = 1;
    }
    process.stdout.write('', () => process.exit(exitCode));
  };
  process.on('SIGINT', () => {
    void stop('SIGINT');
  });
  process.on('SIGTERM', () => {
    void stop('SIGTERM');
  });
}

async function handleUntrackedFiles(git: SimpleGit, addAutomatically?: boolean): Promise<void> {
  const files = await findUntrackedFiles(git);
  if (files.length === 0) {
    return;
  }

  const shouldAdd = addAutomatically || (await promptUserToIncludeUntracked(files));

  if (shouldAdd) {
    await markFilesIntentToAdd(git, files);
    console.error('✅ Files added with --intent-to-add');
    const filesAsArgs = files.join(' ');
    console.error(`   💡 To undo this, run \`git reset -- ${filesAsArgs}\``);
  } else {
    console.error('i Untracked files will not be shown in diff');
  }
}

async function promptUserToIncludeUntracked(files: string[]): Promise<boolean> {
  console.error(`\n📝 Found ${files.length} untracked file(s):`);
  for (const file of files) {
    console.error(`    - ${file}`);
  }

  return await promptUser(
    '\n❓ Would you like to include these untracked files in the diff review? (Y/n): ',
  );
}
