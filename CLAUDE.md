# PingOne AIC MCP Server

TypeScript MCP server that exposes tools for AI agents to interact with PingOne Advanced Identity Cloud (AIC). Tools cover managed object CRUD, theme management, environment secrets/variables, log querying, and AM journey/script management. Uses OAuth 2.0 (PKCE locally, Device Code Flow in containers) so all actions are traceable to authenticated users.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Clean build (rm -rf dist && tsc)
npm run dev          # Watch mode (tsc -w)
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode tests
npm run test:coverage
npm run test:snapshots:update   # UPDATE_SNAPSHOTS=true vitest run
npm run typecheck    # Type check (tsc --noEmit)
npm run lint         # ESLint
npm run lint:fix
npm run format       # Prettier
npm run format:check
```

## Environment Variables

- **`AIC_BASE_URL`** (required): PingOne AIC hostname (e.g., `openam-example.forgeblocks.com`). No `https://` prefix. Server exits on startup if not set.
- **`DOCKER_CONTAINER`**: Set to `'true'` to use Device Code Flow instead of PKCE. AM tools are excluded in Docker mode.

## Architecture

- **Entry point**: `src/index.ts` — creates MCP server, collects all tools via `getAllTools()` from `src/utils/toolHelpers.ts`, registers them with `server.registerTool()`
- **Tool categories**: `src/tools/{managedObjects,themes,esv,logs,am}/` — each has an `index.ts` that re-exports all tools. Tools are auto-registered via `Object.values()` on these modules
- **Auth**: `src/services/authService.ts` — all scopes collected upfront at startup; individual tools call `getToken(scopes)` which does RFC 8693 token exchange for scoped-down tokens
- **Shared helpers**:
  - `src/utils/apiHelpers.ts` — `makeAuthenticatedRequest(url, scopes, options)` and `createToolResponse(text)`
  - `src/utils/responseHelpers.ts` — `formatSuccess()`, `formatError()`
  - `src/utils/validationHelpers.ts` — `safePathSegmentSchema` (path traversal prevention), `REALMS` constant

## Testing

Vitest + MSW. Tests mirror source structure under `test/tools/<category>/`. Run `npm test` to execute, `npm run test:snapshots:update` after adding/changing a tool schema.
