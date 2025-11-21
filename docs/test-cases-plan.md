# Test Cases Plan

## Overview

This document outlines the test cases for each tool category in the PingOne AIC MCP Server. The approach focuses on testing tool behavior, not data realism. We test managed object tools generically since they share the same interface.

## Testing Philosophy

1. **Generic over Specific**: Managed object tools (users, roles, groups, organizations) share the same interface - test the behavior once, not per object type
2. **Behavior over Data**: Focus on tool functionality, not realistic mock data
3. **Minimal Sufficient Coverage**: Cover success paths, error scenarios, and edge cases without excessive detail
4. **Maintainability**: Keep tests simple and easy to understand

## Tool Categories

### 1. Managed Objects Tools

All managed object tools are generic - they work the same way for users, roles, groups, and organizations. We'll test the behavior once using a representative object type (e.g., `alpha_user`), not test each type separately.

#### 1.1 queryManagedObjects

**Success Scenarios:**
- [ ] Query with queryTerm returns filtered results
- [ ] Query different object types (validate enum)
- [ ] Verify response structure (result array, counts, pagination)
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid object type (Zod validation)
- [ ] API returns 401 Unauthorized
- [ ] API returns 404 Not Found
- [ ] Network error

**Edge Cases:**
- [ ] Empty queryTerm (minimum length validation)
- [ ] Very long queryTerm (maximum length validation)
- [ ] Query returns no results
- [ ] Query returns pagination cookie

**Questions to discuss:**
- Do we need to test all object types, or just validate that the enum works?
- How detailed should we test the CREST query filter construction?

#### 1.2 getManagedObjectSchema

**Success Scenarios:**
- [ ] Returns schema for object type
- [ ] Schema contains required fields
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid object type
- [ ] API error

**Edge Cases:**
- [ ] Schema for object type with no required fields?

**Questions to discuss:**
- Should we validate the actual schema structure, or just that we get a response?

#### 1.3 createManagedObject

**Success Scenarios:**
- [ ] Creates object successfully
- [ ] Returns _id in response
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid object type
- [ ] Missing required fields (API validation)
- [ ] API returns 400 Bad Request
- [ ] API returns 401 Unauthorized

**Edge Cases:**
- [ ] Create with minimal required fields
- [ ] Create with extra optional fields

**Questions to discuss:**
- Do we validate the objectData structure, or let API handle it?

#### 1.4 getManagedObject

**Success Scenarios:**
- [ ] Retrieves object by ID
- [ ] Returns object with _id and _rev
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid object type
- [ ] Object not found (404)
- [ ] API error

**Edge Cases:**
- [ ] Object ID with special characters?

#### 1.5 patchManagedObject

**Success Scenarios:**
- [ ] Patches object successfully
- [ ] Returns new _rev in response
- [ ] Accepts multiple patch operations
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid object type
- [ ] Object not found (404)
- [ ] Revision mismatch (412 Precondition Failed)
- [ ] Invalid patch operations format

**Edge Cases:**
- [ ] Empty operations array
- [ ] Patch with different operation types (add, remove, replace)

**Questions to discuss:**
- How detailed should we test JSON Patch operations?
- Do we need to validate each operation type?

#### 1.6 deleteManagedObject

**Success Scenarios:**
- [ ] Deletes object successfully
- [ ] Returns deleted object ID
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid object type
- [ ] Object not found (404)
- [ ] API error

**Edge Cases:**
- [ ] Delete already deleted object?

---

### 2. Theme Management Tools

#### 2.1 getThemeSchema

**Success Scenarios:**
- [ ] Returns static schema documentation
- [ ] Schema contains expected fields
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- None (static tool)

**Notes:**
- This is a static tool (no API call), so testing is minimal

#### 2.2 getThemes

**Success Scenarios:**
- [ ] Returns list of themes for realm
- [ ] Response includes theme names and isDefault status
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid realm (Zod validation)
- [ ] API error

**Edge Cases:**
- [ ] Empty themes list
- [ ] Multiple themes with one default

#### 2.3 getTheme

**Success Scenarios:**
- [ ] Retrieves theme by ID
- [ ] Retrieves theme by name
- [ ] Returns complete theme configuration
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid realm
- [ ] Theme not found (404)
- [ ] API error

**Edge Cases:**
- [ ] Theme identifier with special characters

**Questions to discuss:**
- Should we test both ID and name lookups, or just one?

#### 2.4 createTheme

**Success Scenarios:**
- [ ] Creates theme with minimal data (name only)
- [ ] Creates theme with full configuration
- [ ] Returns created theme _id and name
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid realm
- [ ] Missing name field
- [ ] Duplicate theme name (409 Conflict)
- [ ] API error

**Edge Cases:**
- [ ] Theme with only required fields
- [ ] Theme with all optional fields

#### 2.5 updateTheme

**Success Scenarios:**
- [ ] Updates theme by ID
- [ ] Updates theme by name
- [ ] Partial update (only changed fields)
- [ ] Returns updated theme
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid realm
- [ ] Theme not found
- [ ] Attempt to update _id (should be rejected)
- [ ] Attempt to update isDefault (should use setDefaultTheme)
- [ ] API error

**Edge Cases:**
- [ ] Empty themeUpdates object
- [ ] Update with same values (no-op)

#### 2.6 deleteTheme

**Success Scenarios:**
- [ ] Deletes theme by ID
- [ ] Deletes theme by name
- [ ] Returns deleted theme info
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid realm
- [ ] Theme not found
- [ ] Attempt to delete default theme (should fail)
- [ ] API error

**Questions to discuss:**
- Should we mock the "cannot delete default" error, or assume API handles it?

#### 2.7 setDefaultTheme

**Success Scenarios:**
- [ ] Sets theme as default by ID
- [ ] Sets theme as default by name
- [ ] Returns success message
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid realm
- [ ] Theme not found
- [ ] API error

**Edge Cases:**
- [ ] Set already-default theme as default (idempotent)

---

### 3. Log Query Tools

#### 3.1 getLogSources

**Success Scenarios:**
- [ ] Returns list of available log sources
- [ ] Response structure is correct
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] API error (401, 500, etc.)

**Edge Cases:**
- [ ] Empty log sources list (unlikely but possible)

**Notes:**
- Simple tool with no parameters

#### 3.2 queryLogs

**Success Scenarios:**
- [ ] Query with sources returns logs
- [ ] Query with time range (beginTime, endTime)
- [ ] Query with transactionId filter
- [ ] Query with queryFilter (payload content)
- [ ] Query with pagination (pageSize, pagedResultsCookie)
- [ ] Response includes result array and pagination metadata
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Missing required sources parameter
- [ ] Invalid time range (>24 hours)
- [ ] Invalid queryFilter syntax
- [ ] API error (401, 500)

**Edge Cases:**
- [ ] Query returns no logs
- [ ] Query with maximum pageSize (1000)
- [ ] Query with minimum pageSize (1)
- [ ] Pagination cookie for next page

**Questions to discuss:**
- How detailed should we test queryFilter syntax validation?
- Should we test the 24-hour time range limit, or assume API enforces it?
- Do we need to test all parameter combinations?

#### 3.3 queryLogsByTransactionId

**Success Scenarios:**
- [ ] Queries am-everything and idm-everything logs for transaction ID
- [ ] Returns logs from both sources
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Missing transactionId parameter
- [ ] Invalid transactionId format
- [ ] API error

**Edge Cases:**
- [ ] Transaction ID with no matching logs

---

### 4. Environment Secrets/Variables (ESV) Tools

#### 4.1 queryESVs

**Success Scenarios:**
- [ ] Query variables by type
- [ ] Query secrets by type
- [ ] Query with queryTerm filter
- [ ] Query with pagination (pageSize, pagedResultsCookie)
- [ ] Query with sortKeys
- [ ] Response includes result array and metadata
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Invalid type (not 'variable' or 'secret')
- [ ] API error

**Edge Cases:**
- [ ] Query with no queryTerm (returns all)
- [ ] Query with queryTerm containing special characters (injection prevention)
- [ ] Empty results

**Questions to discuss:**
- Should we test both 'variable' and 'secret' types, or just one?
- How important is testing the double-quote escaping for injection prevention?

#### 4.2 getVariable

**Success Scenarios:**
- [ ] Retrieves variable by ID
- [ ] Returns variable with decoded value
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Missing variableId parameter
- [ ] Invalid variableId format (should start with esv-)
- [ ] Variable not found (404)
- [ ] API error

**Edge Cases:**
- [ ] Variable with empty value
- [ ] Variable with complex type (array, object)

#### 4.3 setVariable

**Success Scenarios:**
- [ ] Creates new variable
- [ ] Updates existing variable
- [ ] Handles different types (string, array, object, bool, int, number)
- [ ] Optional description field
- [ ] Returns success with variable ID
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Missing required parameters (variableId, type)
- [ ] Invalid type enum
- [ ] Type mismatch between declared type and value
- [ ] Attempt to change type after creation (should fail)
- [ ] API error

**Edge Cases:**
- [ ] Variable with no value
- [ ] Variable with very long value
- [ ] Array and object types (JSON serialization)

**Questions to discuss:**
- Should we test all type values, or just a few representative ones?
- How detailed should type validation testing be?

#### 4.4 deleteVariable

**Success Scenarios:**
- [ ] Deletes variable by ID
- [ ] Returns success message
- [ ] Snapshot test for tool schema

**Error Scenarios:**
- [ ] Missing variableId parameter
- [ ] Variable not found (404)
- [ ] API error

**Edge Cases:**
- [ ] Delete already deleted variable (404)

---

## Implementation Approach

### Phase 1: Managed Objects (Generic)
Test all 6 managed object tools using `alpha_user` as the representative type. Validate that object type enum works, but don't test each type separately.

### Phase 2: Themes
Test all 7 theme tools focusing on realm handling and theme identifier lookups (ID vs name).

### Phase 3: Logs
Test both log tools focusing on parameter validation and response structure.

### Phase 4: ESV
Test all 4 ESV tools focusing on type handling and query filtering.

---

## Testing Strategy Per Tool

For each tool, we'll implement tests in this order:

1. **Snapshot test** - Ensure tool schema doesn't change unexpectedly
2. **Success path test** - Primary happy path scenario
3. **Error scenario tests** - Cover common failure modes (401, 404, validation errors)
4. **Edge case tests** - Boundary conditions and special cases

---

## MSW Handler Extension Strategy

As we build test cases, we'll extend MSW handlers incrementally:

1. **Start with defaults** - Basic success responses
2. **Add per-test overrides** - Use `server.use()` for error scenarios
3. **Keep handlers minimal** - Only add complexity when needed

Example pattern:
```typescript
it('should handle 404 error', async () => {
  server.use(
    http.get('https://*/openidm/managed/:objectType/:objectId', () => {
      return new HttpResponse(null, { status: 404 });
    })
  );

  const result = await tool.toolFunction({ objectType: 'alpha_user', objectId: 'missing' });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('404');
});
```

---

## Open Questions for Discussion

1. **Managed Objects**: Test enum validation once, or test each object type?
2. **CREST Query Filters**: How detailed should we test query filter syntax?
3. **JSON Patch**: Test each operation type (add, remove, replace) or just one?
4. **Theme Identifiers**: Test both ID and name lookups, or just one?
5. **Log Query Filters**: How much validation testing for payload filters?
6. **ESV Types**: Test all type values or representative subset?
7. **Error Simulation**: Mock all error scenarios or focus on most common?
8. **Injection Prevention**: Test double-quote escaping in queryESVs explicitly?

---

## Success Criteria

- [ ] All tools have snapshot tests
- [ ] All tools have at least one success path test
- [ ] All tools have at least one error scenario test
- [ ] Coverage > 70% for tool files
- [ ] All tests pass consistently
- [ ] No flaky tests (tests should be deterministic)

---

## Next Steps

1. Review this plan together
2. Discuss and resolve open questions
3. Prioritize test case implementation
4. Start with Phase 1 (Managed Objects) and iterate
