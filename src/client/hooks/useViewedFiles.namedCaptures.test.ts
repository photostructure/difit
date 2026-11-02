import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DiffFile } from '../../types/diff';

import { generateDiffHash, getDiffContentForHashing } from '../utils/diffUtils';
import { storageService } from '../services/StorageService';

import { useViewedFiles } from './useViewedFiles';

function file(path: string, content: string): DiffFile {
  return {
    path,
    status: 'modified',
    additions: 1,
    deletions: 0,
    chunks: [
      {
        header: '@@ -0,0 +1 @@',
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ type: 'add', content, newLineNumber: 1 }],
      },
    ],
  };
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('revalidates only changed named content and writes its fresh hash when viewed again', async () => {
  const original = [file('changed.txt', 'first'), file('stable.txt', 'stable')];
  const next = [file('changed.txt', 'second'), original[1]!];
  const { result, rerender } = renderHook(
    ({ files, capture }) =>
      useViewedFiles(
        'review:task',
        'review:task',
        'review:task',
        undefined,
        files,
        'named-viewed-repo',
        [],
        undefined,
        capture,
      ),
    { initialProps: { files: original, capture: '1:a' } },
  );
  await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
  await act(async () => result.current.setFilesViewed(original, true));
  expect(result.current.viewedFiles).toEqual(new Set(['changed.txt', 'stable.txt']));
  rerender({ files: next, capture: '2:b' });
  await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
  expect(result.current.viewedFiles).toEqual(new Set(['stable.txt']));
  expect(result.current.changedSinceViewedFiles).toEqual(new Set(['changed.txt']));
  await act(async () => result.current.toggleFileViewed('changed.txt', next[0]!));
  expect(result.current.getViewedFileRecord('changed.txt')?.diffContentHash).toBe(
    await generateDiffHash(getDiffContentForHashing(next[0]!)),
  );
  rerender({ files: next, capture: '3:c' });
  await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
  expect(result.current.viewedFiles).toEqual(new Set(['changed.txt', 'stable.txt']));
  rerender({ files: [next[1]!], capture: '4:d' });
  await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
  expect(result.current.viewedFiles).toEqual(new Set(['stable.txt']));
  expect(result.current.getViewedFileRecord('changed.txt')).toBeDefined();
  rerender({ files: [], capture: '5:e' });
  await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
  expect(result.current.viewedFiles.size).toBe(0);
  rerender({ files: next, capture: '6:f' });
  await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
  expect(result.current.viewedFiles).toEqual(new Set(['changed.txt', 'stable.txt']));
});

it('keeps existing ordinary viewed-state behavior without the named capture opt-in', async () => {
  const original = [file('ordinary.txt', 'first')];
  const { result, rerender } = renderHook(
    ({ files }) => useViewedFiles('base', '.', 'working', undefined, files, 'ordinary-viewed-repo'),
    { initialProps: { files: original } },
  );
  await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
  await act(async () => result.current.setFilesViewed(original, true));
  rerender({ files: [file('ordinary.txt', 'second')] });
  expect(result.current.viewedFiles.has('ordinary.txt')).toBe(true);
});

it.each([undefined, '1:same-digest'])(
  'does not overwrite named B after delayed A with capture %s',
  async (initialCaptureIdentity) => {
    const x = file('shared.txt', 'shared');
    const y = file('second.txt', 'second');
    const { result, rerender } = renderHook(
      ({ task, files, capture }) =>
        useViewedFiles(
          `review:${task}`,
          `review:${task}`,
          `review:${task}`,
          undefined,
          files,
          'task-switch-repo',
          [],
          undefined,
          capture,
        ),
      { initialProps: { task: 'a', files: [x], capture: initialCaptureIdentity } },
    );
    await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let releaseHash: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseHash = resolve;
    });
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementationOnce(async (algorithm, data) => {
        await gate;
        return digest(algorithm, data);
      });
    try {
      const pending = result.current.toggleFileViewed(x.path, x);
      rerender({ task: 'b', files: [x, y], capture: '1:same-digest' });
      await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
      await act(async () => result.current.setFilesViewed([y], true));
      expect(result.current.viewedFiles.has(y.path)).toBe(true);
      await act(async () => {
        releaseHash?.();
        await pending;
      });
      // The repository hash index may share X later; B must retain its independent Y.
      expect(result.current.viewedFiles.has(y.path)).toBe(true);
    } finally {
      releaseHash?.();
      spy.mockRestore();
    }
  },
);

it('keeps a new A load pending and rejects the old A action after A to B to A', async () => {
  const x = file('shared.txt', 'shared');
  const y = file('second.txt', 'second');
  const z = file('other.txt', 'other');
  const saved = vi.spyOn(storageService, 'saveViewedFiles');
  const { result, rerender } = renderHook(
    ({ task, files }) =>
      useViewedFiles(
        `review:${task}`,
        `review:${task}`,
        `review:${task}`,
        undefined,
        files,
        'aba-repo',
        [],
        undefined,
        '1:same-digest',
      ),
    { initialProps: { task: 'a', files: [x, y] } },
  );
  await waitFor(() => expect(result.current.hasLoadedInitialViewedFiles).toBe(true));
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let releaseOld: (() => void) | undefined;
  let releaseB: (() => void) | undefined;
  let releaseNewA: (() => void) | undefined;
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  const bGate = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  const newAGate = new Promise<void>((resolve) => {
    releaseNewA = resolve;
  });
  const spy = vi
    .spyOn(crypto.subtle, 'digest')
    .mockImplementationOnce(async (algorithm, data) => {
      await oldGate;
      return digest(algorithm, data);
    })
    .mockImplementationOnce(async (algorithm, data) => {
      await bGate;
      return digest(algorithm, data);
    })
    .mockImplementationOnce(async (algorithm, data) => {
      await newAGate;
      return digest(algorithm, data);
    })
    .mockImplementationOnce(async (algorithm, data) => {
      await newAGate;
      return digest(algorithm, data);
    });
  try {
    const pending = result.current.toggleFileViewed(x.path, x);
    rerender({ task: 'b', files: [z] });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    rerender({ task: 'a', files: [x, y] });
    const readyBeforeNewLoad = result.current.hasLoadedInitialViewedFiles;
    await act(async () => releaseNewA?.());
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
    await act(async () => result.current.setFilesViewed([y], true));
    expect(result.current.viewedFiles.has(y.path)).toBe(true);
    await act(async () => {
      releaseOld?.();
      await pending;
    });
    expect({ readyBeforeNewLoad, viewed: result.current.viewedFiles }).toEqual({
      readyBeforeNewLoad: false,
      viewed: new Set([y.path]),
    });
  } finally {
    releaseOld?.();
    releaseB?.();
    releaseNewA?.();
    spy.mockRestore();
    saved.mockRestore();
  }
});
