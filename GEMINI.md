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

## Adding a New Tool

1. Create `src/tools/<category>/myNewTool.ts`:

```typescript
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idm:*'];

export const myNewToolTool = {
  name: 'myNewTool',
  title: 'My New Tool',
  description: 'What the tool does',
  scopes: SCOPES,
  inputSchema: {
    param1: z.string().describe('Description of param1'),
    param2: z.number().optional().describe('Optional parameter')
  },
  async toolFunction({ param1, param2 }: { param1: string; param2?: number }) {
    const url = `https://${aicBaseUrl}/your/api/endpoint`;
    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET'
      });
      return createToolResponse(formatSuccess(JSON.stringify(data, null, 2), response));
    } catch (error: any) {
      return createToolResponse(`Failed to do thing: ${error.message}`);
    }
  }
};
```

2. Export from `src/tools/<category>/index.ts`:
```typescript
export { myNewToolTool } from './myNewTool.js';
```

3. It auto-registers — `toolHelpers.ts` collects via `Object.values()` on the category module.

Key conventions:
- `SCOPES` as a module-level constant, referenced in both the tool object and `makeAuthenticatedRequest()` calls
- Use `makeAuthenticatedRequest` + `createToolResponse` helpers, not raw `fetch`
- Use `safePathSegmentSchema` for any user-provided ID that goes into a URL path
- Export name convention: `<toolName>Tool` (e.g., `deleteManagedObjectTool`)
- Add `annotations: { destructiveHint: true }` for delete/mutating operations

## Testing

**Framework**: Vitest + MSW (Mock Service Worker). Tests mirror source structure under `test/tools/<category>/`.

**Core principle**: Test our application logic (request construction, response processing, input validation, error handling), not the API itself.

**Test file template**:

```typescript
import { describe, it, expect } from 'vitest';
import { myNewToolTool } from '../../../src/tools/category/myNewTool.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('myNewTool', () => {
  const getSpy = setupTestEnvironment(); // Sets AIC_BASE_URL, spies on makeAuthenticatedRequest

  // 1. Snapshot test (required for every tool)
  it('should match tool schema snapshot', async () => {
    await snapshotTest('myNewTool', myNewToolTool);
  });

  // 2. Request construction — verify URL, scopes, method, body via spy
  describe('Request Construction', () => {
    it('constructs correct URL', async () => {
      await myNewToolTool.toolFunction({ param1: 'value' });
      const [url, scopes, options] = getSpy().mock.calls.at(-1)!;
      expect(url).toBe('https://test.forgeblocks.com/your/api/endpoint');
      expect(scopes).toEqual(['fr:idm:*']);
    });
  });

  // 3. Response handling — use server.use() to provide MSW responses
  // 4. Input validation — test Zod schemas directly
  // 5. Error handling — override handlers with error responses
});
```

**Section ordering in test files**:
1. Snapshot Test
2. Request Construction
3. Response Handling
4. Input Validation
5. Error Handling

Complex orchestration tools add "Application Logic" after snapshot tests.

**Security tests to always include**:
- Path traversal prevention for ID parameters (`schema.parse('../etc/passwd')` should throw)
- Query injection prevention for user-provided filter strings

**After adding a tool**: Run `npm run test:snapshots:update` to create its snapshot, then `npm test` to verify.
