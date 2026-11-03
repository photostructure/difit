/** Connection state is advisory: a connected or visible tab does not prove attention. */
export interface ReviewPresenceSnapshot {
  reviewers: { connected: number; visible: number };
  listeners: number;
}
