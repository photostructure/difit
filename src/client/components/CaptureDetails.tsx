import type { NamedReviewMetadata } from '../../types/review';

export function CaptureDetails({ capture }: { capture: NamedReviewMetadata }) {
  return (
    <section
      aria-label="Named review capture"
      className="border-b border-github-border px-3 py-2 text-xs"
    >
      <dl className="grid gap-y-1">
        <dt className="ui-label">Review</dt>
        <dd className="ui-value break-all font-medium">{capture.name}</dd>
        <dt className="ui-label">Capture</dt>
        <dd className="ui-value">v{capture.version}</dd>
        <dt className="ui-label">Digest</dt>
        <dd className="ui-value break-all font-mono">{capture.patchDigest}</dd>
        <dt className="ui-label">Base</dt>
        <dd className="ui-value break-all font-mono">{capture.baseCommit}</dd>
      </dl>
    </section>
  );
}
