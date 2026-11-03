import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';

import { fetch } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReviewSummary, ConversationSnapshot } from '../types/conversation.js';
import type { DiffResponse } from '../types/diff.js';
import { DiffMode } from '../types/watch.js';

import { captureWorkingTree } from './review-capture.js';
import { startServer } from './server.js';

const previousMessage = 'fix: retain café context\n\nExplain the full change.\n\nRefs: #123\n';
const currentMessage = 'feat: show committed intent\n\nKeep the complete explanation.\n';

describe('committed review summary HTTP integration', () => {
  let root: string;
  let running: Awaited<ReturnType<typeof startServer>> | undefined;

  function git(...args: string[]): string {
    return execFileSync(
      'git',
      [
        '-c',
        'user.name=difit',
        '-c',
        'user.email=difit@example.com',
        '-c',
        'commit.gpgsign=false',
        '-c',
        `core.hooksPath=${devNull}`,
        ...args,
      ],
      {
        cwd: root,
        env: { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull },
        encoding: 'utf8',
      },
    );
  }

  async function start(options: Parameters<typeof startServer>[0] = {}) {
    running = await startServer({
      repoPath: root,
      preferredPort: 0,
      openBrowser: false,
      keepAlive: true,
      conversation: true,
      diffMode: DiffMode.SPECIFIC,
      selection: { baseCommitish: 'HEAD^', targetCommitish: 'HEAD' },
      ...options,
    });
  }

  async function request<T>(path: string, body?: unknown): Promise<T> {
    if (!running) throw new Error('Fixture server has not started');
    const response = await fetch(new URL(path, running.url), {
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as T;
  }

  const summaryPath = (diff: DiffResponse) =>
    `/api/review-summary?${new URLSearchParams({
      base: diff.baseCommitish!,
      target: diff.targetCommitish!,
    })}`;

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('GIT_')) vi.stubEnv(key, undefined);
    }
    root = realpathSync(mkdtempSync(join(tmpdir(), 'difit-committed-summary-')));
    git('init', '--quiet');
    for (const [index, message] of ['fixture root', previousMessage, currentMessage].entries()) {
      writeFileSync(join(root, 'fixture.txt'), `revision ${index}\n`);
      git('add', 'fixture.txt');
      git('commit', '--quiet', '-m', message);
    }
    writeFileSync(join(root, 'fixture.txt'), 'working draft\n');
  });

  afterEach(async () => {
    await running?.shutdown('closed');
    running = undefined;
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('seeds the initial committed comparison with its actual full target message', async () => {
    await start();
    const diff = await request<DiffResponse>('/api/diff');
    const summary = await request<ReviewSummary>(summaryPath(diff));
    const snapshot = await request<ConversationSnapshot>('/api/conversation/snapshot');

    expect(diff.targetCommitMessage).toBe(currentMessage);
    expect(summary).toMatchObject({ commitMessage: currentMessage, rationale: '', version: 1 });
    expect(snapshot.reviews).toHaveLength(1);
    expect(snapshot.reviews[0]?.summary).toEqual(summary);
    expect(snapshot.reviews[0]?.selection.targetCommitish).toBe(diff.targetCommitish);
  });

  it('seeds selected commits independently and preserves saved edits and deliberate clears on refresh', async () => {
    git('config', 'i18n.logOutputEncoding', 'ISO-8859-1');
    await start({
      selection: { baseCommitish: 'HEAD', targetCommitish: '.' },
      commitMessage: 'feat: my working proposal',
      why: 'Keep the draft for the uncommitted review.',
    });
    const proposal = await request<DiffResponse>('/api/diff');
    const proposalSummary = await request<ReviewSummary>(summaryPath(proposal));
    expect(proposal.targetCommitMessage).toBeUndefined();

    const current = await request<DiffResponse>('/api/diff?base=HEAD%5E&target=HEAD');
    const currentPath = summaryPath(current);
    const initial = await request<ReviewSummary>(currentPath);
    expect(initial.commitMessage).toBe(currentMessage);
    const saved = await request<ReviewSummary>(currentPath, {
      commitMessage: 'My saved explanation\n\nKeep this instead of the Git default.',
      rationale: 'User notes for this comparison.',
      baseVersion: initial.version,
    });
    const originalSnapshot = await request<ConversationSnapshot>('/api/conversation/snapshot');
    const originalReview = originalSnapshot.reviews.find(
      (review) => review.selection.targetCommitish === current.targetCommitish,
    );

    const previous = await request<DiffResponse>('/api/diff?base=HEAD%5E%5E&target=HEAD%5E');
    expect(previous.targetCommitMessage).toBe(previousMessage);
    expect(await request<ReviewSummary>(summaryPath(previous))).toMatchObject({
      commitMessage: previousMessage,
      rationale: '',
      version: 1,
    });

    await request('/api/diff?base=HEAD%5E&target=HEAD');
    expect(await request(currentPath)).toEqual(saved);
    const cleared = await request<ReviewSummary>(currentPath, {
      commitMessage: '',
      rationale: '',
      baseVersion: saved.version,
    });
    await request('/api/diff?base=HEAD%5E&target=HEAD');
    expect(await request(currentPath)).toEqual(cleared);
    await request('/api/diff?base=HEAD&target=.');
    expect(await request(summaryPath(proposal))).toEqual(proposalSummary);
    const snapshot = await request<ConversationSnapshot>('/api/conversation/snapshot');
    expect(snapshot.reviews.find((review) => review.id === originalReview?.id)?.summary).toEqual(
      cleared,
    );
    expect(snapshot.reviews).toHaveLength(3);
  });

  it('reads the commit message rather than an annotated tag description', async () => {
    git('tag', '-a', '-m', 'Tag annotation is not the commit message', 'review-tag');
    await start({ selection: { baseCommitish: 'HEAD^', targetCommitish: 'review-tag' } });
    const diff = await request<DiffResponse>('/api/diff');
    expect(diff.targetCommitMessage).toBe(currentMessage);
    expect(await request<ReviewSummary>(summaryPath(diff))).toMatchObject({
      commitMessage: currentMessage,
    });
  });

  it('keeps an explicit initial summary instead of replacing it with Git metadata', async () => {
    await start({ commitMessage: 'My explicit review draft', why: 'Keep the supplied rationale.' });
    const diff = await request<DiffResponse>('/api/diff');
    expect(diff.targetCommitMessage).toBe(currentMessage);
    expect(await request<ReviewSummary>(summaryPath(diff))).toMatchObject({
      commitMessage: 'My explicit review draft',
      rationale: 'Keep the supplied rationale.',
      version: 1,
    });
  });

  it('keeps named captures as proposals and retains their explicit summary and identity', async () => {
    const capture = await captureWorkingTree({ cwd: root });
    await start({
      namedReview: { name: 'task', capture },
      commitMessage: 'feat: captured proposal',
      why: 'Keep the named task draft.',
    });
    const diff = await request<DiffResponse>('/api/diff?review=task');
    const summary = await request<ReviewSummary>('/api/review-summary?review=task');
    const snapshot = await request<ConversationSnapshot>('/api/conversation/snapshot');
    expect(diff.targetCommitMessage).toBeUndefined();
    expect(diff.capture?.patchDigest).toBe(capture.patchDigest);
    expect(summary).toMatchObject({ commitMessage: 'feat: captured proposal', version: 1 });
    await request('/api/diff?review=task');
    expect(await request('/api/review-summary?review=task')).toEqual(summary);
    const refreshed = await request<ConversationSnapshot>('/api/conversation/snapshot');
    expect(refreshed.reviews[0]?.id).toBe(snapshot.reviews[0]?.id);
    expect(refreshed.reviews[0]?.capture).toEqual(snapshot.reviews[0]?.capture);
  });
});
