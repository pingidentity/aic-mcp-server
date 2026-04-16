---
name: review-conventions
description: Code review guidelines for the aic-mcp-server codebase — what to check, common pitfalls, and required patterns
---

# Review Conventions

## Priority Order

1. **Security** — path traversal, scope correctness, error message leakage
2. **Correctness** — API contract, response formatting, error handling
3. **Conventions** — helper usage, naming, annotations, test structure
4. **Quality** — readability, duplication, edge cases

## Tool Implementation Checklist

- [ ] `SCOPES` defined as module-level const and passed to both the tool object and `makeAuthenticatedRequest()`
- [ ] All user-provided path segments validated with `safePathSegmentSchema`
- [ ] Uses `makeAuthenticatedRequest()` for API calls, never raw `fetch`
- [ ] Returns via `createToolResponse()`, success responses use `formatSuccess(data, response)` to include transaction ID
- [ ] Error handling: `catch (error: any)` returning `createToolResponse('Failed to ...: ${error.message}')`
- [ ] Realm parameters use `z.enum(REALMS)` from `validationHelpers`
- [ ] Export name follows `<toolName>Tool` convention
- [ ] DELETE operations have `annotations: { destructiveHint: true }`
- [ ] Idempotent PUT/PATCH operations have `annotations: { idempotentHint: true }`

## Common Pitfalls

| Pitfall                           | What to look for                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Missing path traversal protection | Any ID parameter in a URL path not using `safePathSegmentSchema`                                |
| Missing destructiveHint           | DELETE or destructive operations without `annotations: { destructiveHint: true }`               |
| Hardcoded scopes                  | Scopes written inline in `makeAuthenticatedRequest()` instead of referencing the `SCOPES` const |
| Raw JSON response                 | Returning `JSON.stringify(data)` without `formatSuccess()` — loses transaction ID               |
| Theme data loss                   | Theme update/delete operations that don't preserve `isDefault` or other realm data              |
| AM helper bypass                  | AM tools not using `buildAMRealmUrl()` and `AM_API_HEADERS` from `amHelpers`                    |

## Test Review Checklist

- [ ] Snapshot test present (`snapshotTest()` call)
- [ ] Sections follow required ordering: Snapshot, Request Construction, Response Handling, Input Validation, Error Handling
- [ ] Complex orchestration tools have "Application Logic" section after Snapshot
- [ ] Request construction tests verify URL, scopes, method, and body via the spy
- [ ] Security tests present: path traversal (`'../etc/passwd'` should throw) for tools with ID params
- [ ] Query injection tests present for tools accepting user-provided filter/query strings
- [ ] Error handling tests cover realistic HTTP error codes (401, 403, 404)
- [ ] MSW handlers used via `server.use()` for response mocking

## Verification Commands

Run these to verify changes:

```bash
npm test                         # All tests pass
npm run typecheck                # No type errors
npm run lint                     # No lint violations
npm run format:check             # No formatting issues
npm run build                    # Clean build succeeds
npm run test:snapshots:update    # If tool schema changed
```
