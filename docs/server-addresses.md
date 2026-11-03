# Addressing a running server

Companion commands default to `localhost`. When the server listens only on a
specific interface, select that interface explicitly:

```sh
/home/mrm/.local/bin/difit comment snapshot --host 10.1.1.24 --port 4966
/home/mrm/.local/bin/difit comment reply --host 10.1.1.24 --port 4966 < /tmp/reply.json
```

Use the actual host and API port from `server.ready.url` or the equivalent background launch URL. `--host`
is available on every `comment` command and named-review `create` and `update`. An explicit
host changes the connection destination; it does not rebind or restart the server.
These companion commands use HTTP. IPv6 hosts may be supplied with or without
brackets. Do not put a URL scheme, credentials or path in `--host`.

Message IDs, exact revision cursors, capture guards and explicit delivery receipts
work the same way regardless of the chosen interface. A server bound to a LAN
address is not inherently inaccessible to an agent; use its actual address rather
than falling back to a chat-only reply.
