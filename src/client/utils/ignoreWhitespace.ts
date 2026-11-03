import { diffArrays } from 'diff';

import type { CommentThread, DiffChunk, DiffFile, DiffLine } from '../../types/diff';
import type { CursorPosition } from '../hooks/keyboardNavigation';

export type PresentationChunk<T extends DiffChunk = DiffChunk> = T & {
  snapshotLines?: DiffLine[];
};

export function remapWhitespaceCursor(
  previousFiles: DiffFile[],
  nextFiles: DiffFile[],
  cursor: CursorPosition,
): CursorPosition | null {
  const previousFile = previousFiles[cursor.fileIndex];
  const previousLine = previousFile?.chunks[cursor.chunkIndex]?.lines[cursor.lineIndex];
  const numberKey = cursor.side === 'left' ? 'oldLineNumber' : 'newLineNumber';
  const number = previousLine?.[numberKey];
  if (number === undefined) return null;
  const fileIndex = nextFiles.findIndex((file) => file.path === previousFile?.path);
  const file = nextFiles[fileIndex];
  if (!file) return null;
  let closest: CursorPosition | null = null;
  let distance = Infinity;
  file.chunks.forEach((chunk, chunkIndex) => {
    chunk.lines.forEach((line, lineIndex) => {
      const lineNumber = line[numberKey];
      if (lineNumber === undefined) return;
      const nextDistance = Math.abs(number - lineNumber);
      if (nextDistance < distance) {
        distance = nextDistance;
        closest = { fileIndex, chunkIndex, lineIndex, side: cursor.side };
      }
    });
  });
  return closest;
}

// Bound alignment work independently for each run. If it cannot be aligned
// cheaply, show the original changes rather than hide an uncertain match.
const MAX_RUN_LINES = 2_000;
const MAX_RUN_CHARACTERS = 200_000;
const MAX_EDIT_LENGTH = 200;
const FILE_ALIGNMENT_BUDGET_MS = 30;
const RUN_ALIGNMENT_BUDGET_MS = 10;

const normalize = (content: string) => content.replace(/[ \t\r\f\v]/g, '');

export function hideWhitespaceChanges<T extends DiffChunk>(
  chunks: T[],
  threads: CommentThread[],
): PresentationChunk<T>[] {
  const deadline = Date.now() + FILE_ALIGNMENT_BUDGET_MS;
  const ranges = threads.flatMap((thread) => {
    if (thread.scope === 'review') return [];
    const [start, end] = Array.isArray(thread.line) ? thread.line : [thread.line, thread.line];
    return [{ side: thread.side ?? 'new', start, end }];
  });
  const hasComment = (line: DiffLine) =>
    ranges.some(({ side, start, end }) => {
      const number = side === 'old' ? line.oldLineNumber : line.newLineNumber;
      return number !== undefined && number >= start && number <= end;
    });

  return chunks.map((chunk) => {
    const hidden = new Set<DiffLine>();
    let index = 0;
    while (index < chunk.lines.length) {
      const oldLines: DiffLine[] = [];
      const newLines: DiffLine[] = [];
      let characters = 0;
      while (index < chunk.lines.length) {
        const line = chunk.lines[index];
        if (!line || (line.type !== 'delete' && line.type !== 'add')) break;
        (line.type === 'delete' ? oldLines : newLines).push(line);
        characters += line.content.length;
        index++;
      }
      if (
        Date.now() <= deadline &&
        oldLines.length > 0 &&
        newLines.length > 0 &&
        oldLines.length + newLines.length <= MAX_RUN_LINES &&
        characters <= MAX_RUN_CHARACTERS
      ) {
        const changes = diffArrays(
          oldLines.map((line) => normalize(line.content)),
          newLines.map((line) => normalize(line.content)),
          { maxEditLength: MAX_EDIT_LENGTH, timeout: RUN_ALIGNMENT_BUDGET_MS },
        );
        let oldIndex = 0;
        let newIndex = 0;
        for (const change of changes ?? []) {
          if (change.added) newIndex += change.count;
          else if (change.removed) oldIndex += change.count;
          else {
            for (let offset = 0; offset < change.count; offset++) {
              const oldLine = oldLines[oldIndex++];
              const newLine = newLines[newIndex++];
              // Keep both sides when a comment needs either side of this pair.
              if (oldLine && newLine && !hasComment(oldLine) && !hasComment(newLine)) {
                hidden.add(oldLine);
                hidden.add(newLine);
              }
            }
          }
        }
      }
      // Skip the context line (or advance past a non-change-only iteration).
      if (index < chunk.lines.length) index++;
    }
    return hidden.size === 0
      ? chunk
      : {
          ...chunk,
          lines: chunk.lines.filter((line) => !hidden.has(line)),
          snapshotLines: chunk.lines,
        };
  });
}
