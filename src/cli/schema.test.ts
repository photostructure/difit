import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSchemaCommand } from './schema.js';

interface SchemaDocument {
  $schema: string;
  $ref: string;
  $defs: Record<string, unknown>;
}

function readOutput(log: ReturnType<typeof vi.spyOn>): SchemaDocument {
  expect(log).toHaveBeenCalledTimes(1);
  return JSON.parse(String(log.mock.calls[0]?.[0])) as SchemaDocument;
}

describe('schema command', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints a standalone event schema bundle by default', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const command = createSchemaCommand();
    expect(command.name()).toBe('schema');
    await command.parseAsync(['node', 'difit']);
    const document = readOutput(log);
    expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(document.$ref).toBe('#/$defs/ServerEvent');
    // The bundle must work offline: every reference resolves within this document.
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if ('$ref' in value) {
        const reference = String(value.$ref);
        expect(reference).toMatch(/^#\/\$defs\//);
        expect(document.$defs[reference.slice('#/$defs/'.length)]).toBeDefined();
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(document);
  });

  it('describes message deletion identities and readiness without a revision cursor', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createSchemaCommand().parseAsync(['node', 'difit']);
    const document = readOutput(log);
    const ready = document.$defs.ServerReadyEvent as {
      properties: Record<string, unknown>;
      required: string[];
    };
    const deleted = document.$defs.CommentDeletedEvent as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(ready.properties).not.toHaveProperty('cursor');
    expect(ready.required).not.toContain('cursor');
    expect(deleted.properties).not.toHaveProperty('body');
    expect(deleted.required).toContain('threadId');
    expect(deleted.required).toContain('messageId');
    expect(deleted.required).toContain('cursor');
    expect(document.$defs.ConversationEvent).toMatchObject({
      oneOf: expect.arrayContaining([{ $ref: '#/$defs/CommentDeletedEvent' }]),
    });
  });

  it.each([
    ['events', 'ServerEvent'],
    ['summary', 'SummaryRequest'],
    ['reply', 'ReplyRequest'],
    ['status', 'StatusRequest'],
    ['snapshot', 'SnapshotResponse'],
    ['comments', 'CommentsRequest'],
    ['import', 'CommentImportRequest'],
    ['approval', 'ApprovalRequest'],
  ])('selects the %s root while retaining response definitions', async (name, definition) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createSchemaCommand().parseAsync(['node', 'difit', name]);
    const document = readOutput(log);
    expect(document.$ref).toBe(`#/$defs/${definition}`);
    expect(document.$defs[definition]).toBeDefined();
    for (const response of [
      'SummaryResponse',
      'ReplyResponse',
      'StatusResponse',
      'SnapshotResponse',
      'ErrorResponse',
    ]) {
      expect(document.$defs[response]).toBeDefined();
    }
  });

  it('declares excerpt fields only on thread forms that preserve them', async () => {
    // Ground truth: node node_modules/vitest/vitest.mjs run src/server/server.test.ts -t 'preserves supported excerpts and position behavior'.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createSchemaCommand().parseAsync(['node', 'difit', 'comments']);
    const document = readOutput(log);
    type ThreadForms = { oneOf: { properties: Record<string, unknown> }[] };
    const canonical = document.$defs.CommentThread as ThreadForms;
    const display = document.$defs.DisplayCommentThread as ThreadForms;
    expect(canonical.oneOf[0]?.properties.codeSnapshot).toEqual({ $ref: '#/$defs/CodeSnapshot' });
    expect(canonical.oneOf[1]?.properties).not.toHaveProperty('codeSnapshot');
    for (const variant of display.oneOf)
      expect(variant.properties).not.toHaveProperty('codeSnapshot');
    expect(display.oneOf[0]?.properties.codeContent).toEqual({ type: 'string' });
    expect(display.oneOf[1]?.properties).not.toHaveProperty('codeContent');
  });

  it('rejects an unknown name without writing a misleading schema', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stderr = vi.fn();
    const command = createSchemaCommand().exitOverride().configureOutput({ writeErr: stderr });
    await expect(command.parseAsync(['node', 'difit', 'unknown'])).rejects.toThrow(
      "value 'unknown' is invalid for argument 'name'",
    );
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Allowed choices'));
    expect(log).not.toHaveBeenCalled();
  });

  it('rejects extra arguments instead of ignoring them', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const command = createSchemaCommand().exitOverride().configureOutput({ writeErr: vi.fn() });
    await expect(command.parseAsync(['node', 'difit', 'reply', 'status'])).rejects.toThrow(
      'too many arguments',
    );
    expect(log).not.toHaveBeenCalled();
  });

  it('explains the default root and request/response discovery in help', async () => {
    const output = vi.fn();
    const command = createSchemaCommand().exitOverride().configureOutput({ writeOut: output });
    await expect(command.parseAsync(['node', 'difit', '--help'])).rejects.toMatchObject({
      code: 'commander.helpDisplayed',
    });
    const help = output.mock.calls.map((call) => String(call[0])).join('');
    expect(help).toContain('default/events root validates one JSONL record');
    expect(help).toContain('difit schema summary');
    expect(help).toContain('difit schema snapshot');
    expect(help).toContain('$defs');
  });
});
