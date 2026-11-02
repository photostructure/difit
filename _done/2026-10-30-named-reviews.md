# Named reviews of captured uncommitted changes

Complete: named captures, explicit updates, retained conversations, capture-bound approval and browser/CLI acceptance checks.

Matthew approved one named review per agent task, backed by captured uncommitted patches. File filters use native Git pathspecs. File/hunk IDs belong to an immutable capture. Updating the capture retains the conversation and proposal, revokes approval when the patch changes, and rejects stale writers. No review/capture operation stages, stashes, or edits working files.

## Current phase

- [x] User approved the design and uncommitted/shared-tree priority.
- [x] Capture artifacts, Git pathspecs, read-only untracked additions, file/hunk selection.
- [x] Named review launch and compare-and-swap update commands.
- [x] Stable conversation identity, version/digest events and capture-bound approval.
- [x] Browser reload/update behavior, old comment anchors and visible capture identity.
- [x] Schema, help and public agent guidance.
- [x] Acceptance: simultaneous named tasks; overlapping-file subset; capture update retains thread/proposal, revokes LGTM; stale update/approval rejected; Git index/worktree unchanged.
- [x] Project checks and independent review of this feature.

## Interfaces

- `src/types/review.ts` defines `ReviewCapture`, catalogue IDs, `NamedReviewMetadata`, `NamedReviewStart`, and `ReviewCaptureUpdate`.
- `difit --review <name>` captures the uncommitted tree by default. `--pathspec` repeats and supports Git exclude pathspecs; `--include-untracked` must not use intent-to-add.
- `difit review capture --output /tmp/capture.json` writes the full artifact and prints its compact catalogue. Root `--capture <file>` and repeatable `--select <file-or-hunk-id>` load/select from that immutable artifact. `difit - --review <name>` accepts a supplied patch.
- `difit review update <name> --port <port> --expected-version <n>` captures the current tree, or accepts `--capture` / `-` patch input with the same filters. `GET /api/reviews/:name` exposes metadata/catalogue; `POST /api/reviews/:name/capture` accepts `{expectedVersion,capture}`.
- Use `DiffSelection.reviewName` for stable identity in keying and scoped HTTP queries. Actual base/target metadata may change between captures; named review keys do not.
- A changed patch emits `review.capture`, increments version and revokes approval. Identical patch is a no-op after validating expectedVersion. Capture updates are explicit; browser refresh never recaptures the shared tree.
- Approval for a named review must match capture version/digest and summary version. Existing unnamed review behavior stays compatible.

## Ownership

- Capture agent: new `src/server/review-capture.ts` and tests; shared review type changes coordinated with root.
- CLI agent: new `src/cli/review.ts` and tests; root wires command/root flags in `src/cli/index.ts`.
- Root: server/Conversation identity and routes, client, schemas/docs, integration.

## Lore

- Conversations currently key on resolved Git selections, and stdin uses one generic selection. A patch digest must not become conversation identity: requested fixes would otherwise hide the discussion again.
- `useDiffComments` storage uses the display `commit` value for working-tree keys. Named review storage must have a stable batch context while capture versions change.
- Retained merge-base loading separates direct diff calculation from original conversation mode. Keep browser and unscoped companion context aligned.
- Existing comments have code snapshots; preserve original capture/version alongside anchors and mark earlier-capture inline threads outdated.
- Review/capture generation must disable external diff/textconv execution and preserve the shared Git index, including untracked additions.

## Validation

Capture and HTTP integration checks verify that explicit updates retain the discussion, proposal and review identity. Changed patches revoke LGTM; identical patches preserve their version and approval. Stale capture updates and approvals are rejected, and previous capture catalogues remain immutable. Capture operations leave the Git index and working files unchanged.

Browser acceptance verifies that capture updates load automatically, retain local discussion and proposal drafts, and mark original inline anchors outdated. Named review identity remains visible at narrow viewport widths.

Frozen captures render only captured patch context. Extra context, generated-file metadata and full-file or media previews cannot be loaded from the mutable worktree. Adding those capabilities would require capturing their content with the patch.

Run `pnpm check`, `pnpm test`, `pnpm build`, `pnpm knip`, and scoped `oxfmt --check` to verify changes. Use disposable repositories for CLI/browser acceptance and for checks that compare index and working-file bytes.
