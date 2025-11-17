# AI Project: PingOne AIC MCP Server

This document provides an overview of the PingOne AIC MCP Server, a TypeScript-based MCP server designed to integrate with AI agents that support the Model Context Protocol (MCP).

## Project Overview

This server exposes tools that allow AI agents to interact with a PingOne Advanced Identity Cloud (AIC) environment. It provides programmatic access to managed object operations (create, read, update, delete, search) for users, roles, groups, and organizations, as well as monitoring capabilities through secure user-based authentication. The server uses OAuth 2.0 PKCE flow for interactive authentication, ensuring all actions are traceable to authenticated users for audit and security compliance.

### Supported Managed Object Types

The server provides generic CRUD operations for the following object types across alpha and bravo realms:
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

#### 1. `queryManagedObjects`
**File:** [src/tools/queryManagedObjects.ts](src/tools/queryManagedObjects.ts)

Query managed objects in PingOne AIC using a query term.

**Parameters:**
- `objectType` (string): The managed object type (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')
- `queryTerm` (string): Query term (minimum 3 characters)

**Supported Object Types:**
- `alpha_user`, `bravo_user` - Queries: userName, givenName, sn, mail
- `alpha_role`, `bravo_role` - Queries: name, description
- `alpha_group`, `bravo_group` - Queries: name, description
- `alpha_organization`, `bravo_organization` - Queries: name, description

**Required Scopes:** `fr:idm:*`

**Returns:** JSON array of matching objects (max 10 results)

**Implementation Notes:**
- Uses SCIM-style query filter with `sw` (starts with) operator
- Configuration-driven query fields based on object type
- Validates object type using Zod enum
- Enforces minimum query term length of 3 characters
- Results sorted by first query field

#### 2. `queryAICLogsByTransactionId`
**File:** [src/tools/queryAICLogsByTransactionId.ts](src/tools/queryAICLogsByTransactionId.ts)

Queries am-authentication logs in PingOne AIC by transaction ID.

**Parameters:**
- `transactionId` (string): The transaction ID to query logs for

**Required Scopes:** `fr:idc:monitoring:*`

**Returns:** JSON array of log entries matching the transaction ID

**Implementation Notes:**
- Queries the monitoring logs endpoint (`/monitoring/logs`)
- Filters by source type: `am-authentication`
- Useful for debugging authentication flows and tracking user sessions

#### 3. `getManagedObjectSchema`
**File:** [src/tools/getManagedObjectSchema.ts](src/tools/getManagedObjectSchema.ts)

Retrieves the schema definition for a specific managed object type to understand its structure and requirements.

**Parameters:**
- `objectType` (string): The managed object type (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')

**Required Scopes:** `fr:idm:*`

**Returns:** JSON object containing required properties and their formats

**Implementation Notes:**
- Queries the IDM configuration endpoint (`/openidm/config/managed`)
- Returns only required properties to minimize context
- Use before creating managed objects to understand what fields are necessary
- Works for all supported object types: user, role, group, organization

#### 4. `createManagedObject`
**File:** [src/tools/createManagedObject.ts](src/tools/createManagedObject.ts)

Creates a new managed object in PingOne AIC.

**Parameters:**
- `objectType` (string): The managed object type - validated enum (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')
- `objectData` (object): JSON object containing object properties (must include all required fields)

**Supported Object Types:**
- `alpha_user`, `bravo_user`
- `alpha_role`, `bravo_role`
- `alpha_group`, `bravo_group`
- `alpha_organization`, `bravo_organization`

**Required Scopes:** `fr:idm:*`

**Returns:** Success message with the created object's `_id` and transaction ID

**Implementation Notes:**
- Uses the IDM managed object creation endpoint (`/openidm/managed/{objectType}?_action=create`)
- Returns only the `_id` to minimize context usage
- Includes transaction ID in response for debugging
- Validates objectType using Zod enum
- Use `getManagedObjectSchema` first to determine required fields

#### 5. `getManagedObject`
**File:** [src/tools/getManagedObject.ts](src/tools/getManagedObject.ts)

Retrieves a managed object's complete profile by its unique identifier.

**Parameters:**
- `objectType` (string): The managed object type - validated enum (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')
- `objectId` (string): The unique identifier (`_id`) of the object

**Required Scopes:** `fr:idm:*`

**Returns:** Complete object including all fields and metadata

**Implementation Notes:**
- Queries the IDM managed object endpoint (`/openidm/managed/{objectType}/{objectId}`)
- Returns full object profile including `_rev` (revision) field
- The `_rev` field is required for safe updates using `patchManagedObject`
- Works for all supported object types

#### 6. `patchManagedObject`
**File:** [src/tools/patchManagedObject.ts](src/tools/patchManagedObject.ts)

Updates specific fields of a managed object using JSON Patch operations (RFC 6902).

**Parameters:**
- `objectType` (string): The managed object type - validated enum (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')
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
- Field paths use JSON Pointer format (e.g., '/name', '/description', '/mail')
- Works for all supported object types

#### 7. `deleteManagedObject`
**File:** [src/tools/deleteManagedObject.ts](src/tools/deleteManagedObject.ts)

Deletes a managed object by its unique identifier.

**Parameters:**
- `objectType` (string): The managed object type - validated enum (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')
- `objectId` (string): The unique identifier (`_id`) of the object

**Required Scopes:** `fr:idm:*`

**Returns:** Success message confirming deletion with transaction ID

**Implementation Notes:**
- Uses HTTP DELETE on the IDM managed object endpoint
- Permanent deletion - cannot be undone
- Includes transaction ID in response for audit trail
- Works for all supported object types

### Theme Management Tools

The server provides comprehensive theme management capabilities for customizing the appearance of authentication journeys and account pages in PingOne AIC.

#### 8. `getThemeSchema`
**File:** [src/tools/getThemeSchema.ts](src/tools/getThemeSchema.ts)

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

#### 9. `getRealmThemes`
**File:** [src/tools/getRealmThemes.ts](src/tools/getRealmThemes.ts)

Retrieve all themes for a specific realm.

**Parameters:**
- `realm` (string): The realm to query - validated enum ('alpha' or 'bravo')

**Required Scopes:** `fr:idm:*`

**Returns:** List of themes with `name` and `isDefault` status

**Implementation Notes:**
- Use this to discover available themes before getting details or making updates
- Returns minimal information (name and default status) for quick listing

#### 10. `getTheme`
**File:** [src/tools/getTheme.ts](src/tools/getTheme.ts)

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
**File:** [src/tools/createTheme.ts](src/tools/createTheme.ts)

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
**File:** [src/tools/updateTheme.ts](src/tools/updateTheme.ts)

Update an existing theme's properties.

**Parameters:**
- `realm` (string): The realm containing the theme
- `themeIdentifier` (string): Theme ID or name to update
- `updates` (object): Fields to update (partial theme object)

**Required Scopes:** `fr:idm:*`

**Returns:** Success message with updated theme's `_id` and `name`

**Implementation Notes:**
- Provide only the fields you want to change - all others are preserved
- Cannot update `_id` (immutable) or `isDefault` (use `setDefaultTheme` instead)
- Can query by either `_id` or `name`
- Validates name uniqueness if renaming the theme

#### 13. `deleteTheme`
**File:** [src/tools/deleteTheme.ts](src/tools/deleteTheme.ts)

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
**File:** [src/tools/setDefaultTheme.ts](src/tools/setDefaultTheme.ts)

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

## Configuration

### Environment Variables

Only one environment variable is required:

- **`AIC_BASE_URL`** (required): The hostname of your PingOne AIC environment
  - Example: `openam-example.forgeblocks.com`
  - Do not include `https://` or path components
  - Server will exit on startup if not set

The server requires two OAuth clients to be configured in your PingOne AIC environment:

- **`AICMCPClient`**: Used for OAuth 2.0 PKCE authentication flow
  - Must be configured as a public client (no client secret)
  - Requires scopes: `openid`, `fr:idm:*`, `fr:idc:monitoring:*`
  - Redirect URI: `http://localhost:3000`

- **`AICMCPExchangeClient`**: Used for RFC 8693 token exchange
  - Must be configured as a public client (no client secret)
  - Only requires token exchange grant type: `urn:ietf:params:oauth:grant-type:token-exchange`
  - Requires same scopes as AICMCPClient

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
│   │   └── managedObjectTypes.ts           # Shared object type configuration and validation
│   ├── services/
│   │   └── authService.ts                  # OAuth 2.0 PKCE authentication
│   ├── utils/
│   │   ├── apiHelpers.ts                   # Shared API request helpers
│   │   └── responseHelpers.ts              # Response formatting utilities
│   └── tools/
│       ├── queryManagedObjects.ts         # Generic managed object search
│       ├── createManagedObject.ts          # Generic object creation
│       ├── getManagedObject.ts             # Generic object retrieval
│       ├── patchManagedObject.ts           # Generic object update (JSON Patch)
│       ├── deleteManagedObject.ts          # Generic object deletion
│       ├── getManagedObjectSchema.ts       # Schema retrieval
│       ├── queryAICLogsByTransactionId.ts  # Log query by transaction ID
│       ├── getLogSources.ts                # Available log sources
│       └── queryLogs.ts                    # Advanced log querying
├── dist/                                    # Compiled JavaScript (generated)
├── package.json                             # Dependencies and scripts
├── tsconfig.json                            # TypeScript configuration
├── CLAUDE.md                                # This file
└── LICENSE                                  # MIT License
```

## Extending the Server

### Adding New Tools

To add a new tool:

1. Create a new file in `src/tools/` (e.g., `myNewTool.ts`)
2. Define the tool following this pattern:

```typescript
import { z } from 'zod';
import { getAuthService } from '../services/authService.js';

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

3. Register the tool in `src/index.ts`:

```typescript
import { myNewTool } from './tools/myNewTool.js';

server.registerTool(
  myNewTool.name,
  {
    title: myNewTool.title,
    description: myNewTool.description,
    inputSchema: myNewTool.inputSchema,
  },
  myNewTool.toolFunction
);
```

4. Rebuild: `npm run build`

### OAuth Scope Requirements

All tools must declare their required scopes in the `scopes` property. When adding new tools:

1. Define scopes as a constant (e.g., `const SCOPES = ['fr:idm:*'];`)
2. Reference the constant in both the tool definition (`scopes: SCOPES`) and function call (`authService.getToken(SCOPES)`)
3. Ensure OAuth client is configured with all tool scopes

**Scope Behavior:**
- All scopes from all tools are collected and requested upfront during user authentication
- The scopes parameter in `getToken(scopes)` is kept for future token exchange support but currently unused

### Adding New Managed Object Types

To add support for a new managed object type (e.g., `device`, `application`):

1. **Update the shared configuration** in `src/config/managedObjectTypes.ts`:
   ```typescript
   export const BASE_OBJECT_TYPES = ['user', 'role', 'group', 'organization', 'device'] as const;
   ```

2. **Add query field configuration** in `src/tools/queryManagedObjects.ts`:
   ```typescript
   const SEARCH_FIELD_CONFIG: Record<string, string[]> = {
     user: ['userName', 'givenName', 'sn', 'mail'],
     role: ['name', 'description'],
     group: ['name', 'description'],
     organization: ['name', 'description'],
     device: ['deviceId', 'deviceName', 'status'], // New object type
   };

   const RETURN_FIELD_CONFIG: Record<string, string[]> = {
     user: ['userName', 'givenName', 'sn', 'mail'],
     role: ['name', 'description'],
     group: ['name', 'description'],
     organization: ['name', 'description'],
     device: ['deviceId', 'deviceName', 'status'], // New object type
   };
   ```

3. **Update tool descriptions** to include the new object type in:
   - `queryManagedObjects` - Add to description
   - `createManagedObject` - Add to Supported Object Types section
   - Other tools will automatically support it via the enum validation

4. **Rebuild**: `npm run build`

**No code changes needed** for createManagedObject, getManagedObject, patchManagedObject, deleteManagedObject, or getManagedObjectSchema - they work with any object type automatically!

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