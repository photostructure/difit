import type { ReactNode } from 'react';

import { AgentUpdatesContext, type AgentUpdatesReadState } from './AgentUpdatesContext';
import { WordHighlightProvider } from './WordHighlightContext';

export function ReviewProviders({
  agentUpdates,
  children,
}: {
  agentUpdates: AgentUpdatesReadState;
  children: ReactNode;
}) {
  return (
    <AgentUpdatesContext.Provider value={agentUpdates}>
      <WordHighlightProvider>{children}</WordHighlightProvider>
    </AgentUpdatesContext.Provider>
  );
}
