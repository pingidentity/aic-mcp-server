# AI Project: PingOne AIC MCP Server

This document provides an overview of the PingOne AIC MCP Server, a TypeScript-based MCP server designed to integrate with AI agents that support the Model Context Protocol (MCP).

## Project Overview

This server exposes tools that allow AI agents to interact with a PingOne Advanced Identity Cloud (AIC) environment. It provides programmatic access to managed object operations (create, read, update, delete, search) for users, roles, groups, and organizations, as well as monitoring capabilities through secure user-based authentication. The server uses OAuth 2.0 PKCE flow for interactive authentication, ensuring all actions are traceable to authenticated users for audit and security compliance.

### Managed Object Support

The server provides generic CRUD operations for **any managed object type** defined in your PingOne AIC environment. This includes users, roles, groups, organizations, and any custom managed object types you've configured. Use the `listManagedObjects` tool to discover all available types in your tenant.

**Common Examples:**
- **Users** (`alpha_user`, `bravo_user`) - Identity records with authentication credentials
- **Roles** (`alpha_role`, `bravo_role`) - Collections of permissions and entitlements
- **Groups** (`alpha_group`, `bravo_group`) - Collections of users or other objects
- **Organizations** (`alpha_organization`, `bravo_organization`) - Organizational units or tenants

### Key Technologies

*   **Language:** TypeScript (compiled to ES2022)
*   **Core Dependencies:**
    *   `@modelcontextprotocol/sdk`: For creating the MCP server with STDIO transport
    *   `zod`: For schema validation of tool inputs
    *   `keytar`: For securely storing authentication tokens in the system keychain
    *   `open`: To open the user's browser for OAuth authentication
*   **Runtime:** Node.js (ESM modules)

## Architecture

### Server Entry Point
The server is initialized in [src/index.ts](src/index.ts), which:
- Creates an MCP server instance using STDIO transport
- Registers available tools
- Handles graceful shutdown and cleanup
- Validates required environment variables on startup

### Authentication Architecture

The authentication system uses OAuth 2.0 Authorization Code with PKCE (Proof Key for Code Exchange) flow.

#### Authentication Service
[src/services/authService.ts](src/services/authService.ts) - Handles all authentication:
- Implements OAuth 2.0 PKCE flow for secure user authentication
- Opens system browser for user login at PingOne AIC
- Runs local HTTP server to receive OAuth redirect
- Requests all tool scopes upfront during authentication
- Uses RFC 8693 token exchange for scoped-down tokens
- Stores tokens securely in system keychain under `user-token` account
- Provides `getToken()` interface to all tools

**Key Features:**
- User-based authentication for full audit trail
- Two-client architecture for enhanced security (PKCE auth + token exchange)
- Token persistence across sessions via system keychain
- Automatic token expiry checking and refresh
- In-flight request deduplication to prevent concurrent auth flows
- PKCE security to prevent authorization code interception
- No client secrets required (both clients configured as public)

### Available Tools

All tools declare required OAuth scopes, which are requested upfront during user authentication.

#### 1. `listManagedObjects`
**File:** [src/tools/managedObjects/listManagedObjects.ts](src/tools/managedObjects/listManagedObjects.ts)

Retrieve the list of all managed object types available in your PingOne AIC environment.

**Parameters:** None

**Required Scopes:** `fr:idm:*`

**Returns:** JSON object containing an array of managed object type names

**Implementation Notes:**
- Discovery tool to list all available managed object types
- Queries the IDM configuration endpoint (`/openidm/config/managed`)
- Returns type names only (e.g., `alpha_user`, `bravo_role`, `alpha_device`)
- Use this before querying or manipulating objects to discover what types exist
- Supports both standard types (user, role, group, organization) and any types you've configured

#### 2. `queryManagedObjects`
**File:** [src/tools/managedObjects/queryManagedObjects.ts](src/tools/managedObjects/queryManagedObjects.ts)

Query managed objects in PingOne AIC using CREST query filter syntax with full pagination, sorting, and field selection capabilities.

**Parameters:**
- `objectType` (string): Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `queryFilter` (string, optional): CREST query filter expression. If omitted, returns all objects up to pageSize (defaults to 'true')
- `pageSize` (number, optional): Number of objects to return per page (default: 50, max: 250)
- `pagedResultsCookie` (string, optional): Pagination cookie from previous response for next page
- `sortKeys` (string, optional): Comma-separated field names to sort by. Prefix with "-" for descending
- `fields` (string, optional): Comma-separated field names to return. If omitted, returns all fields

**Required Scopes:** `fr:idm:*`

**Returns:** JSON response with results array and pagination metadata

**Implementation Notes:**
- Exposes full CREST query filter syntax (eq, co, sw, gt, ge, lt, le, pr, !, and, or)
- Uses `_totalPagedResultsPolicy=EXACT` for accurate result counts
- Validates that objectType is a non-empty string
- Generic field placeholders in descriptions force AI to call `getManagedObjectSchema` first
- Cookie-based pagination for efficiency
- Default pageSize of 50, max 250
- Works with any managed object type via dynamic endpoint construction

#### 3. `getManagedObjectSchema`
**File:** [src/tools/managedObjects/getManagedObjectSchema.ts](src/tools/managedObjects/getManagedObjectSchema.ts)

Retrieves the schema definition for a specific managed object type to understand its structure and requirements.

**Parameters:**
- `objectType` (string): Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.

**Required Scopes:** `fr:idm:*`

**Returns:** JSON object containing required properties and their formats

**Implementation Notes:**
- Queries the IDM configuration endpoint (`/openidm/config/managed`)
- Returns only required properties to minimize context
- Use before creating managed objects to understand what fields are necessary
- Works with any managed object type defined in your environment

#### 4. `createManagedObject`
**File:** [src/tools/managedObjects/createManagedObject.ts](src/tools/managedObjects/createManagedObject.ts)

Creates a new managed object in PingOne AIC.

**Parameters:**
- `objectType` (string): Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `objectData` (object): JSON object containing object properties (must include all required fields)

**Required Scopes:** `fr:idm:*`

**Returns:** Success message with the created object's `_id` and transaction ID

**Implementation Notes:**
- Uses the IDM managed object creation endpoint (`/openidm/managed/{objectType}?_action=create`)
- Returns only the `_id` to minimize context usage
- Includes transaction ID in response for debugging
- Validates that objectType is a non-empty string
- Use `getManagedObjectSchema` first to determine required fields
- Works with any managed object type via dynamic endpoint construction

#### 5. `getManagedObject`
**File:** [src/tools/managedObjects/getManagedObject.ts](src/tools/managedObjects/getManagedObject.ts)

Retrieves a managed object's complete profile by its unique identifier.

**Parameters:**
- `objectType` (string): Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `objectId` (string): The unique identifier (`_id`) of the object

**Required Scopes:** `fr:idm:*`

**Returns:** Complete object including all fields and metadata

**Implementation Notes:**
- Queries the IDM managed object endpoint (`/openidm/managed/{objectType}/{objectId}`)
- Returns full object profile including `_rev` (revision) field
- The `_rev` field is required for safe updates using `patchManagedObject`
- Validates objectId to prevent path traversal attacks
- Works with any managed object type via dynamic endpoint construction

#### 6. `patchManagedObject`
**File:** [src/tools/managedObjects/patchManagedObject.ts](src/tools/managedObjects/patchManagedObject.ts)

Updates specific fields of a managed object using JSON Patch operations (RFC 6902).

**Parameters:**
- `objectType` (string): Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `objectId` (string): The unique identifier (`_id`) of the object
- `revision` (string): The current revision (`_rev`) from `getManagedObject`
- `operations` (array): Array of JSON Patch operations

**Required Scopes:** `fr:idm:*`

**Returns:** Success message with updated object's `_id` and new `_rev`

**Implementation Notes:**
- Uses HTTP PATCH with JSON Patch operations
- Requires current `_rev` value to prevent conflicting concurrent updates (optimistic locking)
- Always call `getManagedObject` first to obtain the current `_rev`
- Supports operations: add, remove, replace, move, copy, test
- Field paths use JSON Pointer format (e.g., '/fieldName')
- Generic field placeholders in descriptions force AI to call `getManagedObjectSchema` to discover available fields
- Validates objectId to prevent path traversal attacks
- Works with any managed object type via dynamic endpoint construction

#### 7. `deleteManagedObject`
**File:** [src/tools/managedObjects/deleteManagedObject.ts](src/tools/managedObjects/deleteManagedObject.ts)

Deletes a managed object by its unique identifier.

**Parameters:**
- `objectType` (string): Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `objectId` (string): The unique identifier (`_id`) of the object

**Required Scopes:** `fr:idm:*`

**Returns:** Success message confirming deletion with transaction ID

**Implementation Notes:**
- Uses HTTP DELETE on the IDM managed object endpoint
- Permanent deletion - cannot be undone
- Includes transaction ID in response for audit trail
- Validates objectId to prevent path traversal attacks
- Works with any managed object type via dynamic endpoint construction

### Theme Management Tools

The server provides comprehensive theme management capabilities for customizing the appearance of authentication journeys and account pages in PingOne AIC.

#### 8. `getThemeSchema`
**File:** [src/tools/themes/getThemeSchema.ts](src/tools/themes/getThemeSchema.ts)

Retrieve comprehensive schema documentation for PingOne AIC themes.

**Parameters:** None

**Required Scopes:** None (static documentation)

**Returns:** Complete schema documentation including:
- All available theme fields with types and descriptions
- Enum values for layout and positioning fields
- Default values for all optional fields
- Localization support information
- HTML/CSS field constraints
- Color format requirements
- Image field formats (URLs and data URIs)

**Implementation Notes:**
- Provides static documentation - no API call required
- **Should be called before creating or updating themes** to understand available fields
- Documents that only `name` field is required; all others are optional
- The AIC server applies defaults for any omitted fields

#### 9. `getThemes`
**File:** [src/tools/themes/getThemes.ts](src/tools/themes/getThemes.ts)

Retrieve all themes for a specific realm.

**Parameters:**
- `realm` (string): The realm to query - validated enum ('alpha' or 'bravo')

**Required Scopes:** `fr:idm:*`

**Returns:** List of themes with `name` and `isDefault` status

**Implementation Notes:**
- Use this to discover available themes before getting details or making updates
- Returns minimal information (name and default status) for quick listing

#### 10. `getTheme`
**File:** [src/tools/themes/getTheme.ts](src/tools/themes/getTheme.ts)

Retrieve a specific theme's complete configuration.

**Parameters:**
- `realm` (string): The realm containing the theme
- `themeIdentifier` (string): Theme ID or name to retrieve

**Required Scopes:** `fr:idm:*`

**Returns:** Complete theme object including all styling properties, logos, headers, footers, and page settings

**Implementation Notes:**
- Can query by either `_id` or `name`
- Useful for examining existing themes before creating new ones
- Returns full theme configuration for reference or modification

#### 11. `createTheme`
**File:** [src/tools/themes/createTheme.ts](src/tools/themes/createTheme.ts)

Create a new theme for a realm.

**Parameters:**
- `realm` (string): The realm to create the theme in
- `themeData` (object): Theme configuration object (must include `name` property)

**Required Scopes:** `fr:idm:*`

**Returns:** Success message with created theme's `_id` and `name`

**Implementation Notes:**
- **Only `name` is required** - all other fields are optional
- The AIC server automatically applies default values for omitted fields
- System-controlled fields (`_id`, `isDefault`) are set automatically
- `_id` is auto-generated as a UUID
- `isDefault` is always set to `false` on creation (use `setDefaultTheme` to change)
- Validates that theme name is unique within the realm
- **Recommended: Call `getThemeSchema` first** to understand available customization options

#### 12. `updateTheme`
**File:** [src/tools/themes/updateTheme.ts](src/tools/themes/updateTheme.ts)

Update an existing theme's properties.

**Parameters:**
- `realm` (string): The realm containing the theme
- `themeIdentifier` (string): Theme ID or name to update
- `themeUpdates` (object): Fields to update (partial theme object)

**Required Scopes:** `fr:idm:*`

**Returns:** Success message with updated theme's `_id` and `name`

**Implementation Notes:**
- Provide only the fields you want to change - all others are preserved
- Cannot update `_id` (immutable) or `isDefault` (use `setDefaultTheme` instead)
- Can query by either `_id` or `name`
- Validates name uniqueness if renaming the theme

#### 13. `deleteTheme`
**File:** [src/tools/themes/deleteTheme.ts](src/tools/themes/deleteTheme.ts)

Delete a theme from a realm.

**Parameters:**
- `realm` (string): The realm containing the theme
- `themeIdentifier` (string): Theme ID or name to delete

**Required Scopes:** `fr:idm:*`

**Returns:** Success message with deleted theme's `_id` and `name`

**Implementation Notes:**
- **Cannot delete the default theme** - returns error if attempted
- Must set another theme as default first using `setDefaultTheme`
- Permanent deletion - cannot be undone
- Can query by either `_id` or `name`

#### 14. `setDefaultTheme`
**File:** [src/tools/themes/setDefaultTheme.ts](src/tools/themes/setDefaultTheme.ts)

Set a theme as the default for a realm.

**Parameters:**
- `realm` (string): The realm containing the theme
- `themeIdentifier` (string): Theme ID or name to set as default

**Required Scopes:** `fr:idm:*`

**Returns:** Success message confirming the theme is now default

**Implementation Notes:**
- Automatically sets the current default theme to non-default
- Only one theme can be default per realm
- Can query by either `_id` or `name`
- Returns informational message if theme is already default

### Environment Secrets and Variables (ESV) Tools

The server provides tools for managing environment secrets and variables (ESVs) used for configuration and credentials in PingOne AIC.

#### 15. `queryESVs`
**File:** [src/tools/esv/queryESVs.ts](src/tools/esv/queryESVs.ts)

Query environment secrets or variables by ID pattern with pagination and sorting support.

**Parameters:**
- `type` (string): Type of ESV to query - validated enum ('variable' or 'secret')
- `queryTerm` (string, optional): Search term to filter by ID. If omitted, returns all ESVs up to pageSize
- `pageSize` (number, optional): Number of results to return per page (default: 50, max: 100)
- `pagedResultsCookie` (string, optional): Pagination cookie from previous response to retrieve next page
- `sortKeys` (string, optional): Comma-separated field names to sort by. Prefix with "-" for descending (e.g., "_id,-lastChangeDate")

**Required Scopes:** `fr:idc:esv:read`

**Returns:** JSON response with results array and pagination metadata

**Implementation Notes:**
- Unified tool replacing separate `queryVariables` and `querySecrets` tools
- Uses `/_id co "queryTerm"` filter with double-quote escaping to prevent query injection
- Defaults to `_queryFilter=true` when queryTerm omitted (returns all ESVs)
- Dynamic endpoint selection: `/environment/variables` or `/environment/secrets` based on type
- Requires `accept-api-version: resource=2.0` header
- Cookie-based pagination for consistency with other query tools
- Default pageSize of 50, max 100
- Security: Escapes double quotes in queryTerm to prevent injection attacks

#### 16. `getVariable`
**File:** [src/tools/esv/getVariable.ts](src/tools/esv/getVariable.ts)

Retrieve a specific environment variable by ID with decoded value.

**Parameters:**
- `variableId` (string): The unique identifier (_id) of the variable (format: esv-*)

**Required Scopes:** `fr:idc:esv:read`

**Returns:** Complete variable object including decoded value

**Implementation Notes:**
- Queries `/environment/variables/{variableId}` endpoint
- Returns decoded value (secrets are write-only and cannot be retrieved)
- Requires `accept-api-version: resource=2.0` header

#### 17. `setVariable`
**File:** [src/tools/esv/setVariable.ts](src/tools/esv/setVariable.ts)

Create or update an environment variable.

**Parameters:**
- `variableId` (string): Variable ID (format: esv-*)
- `type` (string): Variable type - validated enum ('string', 'array', 'object', 'bool', 'int', 'number')
- `value` (any): Variable value (must match declared type)
- `description` (string, optional): Description of the variable's purpose

**Required Scopes:** `fr:idc:esv:*`

**Returns:** Success message with variable ID

**Implementation Notes:**
- Uses PUT to `/environment/variables/{variableId}` for create/update
- Type cannot be changed after initial creation
- Value is serialized to JSON for array/object types
- Requires `accept-api-version: resource=2.0` header
- Validates value type matches declared type

#### 18. `deleteVariable`
**File:** [src/tools/esv/deleteVariable.ts](src/tools/esv/deleteVariable.ts)

Delete an environment variable by ID.

**Parameters:**
- `variableId` (string): The unique identifier (_id) of the variable (format: esv-*)

**Required Scopes:** `fr:idc:esv:*`

**Returns:** Success message confirming deletion

**Implementation Notes:**
- Uses HTTP DELETE on `/environment/variables/{variableId}` endpoint
- Permanent deletion - cannot be undone
- Requires `accept-api-version: resource=2.0` header
- No equivalent for secrets (secrets are managed through different mechanisms)

## Configuration

### Environment Variables

Only one environment variable is required:

- **`AIC_BASE_URL`** (required): The hostname of your PingOne AIC environment
  - Example: `openam-example.forgeblocks.com`
  - Do not include `https://` or path components
  - Server will exit on startup if not set

### Authentication Characteristics

- Browser-based interactive user authentication
- All scopes requested upfront during login
- Actions are auditable and traceable to authenticated users
- Tokens cached securely in system keychain
- Ideal for interactive desktop applications (e.g., Claude Desktop)

## Setup and Installation

### Prerequisites
- Node.js (version with ES2022 support)
- Access to a PingOne Advanced Identity Cloud environment

### Installation Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Configure environment variable:**
   ```bash
   export AIC_BASE_URL="your-tenant.forgeblocks.com"
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

### Development

For development with auto-rebuild on file changes:
```bash
npm run dev
```

## MCP Client Integration

### Claude Desktop Configuration Example

Add to your Claude Desktop MCP settings (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "pingone-aic": {
      "command": "node",
      "args": ["/absolute/path/to/pingone_AIC_MCP/dist/index.js"],
      "env": {
        "AIC_BASE_URL": "your-tenant.forgeblocks.com"
      }
    }
  }
}
```

### Other MCP Clients

Any MCP client that supports STDIO transport can use this server. Simply configure the `AIC_BASE_URL` environment variable to point to your PingOne AIC environment.

## Authentication Flow

### OAuth 2.0 PKCE Flow

1. Tool calls `authService.getToken(scopes)`
2. Server checks keychain for valid cached token
3. If no valid token exists or token has expired:
   - Server starts local HTTP server on `REDIRECT_URI_PORT`
   - Opens system browser to PingOne AIC authorization page
   - User authenticates and grants consent for all tool scopes
   - Browser redirects to `http://localhost:{port}` with authorization code
   - Server exchanges authorization code for access token using PKCE verifier
   - Token is stored in keychain under `user-token` account
4. Access token is used for API calls until expiration
5. When expired, flow repeats automatically

**Security Features:**
- PKCE prevents authorization code interception attacks
- Tokens stored in OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- No client secrets required (public client configuration)
- All scopes requested upfront during authentication
- User-based actions for complete audit trail

## Error Handling

The server handles common error scenarios:

- **Missing required environment variables:** Server exits on startup with error message
- **OAuth authentication failures:** Errors are propagated to the MCP client as tool errors
- **Invalid OAuth client configuration:** HTTP error responses are caught and returned as tool errors
- **Network failures:** Fetch errors are caught and returned with descriptive messages
- **Expired tokens:** Automatically triggers re-authentication flow

## File Structure

```
pingone_AIC_MCP/
├── src/
│   ├── index.ts                            # Server entry point and tool registration
│   ├── config/
│   │   └── managedObjectUtils.ts           # Shared utilities, examples, and validation
│   ├── services/
│   │   └── authService.ts                  # OAuth 2.0 PKCE authentication
│   ├── utils/
│   │   ├── apiHelpers.ts                   # Shared API request helpers
│   │   └── responseHelpers.ts              # Response formatting utilities
│   └── tools/
│       ├── managedObjects/                  # Managed object CRUD operations
│       │   ├── index.ts                    # Re-exports all managed object tools
│       │   ├── listManagedObjects.ts       # Discover available managed object types
│       │   ├── queryManagedObjects.ts      # Generic managed object search
│       │   ├── getManagedObjectSchema.ts   # Schema retrieval
│       │   ├── createManagedObject.ts      # Generic object creation
│       │   ├── getManagedObject.ts         # Generic object retrieval
│       │   ├── patchManagedObject.ts       # Generic object update (JSON Patch)
│       │   └── deleteManagedObject.ts      # Generic object deletion
│       ├── logs/                            # Log querying and monitoring
│       │   ├── index.ts                    # Re-exports all log tools
│       │   ├── getLogSources.ts            # Available log sources
│       │   └── queryLogs.ts                # Advanced log querying
│       ├── themes/                          # Theme management
│       │   ├── index.ts                    # Re-exports all theme tools
│       │   ├── getThemeSchema.ts           # Theme schema documentation
│       │   ├── getThemes.ts                # List themes in a realm
│       │   ├── getTheme.ts                 # Get specific theme
│       │   ├── createTheme.ts              # Create new theme
│       │   ├── updateTheme.ts              # Update existing theme
│       │   ├── deleteTheme.ts              # Delete theme
│       │   └── setDefaultTheme.ts          # Set default theme
│       └── esv/                             # Environment secrets and variables
│           ├── index.ts                    # Re-exports all ESV tools
│           ├── queryESVs.ts                # Query variables and secrets
│           ├── getVariable.ts              # Get specific variable
│           ├── setVariable.ts              # Create/update variable
│           └── deleteVariable.ts           # Delete variable
├── dist/                                    # Compiled JavaScript (generated)
├── package.json                             # Dependencies and scripts
├── tsconfig.json                            # TypeScript configuration
├── CLAUDE.md                                # This file
└── LICENSE                                  # MIT License
```

## Extending the Server

### Adding New Tools

To add a new tool:

1. Create a new file in the appropriate category directory (e.g., `src/tools/managedObjects/myNewTool.ts`, `src/tools/logs/myNewTool.ts`, or `src/tools/themes/myNewTool.ts`)
2. Define the tool following this pattern:

```typescript
import { z } from 'zod';
import { getAuthService } from '../../services/authService.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

// Define scopes as a constant so they can be referenced in both the tool definition and function
const SCOPES = ['fr:idm:*', 'other:scope:*'];

export const myNewTool = {
  name: 'myNewTool',
  title: 'My New Tool',
  description: 'Description of what the tool does',
  scopes: SCOPES,  // Declare required OAuth scopes
  inputSchema: {
    param1: z.string().describe("Description of param1"),
    param2: z.number().optional().describe("Optional parameter"),
  },
  async toolFunction({ param1, param2 }: { param1: string; param2?: number }) {
    try {
      const token = await getAuthService().getToken(SCOPES);

      const response = await fetch(`https://${aicBaseUrl}/your/api/endpoint`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(data, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error: ${error.message}`
        }]
      };
    }
  }
};
```

3. Export the tool from the category's `index.ts` file (e.g., `src/tools/managedObjects/index.ts`):

```typescript
export { myNewToolTool } from './myNewTool.js';
```

4. The tool will be automatically registered in `src/index.ts` via the category's module export using `Object.values()`

5. Rebuild: `npm run build`

### OAuth Scope Requirements

All tools must declare their required scopes in the `scopes` property. When adding new tools:

1. Define scopes as a constant (e.g., `const SCOPES = ['fr:idm:*'];`)
2. Reference the constant in both the tool definition (`scopes: SCOPES`) and function call (`authService.getToken(SCOPES)`)
3. Ensure OAuth client is configured with all tool scopes

**Scope Behavior:**
- All scopes from all tools are collected and requested upfront during user authentication
- The scopes parameter in `getToken(scopes)` is used to scope down tokens via RFC 8693 token exchange

### Managed Object Type Support

The server supports **any managed object type** defined in your PingOne AIC environment without requiring code changes.

**How it works:**
- All managed object tools accept any non-empty string for `objectType`
- Tools use dynamic endpoint construction: `/openidm/managed/${objectType}`
- The `listManagedObjects` tool discovers available types at runtime
- Object type validation uses string validation (not enum) for maximum flexibility

**Example Types:**
The `src/config/managedObjectUtils.ts` file contains example types for documentation:
```typescript
export const EXAMPLE_MANAGED_OBJECT_TYPES = [
  'alpha_user', 'bravo_user',
  'alpha_role', 'bravo_role',
  'alpha_group', 'bravo_group',
  'alpha_organization', 'bravo_organization'
];
```

These examples appear in tool descriptions to guide AI agents, but **all managed object types work automatically** - no configuration needed.

**Adding custom managed objects:**
1. Define your managed object type in PingOne AIC (via IDM configuration)
2. The type immediately becomes available to all managed object tools
3. Use `listManagedObjects` to discover your new type
4. Use `getManagedObjectSchema` to understand its required fields
5. All CRUD operations work automatically via dynamic endpoints

## Known Limitations

- **Single session per machine:** Only one authentication session at a time (tokens stored per machine)
- **Token refresh:** No refresh token flow; requires re-authentication when access token expires
- **Rate limiting:** No built-in rate limiting; relies on PingOne AIC's rate limits

## Troubleshooting

### "FATAL: AIC_BASE_URL environment variable is not set"
Set the `AIC_BASE_URL` environment variable to your PingOne AIC hostname.

### "Failed to exchange code for token: invalid_client"
Raise a support ticket with Ping to request the required OAuth client configuration.

### "Port 3000 is already in use"
Port 3000 is hardcoded for the OAuth redirect URI. Stop the service using port 3000 or contact your administrator to reconfigure the server with a different port (requires code changes in [src/services/authService.ts](src/services/authService.ts#L12)).

### "Unknown/invalid scope(s)"
Raise a support ticket with Ping if you encounter scope-related errors.

### Browser doesn't open during authentication
Manually navigate to the URL shown in error logs, or check if the `open` package has permissions to open your browser.

## Testing

The project includes a comprehensive test suite with **360 tests** across all **20 tools** covering managed objects, themes, logs, and ESV operations.

### Test Architecture

**Framework and Tools:**
- **Vitest:** Modern, fast test runner with native TypeScript support
- **MSW (Mock Service Worker):** HTTP request interception for realistic API simulation
- **Dependency Injection:** Uses `vi.spyOn()` to intercept `makeAuthenticatedRequest` calls

**Testing Pattern:**
Tests focus on **our application logic**, not the API behavior. We test:
- Request construction (URL building, headers, query parameters, body formatting)
- Response processing (field extraction, transformations, formatting)
- Input validation (Zod schema validation)
- Error handling (HTTP status codes, network failures)
- Application-specific logic (multi-step orchestration, state management)

### Test Organization

Tests mirror the source structure:
```
test/
├── helpers/
│   └── snapshotTest.ts          # Snapshot testing utility
├── mocks/
│   ├── handlers.ts               # MSW request handlers
│   └── mockData.ts               # Shared test data
├── setup.ts                      # Global test setup
├── __snapshots__/                # Tool schema snapshots (20 files)
└── tools/
    ├── managedObjects/           # 7 test files, 113 tests
    ├── themes/                   # 7 test files, 135 tests
    ├── logs/                     # 2 test files, 32 tests
    └── esv/                      # 4 test files, 80 tests
```

**Test File Structure:**

Simple tools use this ordering:
1. Snapshot Test - Tool schema validation
2. Request Construction - URL, headers, parameters
3. Response Handling - Output formatting
4. Input Validation - Zod schema tests
5. Error Handling - HTTP errors, network failures

Complex orchestration tools (createTheme, updateTheme, deleteTheme, setDefaultTheme) use:
1. Snapshot Test
2. **Application Logic** - Multi-step process validation
3. Request Construction
4. Response Handling
5. Input Validation (if applicable)
6. Error Handling

### Running Tests

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage

# Update tool schema snapshots
npm run test:snapshots:update
```

**Snapshot Testing:**
Each tool has a snapshot test that validates the tool's schema structure. When tool schemas change:
1. Review the changes carefully
2. Run `UPDATE_SNAPSHOTS=true npm test` to update snapshots
3. Commit the updated snapshot files with your changes

### Test Coverage

**What's Tested:**
- ✅ All 20 tool schemas (snapshot tests)
- ✅ Request construction for all API endpoints
- ✅ Response processing and transformations
  - Schema field extraction (getManagedObjectSchema)
  - Base64 decoding (getVariable)
  - Type-specific encoding (setVariable: String() vs JSON.stringify())
  - Multi-step orchestration (theme tools: GET→modify→PUT)
- ✅ Input validation (Zod schemas)
- ✅ Security validations
  - Path traversal prevention (objectId validation)
  - Query injection prevention (queryESVs quote escaping)
- ✅ Error handling
  - HTTP status codes (401, 400, 404, 409, 403)
  - Network failures
  - Invalid configurations
- ✅ Edge cases
  - Empty results
  - Missing fields
  - Pagination
  - Concurrent state changes (revision conflicts)

**What's NOT Tested:**
- ❌ Integration tests (actual API calls)
- ❌ Authentication flow (authService is mocked)
- ❌ MCP protocol integration (server initialization)

### Writing New Tests

When adding a new tool:

1. **Create test file** in appropriate category:
   ```typescript
   import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
   import { yourNewTool } from '../../../src/tools/category/yourNewTool.js';
   import { snapshotTest } from '../../helpers/snapshotTest.js';
   import { server } from '../../setup.js';
   import { http, HttpResponse } from 'msw';
   import * as apiHelpers from '../../../src/utils/apiHelpers.js';

   describe('yourNewTool', () => {
     let makeAuthenticatedRequestSpy: any;

     beforeEach(() => {
       process.env.AIC_BASE_URL = 'test.forgeblocks.com';
       makeAuthenticatedRequestSpy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
     });

     afterEach(() => {
       makeAuthenticatedRequestSpy.mockRestore();
     });

     it('should match tool schema snapshot', async () => {
       await snapshotTest('yourNewTool', yourNewTool);
     });

     // Add more tests following the patterns above
   });
   ```

2. **Test request construction:**
   - Verify URL is built correctly
   - Check headers are set (Authorization, Content-Type, etc.)
   - Validate query parameters
   - Confirm request body structure
   - Verify correct HTTP method

3. **Test response processing:**
   - If your tool transforms responses, test the transformation logic
   - Verify only expected fields are returned
   - Test edge cases (empty responses, missing fields)

4. **Test input validation:**
   - Validate Zod schema rejects invalid inputs
   - Validate Zod schema accepts valid inputs

5. **Test error handling:**
   - Use `server.use()` to override default handlers
   - Test common HTTP errors (401, 400, 404)
   - Test network failures

6. **Run tests:**
   ```bash
   npm test -- yourNewTool
   ```

### Key Testing Principles

1. **Test OUR code, not the API:**
   - Focus on request construction, response processing, validation
   - Don't test what the API returns for specific inputs
   - Use MSW to simulate realistic API responses

2. **Use dependency injection:**
   - Spy on `makeAuthenticatedRequest` to intercept API calls
   - Inspect spy calls to verify request construction
   - Don't mock at module level

3. **Security-first testing:**
   - Always test path traversal prevention for ID parameters
   - Test query injection prevention for user-provided filters
   - Validate enum constraints are enforced

4. **Test edge cases:**
   - Empty strings vs whitespace-only strings
   - Missing optional fields
   - Pagination boundaries
   - State conflicts (revision mismatches)

## Contributing

This project is designed to be extended and modified for specific use cases. When contributing:

1. Follow existing code patterns and file structure
2. Maintain TypeScript strict mode compliance
3. Add appropriate error handling to all API calls
4. Update CLAUDE.md with any new features or configuration options
5. Test with a real PingOne AIC environment

## Support and Documentation

- **PingOne AIC Documentation:** https://docs.pingidentity.com/pingoneaic/
- **MCP Protocol Specification:** https://modelcontextprotocol.io/
- **MCP TypeScript SDK:** https://github.com/modelcontextprotocol/typescript-sdk

---

*Last Updated: 2025-01-11*
*Version: 1.0.0*