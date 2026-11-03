import { createContext } from 'react';

export interface AgentUpdatesReadState {
  enabled: boolean;
  markSeen: (threadId: string, messageId: string, revision: string) => void;
}

export const AgentUpdatesContext = createContext<AgentUpdatesReadState | null>(null);
