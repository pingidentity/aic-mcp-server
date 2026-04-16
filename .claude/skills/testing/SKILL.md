---
name: testing
description: How to write tests for this codebase — framework, file template, section ordering, and security test requirements
---

# Testing

**Framework**: Vitest + MSW (Mock Service Worker). Tests mirror source structure under `test/tools/<category>/`.

**Core principle**: Test our application logic (request construction, response processing, input validation, error handling), not the API itself.

## Test File Template

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

## Section Ordering

1. Snapshot Test
2. Request Construction
3. Response Handling
4. Input Validation
5. Error Handling

Complex orchestration tools add "Application Logic" after snapshot tests.

## Security Tests

Always include for tools that accept user input:
- Path traversal prevention for ID parameters (`schema.parse('../etc/passwd')` should throw)
- Query injection prevention for user-provided filter strings

## After Adding a Tool

Run `npm run test:snapshots:update` to create its snapshot, then `npm test` to verify.
