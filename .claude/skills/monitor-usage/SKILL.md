---
name: monitor-usage
description: Audit and report on MCP server activity in AIC logs — authentication events, user-attributed actions, and API traffic. TRIGGER when: user asks what has been done/used/changed via the MCP server; asked to audit or review MCP activity; asked to show recent actions, operations, or usage; user wants to trace an action back to a user or session.
---

# Monitor MCP Server Usage

Use the `getLogSources` and `queryLogs` tools to retrieve and interpret AIC audit logs. Always check the current time before querying so time ranges are accurate.

## MCP Identity Markers

These values identify MCP server activity in the logs:

| Marker                | Value                      | Where it appears                                                  |
| --------------------- | -------------------------- | ----------------------------------------------------------------- |
| Initial auth client   | `AICMCPClient`             | `am-authentication` — PKCE / Device Code login                    |
| Token exchange client | `AICMCPExchangeClient`     | `am-authentication` — one `AM-TOKEN-EXCHANGE` event per tool call |
| API User-Agent        | `aic-mcp-server/<version>` | `idm-access`, `am-access` — all outbound API requests             |

## Log Sources and What They Show

| Source              | What to look for                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `am-authentication` | `AM-TOKEN-EXCHANGE` events for `AICMCPExchangeClient` — proxy for tool invocation count and timing; `AM-TREE-LOGIN-COMPLETED` for user login events     |
| `am-config`         | `AM-CONFIG-CHANGE` events — journey, node, script, and OIDC app changes; `userId` field shows the authenticated user                                    |
| `idm-access`        | Per-request HTTP log; filter by `user-agent co "aic-mcp-server"` to isolate MCP traffic from browser and reconciliation jobs                            |
| `idm-activity`      | Full before/after state for managed object operations (CREATE, PATCH, DELETE on users, groups, roles, etc.); `runAs` field shows the authenticated user |

## Interpreting Results

**Token exchanges = tool invocations.** Each `AM-TOKEN-EXCHANGE` for `AICMCPExchangeClient` corresponds to one tool call. Bursts of exchanges within a few seconds indicate a multi-step tool (e.g. `createJourney` creating nodes in parallel).

**Two `runAs` values in AM config logs are expected.** `dsameuser` indicates a platform write triggered by the user's token; `id=<uuid>` is the user's own identity. Both appear within the same transaction and are both attributable to the authenticated user.

**User attribution chain.** Each `AM-TOKEN-EXCHANGE` event carries a `subjectAuditTrackingId` that references the original `AM-TREE-LOGIN-COMPLETED` event for the session, linking every tool call back to the authenticated identity.

## Query Patterns

Filter authentication events by MCP client:

```
/payload/principal co "AICMCPExchangeClient"
```

Filter IDM access log for MCP API calls:

```
/payload/http/request/headers/user-agent co "aic-mcp-server"
```

Filter AM config changes to a specific journey:

```
/payload/objectId co "JourneyName"
```

Filter IDM activity for a specific object type:

```
/payload/objectId co "managed/alpha_user"
```

## Reporting Format

When presenting findings, structure the output as:

1. **Session summary** — login time(s), authenticated user, IP address, total token exchanges
2. **AM activity** — config changes grouped by object (journeys created/updated/deleted, scripts, OIDC apps)
3. **IDM activity** — managed object operations with object names, operation type, and timestamps
4. **Log query calls** — monitoring API calls made by the server itself (visible as `fr:idc:monitoring:*` scoped exchanges)

Use tables for timelines. Note the window queried and whether any sources had truncated results (paged results cookie present).
