import type { ConversationStreamEvent } from './conversation.js';
import type { DiffSelection, ReviewContext } from './diff.js';

interface ServerReadyEvent {
  type: 'server.ready';
  port: number;
  url: string;
  launchUrl: string;
  pid: number;
  reviewContext: ReviewContext;
  selection: DiffSelection;
  reviewId: string;
  timestamp: string;
}

export interface ServerShutdownEvent {
  type: 'server.shutdown';
  reason: 'closed' | 'client-disconnected' | 'approved' | 'SIGINT' | 'SIGTERM';
  pid: number;
  timestamp: string;
}

interface ServerBackgroundEvent {
  type: 'server.background';
  port: number;
  url: string;
  pid: number;
  timestamp: string;
}

export type ServerEvent =
  | ConversationStreamEvent
  | ServerReadyEvent
  | ServerShutdownEvent
  | ServerBackgroundEvent;
