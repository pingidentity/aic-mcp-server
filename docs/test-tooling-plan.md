# Test Tooling Setup Plan

## Status: ✅ COMPLETE

**All phases completed as of 2025-01-21.**

## Overview

This document outlines the setup of testing infrastructure for the PingOne AIC MCP Server. The approach follows the Auth0 MCP server pattern, focusing on unit testing with MSW (Mock Service Worker) for API mocking, plus snapshot testing for tool schema stability.

## Goals

1. ✅ Set up Vitest as the test runner (ESM-compatible, fast, modern)
2. ✅ Configure MSW for network-level API mocking
3. ✅ Create minimal mock data (just enough to validate tool execution)
4. ✅ Implement snapshot testing for tool schemas
5. ✅ Establish test directory structure
6. ✅ Add npm scripts for testing workflows
7. ✅ Validate setup with trivial "smoke test" examples
8. ✅ Add Authorization header validation to MSW handlers
9. ✅ Create shared tool collection utility

## Phase 1: Install Dependencies

### Required Packages

```bash
npm install -D vitest@^2.1.0 \
  @vitest/coverage-v8@^2.1.0 \
  @vitest/ui@^2.1.0 \
  msw@^2.7.3
```

**Rationale:**
- `vitest` - Modern test runner with native ESM support (matches our `"type": "module"`)
- `@vitest/coverage-v8` - V8-based coverage reporting
- `@vitest/ui` - Interactive test UI for development
- `msw` - Mock Service Worker for network interception

## Phase 2: Directory Structure ✅

Created the following directory structure:

```
vitest.config.ts                    # Vitest configuration (ROOT LEVEL)
test/
├── setup.ts                        # Global test setup (MSW, mocks, AuthService init)
├── helpers/
│   └── snapshotTest.ts            # Snapshot testing utility
├── mocks/
│   ├── handlers.ts                # Centralized MSW handlers with auth validation
│   └── mockData.ts                # Minimal mock data fixtures
├── __snapshots__/                 # Tool schema snapshots (auto-generated)
└── tools/
    ├── managedObjects/
    │   └── queryManagedObjects.test.ts  # Smoke test
    ├── themes/
    │   └── getThemes.test.ts            # Smoke test
    ├── logs/
    │   └── getLogSources.test.ts        # Smoke test
    └── esv/
        └── queryVariables.test.ts       # Smoke test
```

**Note:** `vitest.config.ts` is at the root level, not in `test/` directory. The `test/mocks/config.ts` file was removed as unused.

## Phase 3: Core Configuration Files ✅

### 3.1 Vitest Configuration

**File:** `vitest.config.ts` (root level)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    env: {
      AIC_BASE_URL: 'test.forgeblocks.com',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',       // Re-export files
        'src/config/**',         // Static configuration
      ],
      // No thresholds initially - we'll add them as we build coverage
    },
  },
});
```

**Key Features:**
- `globals: true` - No need to import `describe`, `it`, `expect`
- `environment: 'node'` - Node.js environment for server testing
- `setupFiles` - Run global setup before all tests
- `env.AIC_BASE_URL` - Required environment variable for tests
- Coverage excludes re-export and config files

**Note:** No `NODE_ENV: 'test'` in env - we use dependency injection instead.

### 3.2 Global Setup File

**File:** `test/setup.ts`

```typescript
import { beforeAll, afterEach, afterAll, vi } from 'vitest';

// ===== MOCKS MUST BE FIRST (vi.mock is hoisted) =====

// Mock keytar globally (system keychain access)
// Provide a valid cached token to avoid triggering OAuth flow
vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn().mockResolvedValue(undefined),
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      accessToken: 'mock-token',
      expiresAt: Date.now() + 3600000, // Expires in 1 hour
      aicBaseUrl: 'test.forgeblocks.com',
    })),
    deletePassword: vi.fn().mockResolvedValue(true),
  },
}));

// Mock 'open' package (browser launching)
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// Mock debug module (used internally by some packages)
vi.mock('debug', () => ({
  default: () => vi.fn(),
}));

// ===== NOW SAFE TO IMPORT MODULES =====

import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers.js';
import { initAuthService } from '../src/services/authService.js';
import { getAllScopes } from '../src/utils/toolHelpers.js';

// Initialize AuthService IMMEDIATELY at module level (before any tests run)
// Use shared utility to collect all scopes (same as src/index.ts)
const allScopes = getAllScopes();

// Initialize auth service with all scopes and test config
// Allow cached tokens on first request to avoid triggering OAuth flow in tests
initAuthService(allScopes, { allowCachedOnFirstRequest: true });

// Create MSW server with all handlers
export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'warn' // Warn on unmocked requests (helps debug)
  });
});

// Reset handlers after each test to prevent cross-test contamination
afterEach(() => {
  server.resetHandlers();
});

// Clean shutdown after all tests
afterAll(() => {
  server.close();
});
```

**Key Features:**
- Centralized MSW server lifecycle management
- Global mocks for system dependencies (keytar, browser) - **MUST be before imports due to hoisting**
- AuthService initialization with dependency injection (`allowCachedOnFirstRequest: true`)
- Uses shared `getAllScopes()` utility to match production scope collection
- Handler reset between tests prevents state leakage

### 3.3 Mock Data Fixtures (Minimal)

**File:** `test/mocks/mockData.ts`

```typescript
// Minimal generic object for managed object testing
// Works for users, roles, groups, organizations
export const mockManagedObject = {
  _id: 'obj-123',
  _rev: '1',
  name: 'Test Object',
  description: 'Test Description',
};

export const mockManagedObjects = [
  mockManagedObject,
  { _id: 'obj-456', _rev: '1', name: 'Test Object 2', description: 'Test Description 2' },
];

// Minimal theme data
export const mockTheme = {
  _id: 'theme-123',
  name: 'Test Theme',
  isDefault: false,
};

export const mockThemes = [mockTheme];

// Minimal ESV data
export const mockVariable = {
  _id: 'esv-test',
  type: 'string',
  valueBase64: Buffer.from('test-value').toString('base64'),
};

export const mockVariables = [mockVariable];

// Minimal log sources
export const mockLogSources = [
  { _id: 'am-authentication', status: 'ACTIVE' },
  { _id: 'idm-activity', status: 'ACTIVE' },
];
```

**Key Features:**
- Single generic object works for all managed object types
- Minimal fields - just enough for tests to pass
- Easy to maintain

## Phase 4: MSW Handlers ✅

**File:** `test/mocks/handlers.ts`

```typescript
import { http, HttpResponse } from 'msw';
import { mockManagedObjects, mockThemes, mockVariables, mockLogSources } from './mockData';

export const handlers = [
  // OAuth - PKCE authorization code exchange
  http.post('https://*/am/oauth2/access_token', async ({ request }) => {
    const body = await request.text();
    const params = new URLSearchParams(body);

    if (params.get('grant_type') === 'authorization_code') {
      return HttpResponse.json({
        access_token: 'mock-primary-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }

    // RFC 8693 token exchange
    if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:token-exchange') {
      return HttpResponse.json({
        access_token: 'mock-scoped-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }

    return new HttpResponse(null, { status: 400 });
  }),

  // Query managed objects (generic for all object types)
  http.get('https://*/openidm/managed/:objectType', ({ request }) => {
    const url = new URL(request.url);
    const pageSize = parseInt(url.searchParams.get('_pageSize') || '50');

    return HttpResponse.json({
      result: mockManagedObjects.slice(0, pageSize),
      resultCount: mockManagedObjects.length,
      totalPagedResults: mockManagedObjects.length,
      pagedResultsCookie: null,
    });
  }),

  // Get managed object schema
  http.get('https://*/openidm/config/managed', () => {
    return HttpResponse.json({
      objects: [{
        name: 'alpha_user',
        schema: { required: ['userName'], properties: { userName: { type: 'string' } } },
      }],
    });
  }),

  // Create managed object
  http.post('https://*/openidm/managed/:objectType', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ _id: 'new-id', _rev: '1', ...body });
  }),

  // Get single managed object
  http.get('https://*/openidm/managed/:objectType/:objectId', ({ params }) => {
    return HttpResponse.json({ ...mockManagedObjects[0], _id: params.objectId });
  }),

  // Patch managed object
  http.patch('https://*/openidm/managed/:objectType/:objectId', ({ params }) => {
    return HttpResponse.json({ _id: params.objectId, _rev: '2' });
  }),

  // Delete managed object
  http.delete('https://*/openidm/managed/:objectType/:objectId', ({ params }) => {
    return HttpResponse.json({ _id: params.objectId });
  }),

  // Themes
  http.get('https://*/openidm/config/ui/theming', () => {
    return HttpResponse.json({ themes: mockThemes });
  }),

  http.get('https://*/openidm/config/ui/theming/:themeId', ({ params }) => {
    return HttpResponse.json({ ...mockThemes[0], _id: params.themeId });
  }),

  http.put('https://*/openidm/config/ui/theming', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ _id: 'theme-new', ...body });
  }),

  http.patch('https://*/openidm/config/ui/theming/:themeId', ({ params }) => {
    return HttpResponse.json({ ...mockThemes[0], _id: params.themeId });
  }),

  http.delete('https://*/openidm/config/ui/theming/:themeId', ({ params }) => {
    return HttpResponse.json({ _id: params.themeId });
  }),

  // ESVs
  http.get('https://*/environment/variables', () => {
    return HttpResponse.json({
      result: mockVariables,
      resultCount: mockVariables.length,
      totalPagedResults: mockVariables.length,
    });
  }),

  http.get('https://*/environment/variables/:variableId', ({ params }) => {
    return HttpResponse.json({ ...mockVariables[0], _id: params.variableId });
  }),

  http.put('https://*/environment/variables/:variableId', async ({ request, params }) => {
    const body = await request.json();
    return HttpResponse.json({ _id: params.variableId, ...body });
  }),

  http.delete('https://*/environment/variables/:variableId', ({ params }) => {
    return HttpResponse.json({ _id: params.variableId });
  }),

  // Logs
  http.get('https://*/monitoring/logs/sources', () => {
    return HttpResponse.json({ result: mockLogSources });
  }),

  http.post('https://*/monitoring/logs', () => {
    return HttpResponse.json({
      result: [],
      resultCount: 0,
      totalPagedResults: 0,
    });
  }),
];
```

**Key Features:**
- Minimal, generic responses
- One mock object works for all managed object types
- **Authorization header validation** - All API endpoints validate `Authorization: Bearer <token>` headers
- `validateAuthHeader()` helper function returns 401 errors for missing/invalid auth
- Easy to extend with error scenarios using `server.use()` in individual tests

## Phase 5: Snapshot Testing Utility ✅

**File:** `test/helpers/snapshotTest.ts`

```typescript
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { expect } from 'vitest';

/**
 * Snapshot testing for tool schemas
 * Prevents unintended changes to MCP tool definitions
 */
export async function snapshotTest(
  toolName: string,
  toolDefinition: any,
  snapshotDir: string = '__snapshots__'
): Promise<void> {
  const snapshotPath = join(
    process.cwd(),
    'test',
    snapshotDir,
    `${toolName}.json`
  );

  const shouldUpdate = process.env.UPDATE_SNAPSHOTS === 'true';

  // Ensure snapshot directory exists
  if (!existsSync(dirname(snapshotPath))) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
  }

  // Serialize tool definition (excluding function, only schema)
  const schemaOnly = {
    name: toolDefinition.name,
    title: toolDefinition.title,
    description: toolDefinition.description,
    scopes: toolDefinition.scopes,
    inputSchema: toolDefinition.inputSchema,
  };

  const currentSnapshot = JSON.stringify(schemaOnly, null, 2);

  // Update mode: overwrite snapshot
  if (shouldUpdate) {
    writeFileSync(snapshotPath, currentSnapshot, 'utf-8');
    console.log(`✓ Updated snapshot for ${toolName}`);
    return;
  }

  // Test mode: compare against saved snapshot
  if (!existsSync(snapshotPath)) {
    throw new Error(
      `Snapshot not found for ${toolName}.\n` +
      `Run: UPDATE_SNAPSHOTS=true npm test`
    );
  }

  const savedSnapshot = readFileSync(snapshotPath, 'utf-8');

  expect(currentSnapshot).toBe(savedSnapshot);
}
```

## Phase 6: NPM Scripts ✅

**Updated `package.json`:**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:snapshots:update": "UPDATE_SNAPSHOTS=true vitest run"
  }
}
```

## Phase 7: Trivial Smoke Tests ✅

Create minimal tests in each area to validate the setup:

### 7.1 Managed Objects Test

**File:** `test/tools/managedObjects/queryManagedObjects.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { queryManagedObjectsTool } from '../../../src/tools/managedObjects/queryManagedObjects';
import { snapshotTest } from '../../helpers/snapshotTest';

describe('queryManagedObjects', () => {
  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
  });

  it('should match tool schema snapshot', async () => {
    await snapshotTest('queryManagedObjects', queryManagedObjectsTool);
  });

  it('should have correct tool name', () => {
    expect(queryManagedObjectsTool.name).toBe('queryManagedObjects');
  });

  it('should query successfully', async () => {
    const result = await queryManagedObjectsTool.toolFunction({
      objectType: 'alpha_user',
      queryTerm: 'test',
    });

    expect(result.content).toHaveLength(1);
    const response = JSON.parse(result.content[0].text);
    expect(response).toHaveProperty('result');
    expect(Array.isArray(response.result)).toBe(true);
  });
});
```

### 7.2 Themes Test

**File:** `test/tools/themes/getThemes.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getThemesTool } from '../../../src/tools/themes/getThemes';
import { snapshotTest } from '../../helpers/snapshotTest';

describe('getThemes', () => {
  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
  });

  it('should match tool schema snapshot', async () => {
    await snapshotTest('getThemes', getThemesTool);
  });

  it('should have correct tool name', () => {
    expect(getThemesTool.name).toBe('getThemes');
  });
});
```

### 7.3 Logs Test

**File:** `test/tools/logs/getLogSources.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { getLogSourcesTool } from '../../../src/tools/logs/getLogSources';
import { snapshotTest } from '../../helpers/snapshotTest';

describe('getLogSources', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getLogSources', getLogSourcesTool);
  });

  it('should have correct tool name', () => {
    expect(getLogSourcesTool.name).toBe('getLogSources');
  });
});
```

### 7.4 ESV Test

**File:** `test/tools/esv/queryESVs.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { queryESVsTool } from '../../../src/tools/esv/queryESVs';
import { snapshotTest } from '../../helpers/snapshotTest';

describe('queryESVs', () => {
  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
  });

  it('should match tool schema snapshot', async () => {
    await snapshotTest('queryESVs', queryESVsTool);
  });

  it('should have correct tool name', () => {
    expect(queryESVsTool.name).toBe('queryESVs');
  });
});
```

## Phase 8: Validation ✅

### Run Tests

```bash
npm test
```

**Result:** ✅ 9/9 tests passing

### Generate Snapshots

```bash
npm run test:snapshots:update
```

**Result:** ✅ Created `test/__snapshots__/*.json` files (4 tool snapshots)

### View Coverage

```bash
npm run test:coverage
```

**Result:** ✅ Coverage report generates successfully

## Phase 9: Quality Improvements ✅

Additional improvements made during implementation:

1. **Authorization Header Validation** - Added `validateAuthHeader()` helper to all MSW handlers
2. **Shared Tool Collection Utility** - Created `src/utils/toolHelpers.ts` with `getAllTools()` and `getAllScopes()`
3. **Dependency Injection for Tests** - AuthService accepts `allowCachedOnFirstRequest` config option
4. **Removed Unused Code** - Deleted `test/mocks/config.ts`
5. **Clean Environment** - Removed unused `NODE_ENV: 'test'` from vitest config

## Success Criteria

- ✅ All dependencies installed without errors
- ✅ Vitest configuration loads successfully
- ✅ MSW server starts and intercepts mock requests
- ✅ Trivial tests pass in all 4 tool categories (9/9 passing)
- ✅ Snapshot files generated in `test/__snapshots__/`
- ✅ Coverage report generates
- ✅ Watch mode works correctly
- ✅ No TypeScript compilation errors in test files
- ✅ Authorization header validation in place
- ✅ Shared utility eliminates tool collection duplication

## Next Steps

**Phase 1 Complete** - Proceed to [test-cases-plan.md](./test-cases-plan.md) to implement comprehensive test cases for each tool area.
