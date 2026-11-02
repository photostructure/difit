/** Immutable, repository-bound patch artifact. IDs are valid only for this digest. */
export interface ReviewCapture {
  schemaVersion: 1;
  repositoryId: string;
  repositoryRoot: string;
  baseCommit: string;
  patch: string;
  patchDigest: string;
  files: CapturedFile[];
}

export interface CapturedFile {
  id: string;
  path: string;
  oldPath?: string;
  hunks: CapturedHunk[];
}

export interface CapturedHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export interface NamedReviewMetadata {
  name: string;
  version: number;
  patchDigest: string;
  baseCommit: string;
  repositoryId: string;
}

export interface NamedReviewStart {
  name: string;
  capture: ReviewCapture;
}

export interface ReviewCaptureUpdate {
  expectedVersion: number;
  capture: ReviewCapture;
}
