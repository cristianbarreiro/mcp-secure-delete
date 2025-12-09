# Copilot Instructions

## Project Snapshot
- MCP server that exposes filesystem utilities for Linux-only "secure" deletion; entry point `src/server.ts`, build output `dist/server.js`.
- Uses `@modelcontextprotocol/sdk` + `StdioServerTransport`; server must keep stdout reserved for JSON-RPC and logs go to stderr only.
- Two tools only: `check_path` (preflight info) and `secure_delete` (best-effort erase via `shred`). Metadata is also declared in `mcp.json`.

## Build & Run Workflow
- Install deps once with `npm install` (Node 20+ required, `shred` must exist in PATH).
- Type-check and emit JS with `npm run build`; CLI clients use `node dist/server.js` (matching `mcp.json`).
- Hot dev loop is `npm run dev` (ts-node on `src/server.ts`).
- Smoke-test the stdio protocol using `node test-mcp.js` after `npm run build`; the script expects `dist/server.js` and optional sample files in `./test-files/`.

## Architectural Notes
- Request handling lives entirely in `src/server.ts`: `ListTools` output is hard-coded; `CallTool` dispatches by tool `name`.
- Arguments are validated with zod schemas (`checkPathInput`, `secureDeleteInput`). Stick to these patterns for new tools to keep error messaging consistent.
- Tool outputs are JSON objects stringified and returned as `{ content: [{ type: "text", text }] }` to satisfy MCP text responses.
- `secure_delete` shells out via `execAsync`; directories require `recursive=true` and run `find ... -exec shred ... && rm -rf`. Always sanitize paths with `JSON.stringify(path)` before interpolation.

## Implementation Patterns & Conventions
- Always perform `fs.stat` + `fs.access` permission checks before mutating the filesystem; mimic the early-return JSON error structure already used.
- Keep `dry_run` logic fast and side-effect free; respond with `dry_run: true` marker and descriptive `message`.
- For new tools: add a schema, describe it in `ListToolsRequest`, handle it inside the single `CallTool` handler, and ensure responses remain pure JSON text (clients expect to parse it).
- Avoid writing to stdout except for JSON-RPC frames--debug info should remain `console.error`.
- When touching build config, remember the repo is `type: module` with `NodeNext` resolution; prefer ES module syntax everywhere.

## Testing & Verification
- Manual tests: run `node test-mcp.js` to walk through initialize -> list -> tool invocations; extend this script if you add new tools so CI clients can reuse it.
- Safe experimentation: use `secure_delete` with `dry_run: true` on temp paths before attempting destructive runs; README emphatically documents SSD/journaled FS limitations--echo that warning in new tooling.

## Safety Considerations
- This service can irreversibly remove user data; never default to `recursive=true` or `dry_run=false` for new flows.
- Assume multi-user Linux environments: verify write permissions with `fs.access` and return informative permission errors rather than throwing.
- `shred` behavior differs across filesystems; surface stderr/stdout in responses so clients can diagnose issues without diving into server logs.
