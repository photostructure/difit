import { randomUUID } from 'node:crypto';

import type { ReviewPresenceSnapshot } from '../types/presence.js';

/** Transport presence stays outside the replay journal and never acknowledges messages. */
export class ReviewPresence {
  private readonly tabs = new Map<symbol, { id: string; visible: boolean }>();
  private readonly listeners = new Map<string, { count: number; timer?: NodeJS.Timeout }>();
  private readonly observers = new Set<(snapshot: ReviewPresenceSnapshot) => void>();

  snapshot(): ReviewPresenceSnapshot {
    return {
      reviewers: {
        connected: new Set([...this.tabs.values()].map((tab) => tab.id)).size,
        visible: new Set([...this.tabs.values()].filter((tab) => tab.visible).map((tab) => tab.id))
          .size,
      },
      listeners: this.listeners.size,
    };
  }

  private changed(): void {
    const snapshot = this.snapshot();
    for (const observer of this.observers) observer(snapshot);
  }

  subscribe(observer: (snapshot: ReviewPresenceSnapshot) => void): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }

  connectReviewer(id: string = randomUUID(), visible = true): () => void {
    const connection = Symbol();
    this.tabs.set(connection, { id, visible });
    this.changed();
    return () => {
      if (this.tabs.delete(connection)) this.changed();
    };
  }

  connectListener(id: string): () => void {
    let listener = this.listeners.get(id);
    const existed = Boolean(listener);
    if (!listener) {
      listener = { count: 0 };
      this.listeners.set(id, listener);
    }
    clearTimeout(listener.timer);
    listener.count += 1;
    if (!existed) this.changed();
    const entry = listener;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.listeners.get(id) !== entry) return;
      entry.count -= 1;
      if (entry.count > 0) return;
      // A long-poll renewal is still the same listener; avoid a flickering badge.
      entry.timer = setTimeout(() => {
        this.listeners.delete(id);
        this.changed();
      }, 1000);
      entry.timer.unref();
    };
  }

  updateReviewer(id: string, visible: boolean): void {
    let changed = false;
    for (const tab of this.tabs.values()) {
      if (tab.id === id && tab.visible !== visible) {
        tab.visible = visible;
        changed = true;
      }
    }
    if (changed) this.changed();
  }

  dispose(): void {
    for (const listener of this.listeners.values()) clearTimeout(listener.timer);
    this.observers.clear();
    this.listeners.clear();
    this.tabs.clear();
  }
}
