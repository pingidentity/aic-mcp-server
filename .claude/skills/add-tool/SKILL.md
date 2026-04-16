---
name: add-tool
description: Required conventions for MCP tool implementation — structure, response formatting, annotations, and registration. TRIGGER when: creating or modifying any tool file in src/tools/; changing inputSchema, toolFunction, or response handling; adding a tool category; touching code that uses makeAuthenticatedRequest, createToolResponse, or formatSuccess. SKIP when: only modifying tests (use testing skill), only reviewing code (use review-conventions skill).
---

# Adding a New Tool

## 1. Create the tool file

Create `src/tools/<category>/myNewTool.ts`:

```typescript
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['<required-oauth-scopes>'];

export const myNewToolTool = {
  name: 'myNewTool',
  title: 'My New Tool',
  description: 'What the tool does',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
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
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to do thing: ${error.message}`);
    }
  }
};
```

## 2. Export from the category index

Add to `src/tools/<category>/index.ts`:

```typescript
export { myNewToolTool } from './myNewTool.js';
```

The tool auto-registers — `toolHelpers.ts` collects via `Object.values()` on each category module.

## Response Formatting

`formatSuccess(data, response)` accepts objects or strings — it handles JSON serialization internally. Always pass the `response` object from `makeAuthenticatedRequest` so the transaction ID (`x-forgerock-transactionid` header) is automatically appended. Transaction IDs are critical for tracing tool calls back to AIC API requests.

For **write operations returning 204** (DELETE, some PUT), there's no response body to pass to `formatSuccess`. Manually extract the transaction ID:

```typescript
const { response } = await makeAuthenticatedRequest(url, SCOPES, { method: 'DELETE' });
const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';
return createToolResponse(`Resource deleted successfully.\nTransaction ID: ${transactionId}`);
```

## Annotations

Every tool should have an `annotations` object describing its behavior to MCP clients. These are hints that guide client behavior (e.g., requiring confirmation, enabling retries).

| Annotation        | Meaning                                                                                                                                             | Default |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `readOnlyHint`    | Tool only reads data, does not modify state                                                                                                         | `false` |
| `destructiveHint` | Tool may perform destructive updates (only meaningful when `readOnlyHint` is `false`)                                                               | `true`  |
| `idempotentHint`  | Calling repeatedly with the same arguments has no additional effect (only meaningful when `readOnlyHint` is `false`)                                | `false` |
| `openWorldHint`   | Tool may interact with an open world of external entities (e.g., web search). If `false`, the domain of interaction is closed (e.g., a memory tool) | `true`  |

Common combinations used in this codebase:

- **Read-only** (GET, list, query): `{ readOnlyHint: true, openWorldHint: true }`
- **Create**: `{ openWorldHint: true }`
- **Update (idempotent)**: `{ idempotentHint: true, openWorldHint: true }`
- **Update (non-idempotent)**: `{ openWorldHint: true }`
- **Delete**: `{ destructiveHint: true, openWorldHint: true }`

## Key Conventions

- Define `SCOPES` as a module-level constant — reference it in both the tool object and `makeAuthenticatedRequest()` calls
- Use `makeAuthenticatedRequest` + `createToolResponse` helpers, not raw `fetch`
- Use `safePathSegmentSchema` from `validationHelpers` for any user-provided ID that goes into a URL path
- Use `z.enum(REALMS)` from `validationHelpers` for realm parameters
- Export name convention: `<toolName>Tool` (e.g., `deleteManagedObjectTool`)

## Adding a New Tool Category

If the tool doesn't fit an existing category (`managedObjects`, `themes`, `esv`, `logs`, `am`):

1. Create `src/tools/<newCategory>/` with your tool files
2. Create `src/tools/<newCategory>/index.ts` re-exporting all tools
3. Wire it into `src/utils/toolHelpers.ts`:
   - Add `import * as newCategoryTools from '../tools/<newCategory>/index.js';`
   - Add `...(Object.values(newCategoryTools) as Tool[])` to the tools array in `getAllTools()`
   - If the category requires browser-based auth (like AM tools), add it inside the `!isDockerMode` guard instead
