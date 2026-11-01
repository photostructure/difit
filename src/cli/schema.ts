import { Argument, Command } from 'commander';

type Schema = Record<string, unknown>;

const string: Schema = { type: 'string' };
const boolean: Schema = { type: 'boolean' };
const nonblank: Schema = { type: 'string', pattern: '\\S' };
const timestamp: Schema = { type: 'string', description: 'Timestamp, normally ISO 8601.' };
const version: Schema = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const cursor: Schema = {
  type: 'string',
  description:
    'Opaque cursor valid only for this server process. Recover current IDs and revisions with comment snapshot after a restart.',
};
const revisionCursor: Schema = {
  ...cursor,
  description:
    'Exact comment revision: use the comment.created/updated cursor or snapshot message.progress.cursor. A comment.progress event has a different top-level stream cursor. Stale revisions return HTTP 409.',
};
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const array = (items: Schema): Schema => ({ type: 'array', items });
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({
  type: 'object',
  properties,
  required,
});
const enumeration = (...values: string[]): Schema => ({ type: 'string', enum: values });
const summaryFields = {
  commitMessage: {
    type: 'string',
    maxLength: 16000,
    description:
      'Proposed commit message; the server limits this to 16000 JavaScript UTF-16 code units.',
  },
  rationale: {
    type: 'string',
    maxLength: 4000,
    description:
      "The user's TLDR explaining the proposed change; the server limits this to 4000 JavaScript UTF-16 code units.",
  },
};
const messageFields = {
  id: string,
  origin: enumeration('user', 'agent'),
  progress: ref('CommentProgress'),
  intent: ref('CommentIntent'),
  body: string,
  author: string,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const threadFields = {
  id: string,
  scope: enumeration('line', 'review'),
  createdAt: timestamp,
  updatedAt: timestamp,
  resolution: ref('ThreadResolution'),
  isQuestion: boolean,
  messages: array(ref('CommentMessage')),
};
const streamFields = {
  cursor,
  origin: enumeration('user', 'agent'),
  reviewId: string,
  selection: ref('DiffSelection'),
  timestamp,
};
const importFields = {
  type: enumeration('thread', 'reply'),
  id: string,
  filePath: nonblank,
  position: ref('CommentPosition'),
  body: nonblank,
  author: string,
  createdAt: timestamp,
  updatedAt: timestamp,
  codeSnapshot: ref('CodeSnapshot'),
};

const definitions: Record<string, Schema> = {
  DiffSelection: object(
    {
      baseCommitish: string,
      targetCommitish: string,
      baseMode: enumeration('direct', 'merge-base'),
    },
    ['baseCommitish', 'targetCommitish'],
  ),
  ReviewContext: object(
    {
      source: enumeration('git', 'stdin'),
      repositoryName: string,
      repositoryPath: string,
      workingDirectory: string,
      hostname: string,
    },
    ['source', 'workingDirectory', 'hostname'],
  ),
  LineRange: {
    description:
      'A positive line number or inclusive multiline range; start must be <= end. Comment imports (--comment, comment add, POST /api/comment-imports) validate this rule. POST /api/comments trusts thread-form positions and normalizes invalid display ranges to line 1; clients must send valid positions. Standard JSON Schema cannot express the relational constraint.',
    oneOf: [
      { type: 'integer', minimum: 1 },
      object({ start: { type: 'integer', minimum: 1 }, end: { type: 'integer', minimum: 1 } }),
    ],
  },
  DisplayLineRange: {
    description:
      'A positive line number or [start, end] inclusive multiline range; start must be <= end.',
    oneOf: [
      { type: 'integer', minimum: 1 },
      {
        type: 'array',
        prefixItems: [
          { type: 'integer', minimum: 1 },
          { type: 'integer', minimum: 1 },
        ],
        items: false,
        minItems: 2,
        maxItems: 2,
      },
    ],
  },
  CommentPosition: object({ side: enumeration('old', 'new'), line: ref('LineRange') }),
  CodeSnapshot: object({ content: string, language: string }, ['content']),
  CommentIntent: enumeration('comment', 'question', 'change'),
  CommentProgress: object({
    status: enumeration('queued', 'delivered', 'read', 'thinking', 'replying', 'noted', 'replied'),
    cursor: revisionCursor,
    updatedAt: timestamp,
  }),
  CommentMessage: object(messageFields, ['id', 'body', 'createdAt', 'updatedAt']),
  ThreadResolution: object({ resolved: boolean, updatedAt: timestamp }),
  CommentThread: {
    oneOf: [
      object(
        {
          ...threadFields,
          scope: { const: 'line' },
          codeSnapshot: ref('CodeSnapshot'),
          filePath: string,
          position: ref('CommentPosition'),
        },
        ['id', 'createdAt', 'updatedAt', 'messages', 'filePath', 'position'],
      ),
      {
        ...object({ ...threadFields, scope: { const: 'review' } }, [
          'id',
          'scope',
          'createdAt',
          'updatedAt',
          'messages',
        ]),
        not: { anyOf: [{ required: ['filePath'] }, { required: ['position'] }] },
      },
    ],
  },
  DisplayCommentThread: {
    description:
      'Browser comment representation for POST /api/comments; line ranges use [start, end]. Inline excerpts use codeContent; review-scope threads do not preserve excerpts.',
    oneOf: [
      object(
        {
          ...threadFields,
          scope: { const: 'line' },
          file: string,
          line: ref('DisplayLineRange'),
          side: enumeration('old', 'new'),
          codeContent: string,
          isOutdated: boolean,
        },
        ['id', 'createdAt', 'updatedAt', 'messages', 'file', 'line'],
      ),
      {
        ...object({ ...threadFields, scope: { const: 'review' }, isOutdated: boolean }, [
          'id',
          'scope',
          'createdAt',
          'updatedAt',
          'messages',
        ]),
        not: { anyOf: [{ required: ['file'] }, { required: ['line'] }, { required: ['side'] }] },
      },
    ],
  },
  ReviewSummary: object({ ...summaryFields, version, updatedAt: timestamp }, [
    'commitMessage',
    'rationale',
    'version',
  ]),
  ReviewApproval: object({ approved: boolean, updatedAt: timestamp, cursor }, ['approved']),
  ServerReadyEvent: object({
    type: { const: 'server.ready' },
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    url: string,
    launchUrl: string,
    pid: { type: 'integer', minimum: 1 },
    reviewContext: ref('ReviewContext'),
    selection: ref('DiffSelection'),
    reviewId: string,
    timestamp,
  }),
  ServerBackgroundEvent: object({
    type: { const: 'server.background' },
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    url: string,
    pid: { type: 'integer', minimum: 1 },
    timestamp,
  }),
  ServerShutdownEvent: object({
    type: { const: 'server.shutdown' },
    reason: enumeration('closed', 'client-disconnected', 'approved', 'SIGINT', 'SIGTERM'),
    pid: { type: 'integer', minimum: 1 },
    timestamp,
  }),
  CommentEvent: object(
    {
      ...streamFields,
      type: enumeration('comment.created', 'comment.updated'),
      threadId: string,
      messageId: string,
      scope: enumeration('line', 'review'),
      file: string,
      side: enumeration('old', 'new'),
      line: ref('LineRange'),
      intent: ref('CommentIntent'),
      body: string,
      author: string,
      codeSnapshot: ref('CodeSnapshot'),
    },
    [
      'type',
      'cursor',
      'origin',
      'reviewId',
      'selection',
      'threadId',
      'messageId',
      'body',
      'timestamp',
    ],
  ),
  CommentDeletedEvent: object({
    ...streamFields,
    type: { const: 'comment.deleted' },
    threadId: string,
    messageId: string,
  }),
  CommentProgressEvent: object({
    ...streamFields,
    type: { const: 'comment.progress' },
    origin: { const: 'agent' },
    threadId: string,
    messageId: string,
    progress: ref('CommentProgress'),
  }),
  ThreadEvent: object({
    ...streamFields,
    type: enumeration('thread.resolved', 'thread.reopened', 'thread.deleted'),
    threadId: string,
  }),
  ReviewSummaryEvent: object({
    ...streamFields,
    type: { const: 'review.summary' },
    summary: ref('ReviewSummary'),
  }),
  ReviewApprovalEvent: object({
    ...streamFields,
    type: { const: 'review.approval' },
    approved: boolean,
  }),
  ConversationEvent: {
    oneOf: [
      'CommentEvent',
      'CommentDeletedEvent',
      'CommentProgressEvent',
      'ThreadEvent',
      'ReviewSummaryEvent',
      'ReviewApprovalEvent',
    ].map(ref),
  },
  ServerEvent: {
    description:
      'One complete JSON object per stdout line. Newlines within strings are JSON escaped. Stdout delivery does not acknowledge comment progress; send an explicit StatusRequest.',
    oneOf: [
      'ServerReadyEvent',
      'ServerBackgroundEvent',
      'ServerShutdownEvent',
      'ConversationEvent',
    ].map(ref),
  },
  ReviewSummaryEditRequest: {
    ...object({ ...summaryFields, baseVersion: version }),
    description:
      'POST /api/review-summary for a browser-selected review. baseVersion must match the current summary.version; changes revoke approval.',
  },
  SummaryRequest: {
    ...object({
      reviewId: { type: 'string', minLength: 1 },
      ...summaryFields,
      baseVersion: version,
    }),
    description:
      'JSON input to comment summary (POST /api/conversation/summary). baseVersion must equal the current summary.version. Empty text clears a field; edits revoke approval.',
  },
  SummaryResponse: ref('ReviewSummary'),
  ReplyRequest: {
    ...object(
      {
        reviewId: string,
        threadId: string,
        inReplyTo: string,
        body: nonblank,
        cursor: revisionCursor,
        author: nonblank,
      },
      ['reviewId', 'threadId', 'inReplyTo', 'body'],
    ),
    description:
      'JSON input to comment reply. inReplyTo is an event messageId. Optional cursor pins the exact comment revision and is required to mark it replied; retries are idempotent. Author defaults to Agent.',
  },
  ReplyResponse: object({
    success: { const: true },
    reviewId: string,
    threadId: string,
    messageId: string,
  }),
  StatusRequest: {
    ...object({
      reviewId: string,
      threadId: string,
      messageId: string,
      cursor: revisionCursor,
      status: enumeration('delivered', 'read', 'thinking', 'replying', 'noted'),
    }),
    description:
      'JSON input to comment status. Must identify an existing user message and its exact revision. Progress only advances; queued and replied are server-managed.',
  },
  StatusResponse: ref('SuccessResponse'),
  SuccessResponse: object({ success: { const: true } }),
  ErrorResponse: object({ error: string, summary: ref('ReviewSummary') }, ['error']),
  SnapshotResponse: object({
    cursor: {
      ...cursor,
      description:
        'Opaque state checkpoint captured with this snapshot. Equality with a concurrently buffered event cursor means that event is already reflected in the snapshot. Do not decode, sort, or use it for replay or message revision guards. Full-state reconciliation may ignore it.',
    },
    reviews: array(
      object({
        id: string,
        selection: ref('DiffSelection'),
        threads: array(ref('CommentThread')),
        approval: ref('ReviewApproval'),
        summary: ref('ReviewSummary'),
      }),
    ),
  }),
  CommentImport: object(importFields, ['type', 'filePath', 'position', 'body']),
  CommentImportRequest: {
    description:
      'JSON input to --comment / comment add (POST /api/comment-imports). A single object or array. Import timestamps must be parseable dates; body is trimmed. Reply imports target the newest matching file/position thread.',
    oneOf: [ref('CommentImport'), array(ref('CommentImport'))],
  },
  CommentImportResponse: object({
    success: { const: true },
    changed: boolean,
    count: { type: 'integer', minimum: 0 },
    importId: string,
    warnings: array(string),
  }),
  CommentAddResponse: object(
    {
      success: boolean,
      importId: string,
      count: { type: 'integer', minimum: 0 },
      warnings: array(string),
    },
    ['success', 'count', 'warnings'],
  ),
  LegacyComment: object(
    {
      id: string,
      file: string,
      line: ref('DisplayLineRange'),
      body: string,
      timestamp,
      author: string,
      codeContent: string,
      side: enumeration('old', 'new'),
    },
    ['id', 'file', 'line', 'body', 'timestamp'],
  ),
  CommentsRequest: {
    description:
      'POST /api/comments edits/replaces comments, including message body and intent edits. A stale baseVersion merges instead of replacing; server-owned progress is ignored.',
    anyOf: [
      object(
        {
          threads: array({ anyOf: [ref('CommentThread'), ref('DisplayCommentThread')] }),
          baseVersion: { type: 'integer', minimum: 0 },
        },
        ['threads'],
      ),
      object(
        { comments: array(ref('LegacyComment')), baseVersion: { type: 'integer', minimum: 0 } },
        ['comments'],
      ),
    ],
  },
  CommentsResponse: object({
    version: { type: 'integer', minimum: 0 },
    threads: array(ref('CommentThread')),
  }),
  CommentsEditResponse: object({
    success: { const: true },
    merged: boolean,
    version: { type: 'integer', minimum: 0 },
    threads: array(ref('CommentThread')),
  }),
  ResolutionRequest: object({ resolved: boolean, reviewId: string }, ['resolved']),
  ResolutionResponse: ref('SuccessResponse'),
  DeleteResponse: object({
    success: { const: true },
    threadId: string,
    version: { type: 'integer', minimum: 0 },
  }),
  CommentActionResponse: {
    description:
      'JSON output from comment resolve/reopen/delete; the corresponding resolved, reopened, or deleted array is present.',
    anyOf: ['resolved', 'reopened', 'deleted'].map((action) =>
      object({
        success: boolean,
        [action]: array(string),
        notFound: array(string),
        errors: array(object({ threadId: string, error: string })),
      }),
    ),
  },
  ApprovalRequest: {
    ...object({ approved: boolean, summaryVersion: version }, ['approved']),
    description:
      'POST /api/approval. Approval requires summaryVersion to match the current summary.version (omission means 0); revocation does not require a matching version.',
  },
  ApprovalResponse: ref('ReviewApproval'),
};

const roots = {
  events: 'ServerEvent',
  summary: 'SummaryRequest',
  reply: 'ReplyRequest',
  status: 'StatusRequest',
  snapshot: 'SnapshotResponse',
  comments: 'CommentsRequest',
  import: 'CommentImportRequest',
  approval: 'ApprovalRequest',
};

export function createSchemaCommand(): Command {
  return new Command('schema')
    .description('Print JSON Schema for stdout events and comment request/response JSON')
    .addArgument(
      new Argument('[name]', 'schema root; all request/response definitions remain in $defs')
        .choices(Object.keys(roots))
        .default('events'),
    )
    .addHelpText(
      'after',
      `
The default/events root validates one JSONL record. Request roots validate JSON
input; snapshot validates the response. All roots include every $defs definition.

Examples:
  difit schema > difit.schema.json
  difit schema summary > summary-request.schema.json
  difit schema snapshot > snapshot-response.schema.json
`,
    )
    .action((name: keyof typeof roots) => {
      console.log(
        JSON.stringify(
          {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            title: 'difit events and comment API',
            description:
              'Machine-readable event and JSON request/response contracts for expected-valid payloads. Additional properties are tolerated. The server checks existence, revision matching, version conflicts, and import dates/ranges. POST /api/comments is not a validation boundary: it may preserve invalid thread positions or normalize invalid display ranges.',
            $ref: `#/$defs/${roots[name]}`,
            $defs: definitions,
          },
          null,
          2,
        ),
      );
    });
}
