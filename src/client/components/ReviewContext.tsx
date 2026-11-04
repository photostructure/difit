import type { ReviewContext as ReviewContextData } from '../../types/diff';

export function ReviewContext({ context }: { context?: ReviewContextData }) {
  const name = context?.repositoryName || 'Imported diff';
  if (!context) return null;

  return (
    <section aria-label="Review context" className="min-w-0">
      <dl className="grid min-w-0 grid-cols-1 gap-y-1 pb-3 pt-2 text-xs [&>dt:not(:first-child)]:mt-2">
        {context.agent && (
          <>
            <dt className="ui-label">Agent</dt>
            <dd className="min-w-0 select-text break-all ui-value">{context.agent}</dd>
          </>
        )}
        {context.agentSessionName && (
          <>
            <dt className="ui-label">Agent session name</dt>
            <dd className="min-w-0 select-text break-all ui-value">{context.agentSessionName}</dd>
          </>
        )}
        {context.agentSessionId && (
          <>
            <dt className="ui-label">Agent session ID</dt>
            <dd className="min-w-0 select-text break-all font-mono ui-value">
              {context.agentSessionId}
            </dd>
          </>
        )}
        {context.source === 'stdin' && (
          <>
            <dt className="ui-label">Review source</dt>
            <dd className="min-w-0 ui-value">Imported diff</dd>
          </>
        )}
        {context.repositoryPath && (
          <>
            <dt className="ui-label">Repository</dt>
            <dd className="min-w-0 select-text break-all ui-value">{name}</dd>
            <dt className="ui-label">Worktree</dt>
            <dd className="min-w-0 select-text break-all font-mono ui-value">
              {context.repositoryPath}
            </dd>
          </>
        )}
        <dt className="ui-label">Browser address</dt>
        <dd className="min-w-0 select-text break-all font-mono ui-value">
          {window.location.origin}
        </dd>
        <dt className="ui-label">Server host</dt>
        <dd className="min-w-0 select-text break-all font-mono ui-value">{context.hostname}</dd>
        <dt className="ui-label">Launched from</dt>
        <dd className="min-w-0 select-text break-all font-mono ui-value">
          {context.workingDirectory}
        </dd>
      </dl>
    </section>
  );
}
