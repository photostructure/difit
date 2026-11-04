import { createContext } from 'react';

export interface AgentUpdatesReadState {
  enabled: boolean;
  unreadKeys: ReadonlySet<string>;
  setRead: (threadId: string, messageId: string, revision: string, read: boolean) => void;
}

export const AgentUpdatesContext = createContext<AgentUpdatesReadState | null>(null);
