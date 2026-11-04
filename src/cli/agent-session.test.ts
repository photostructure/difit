import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { detectAgentSession } from './agent-session';

const threadId = '01a19e91-1182-7c53-b9af-60faeece2713';
let codexHome: string;

async function writeRollout(day: string, originator: string): Promise<void> {
  const directory = join(codexHome, 'sessions', ...day.split('-'));
  await mkdir(directory, { recursive: true });
  const meta = { type: 'session_meta', payload: { id: threadId, originator } };
  await writeFile(
    join(directory, `rollout-${day}T15-21-10-${threadId}.jsonl`),
    `${JSON.stringify(meta)}\n{"type":"event_msg"}\n`,
  );
}

beforeEach(async () => {
  codexHome = await mkdtemp(join(tmpdir(), 'difit-codex-home-'));
});

afterEach(async () => {
  await rm(codexHome, { recursive: true, force: true });
});

describe('detectAgentSession', () => {
  it.each([
    { entrypoint: 'claude-desktop', agent: 'Claude Code desktop' },
    { entrypoint: 'cli', agent: 'Claude Code terminal' },
    { entrypoint: 'claude-vscode', agent: 'Claude Code VS Code' },
    { entrypoint: 'sdk-ts', agent: 'Claude Code (sdk-ts)' },
  ])('names Claude Code launched from $entrypoint', async ({ entrypoint, agent }) => {
    expect(
      await detectAgentSession({
        CLAUDE_CODE_ENTRYPOINT: entrypoint,
        CLAUDE_CODE_SESSION_ID: 'claude-session',
      }),
    ).toEqual({ agent, agentSessionId: 'claude-session' });
  });

  it.each([
    { originator: 'Codex Desktop', agent: 'Codex desktop' },
    // codex 0.164.0 lists codex_cli_rs beside codex-tui and codex-cli
    // (`strings <codex binary> | grep codex_cli_rs`), so it does not identify the terminal UI.
    { originator: 'codex_cli_rs', agent: 'Codex (codex_cli_rs)' },
    { originator: 'codex_exec', agent: 'Codex exec' },
    { originator: 'codex_vscode', agent: 'Codex (codex_vscode)' },
  ])(
    'names Codex from the thread rollout originator $originator',
    async ({ originator, agent }) => {
      await writeRollout('2026-11-02', originator);
      expect(
        await detectAgentSession({ CODEX_THREAD_ID: threadId, CODEX_HOME: codexHome }),
      ).toEqual({ agent, agentSessionId: threadId });
    },
  );

  it('leaves the agent unset when the Codex thread has no rollout', async () => {
    expect(await detectAgentSession({ CODEX_THREAD_ID: threadId, CODEX_HOME: codexHome })).toEqual({
      agentSessionId: threadId,
    });
  });

  it('leaves the agent unset when Claude Code exports no entrypoint', async () => {
    expect(await detectAgentSession({ CLAUDE_CODE_SESSION_ID: 'claude-session' })).toEqual({
      agentSessionId: 'claude-session',
    });
  });

  it('prefers Claude Code when both hosts exported their variables', async () => {
    await writeRollout('2026-11-02', 'codex_exec');
    expect(
      await detectAgentSession({
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        CLAUDE_CODE_SESSION_ID: 'claude-session',
        CODEX_THREAD_ID: threadId,
        CODEX_HOME: codexHome,
      }),
    ).toEqual({ agent: 'Claude Code terminal', agentSessionId: 'claude-session' });
  });

  it('detects nothing outside an agent', async () => {
    expect(await detectAgentSession({})).toEqual({});
  });
});
