# PingOne Advanced Identity Cloud MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to interact with PingOne Advanced Identity Cloud environments. Manage users, roles, groups, organizations, analyze authentication logs, and query identity data directly from your AI conversations.

## What is This?

This server allows AI assistants like Claude to access your PingOne AIC environment through secure, authenticated API calls. Instead of manually querying APIs or navigating the admin console, you can ask your AI assistant natural language questions and get instant answers.

**Example queries:**
- "Find all alpha_users with email starting with john@example.com"
- "Query bravo_roles with name containing admin"
- "Show me the authentication logs for transaction ID xyz123"
- "Create a new alpha_user with username jsmith"
- "Create a bravo_role called AdminRole"
- "Get the schema for alpha_group to see what fields are required"
- "Update the description of alpha_organization abc123"
- "What log sources are available?"
- "Show me all ERROR level logs from the am-authentication source in the last hour"
- "Show me all themes for the alpha realm"
- "Create a new theme called 'Corporate Brand' with primary color #0066cc"
- "Delete the theme named 'Test Theme' from the bravo realm"

## Features

- 🔐 **Secure Authentication**: OAuth 2.0 PKCE flow with browser-based user login
- 🔍 **Generic Object Search**: Query users, roles, groups, and organizations with flexible search criteria
- 👥 **Managed Object Operations**: Create, read, update, and delete users, roles, groups, and organizations
- 📋 **Schema Discovery**: Retrieve managed object schemas to understand data structure
- 🎨 **Theme Management**: Full CRUD operations for authentication journey and account page themes
- 📊 **Advanced Log Querying**: Query logs with flexible filtering by time range, source, transaction ID, and payload content with pagination support
- 🔒 **Secure Token Storage**: Tokens stored in system keychain with automatic expiration handling

### Managed Object Support

The server provides generic CRUD operations for **any managed object type** defined in your PingOne AIC environment - including users, roles, groups, organizations, and any custom managed objects you've configured. Use the `listManagedObjects` tool to discover all available types in your tenant.

**Common Examples:**
- **Users** (`alpha_user`, `bravo_user`) - Identity records with authentication credentials
- **Roles** (`alpha_role`, `bravo_role`) - Collections of permissions and entitlements
- **Groups** (`alpha_group`, `bravo_group`) - Collections of users or other objects
- **Organizations** (`alpha_organization`, `bravo_organization`) - Organizational units

## Prerequisites

- Node.js (with ES2022 support)
- Access to a PingOne Advanced Identity Cloud environment

## Quick Start

### 1. Install

```bash
git clone <repository-url>
cd pingone_AIC_MCP
npm install
npm run build
```

### 2. Configure Environment

Set the required environment variable:

```bash
export AIC_BASE_URL="your-tenant.forgeblocks.com"
```

> **Note**: Do not include `https://` or path components in the URL.

### 3. Configure Your AI Assistant

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### 4. Start Using

Restart your AI assistant and start asking questions about your PingOne AIC environment! On first use, your browser will open for authentication.

## Docker Deployment (Experimental)

> **⚠️ EXPERIMENTAL FEATURE**: Docker deployment uses OAuth 2.0 Device Code Flow with MCP form elicitation for authentication. **MCP client support for form elicitation is currently limited.** This feature is in preview as it will only work for certain AI agents. If your agent doesn't support elicitation, use the local deployment method above instead.

### Build

```bash
npm run docker:build
```

### Configure Your AI Assistant

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pingone-aic": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "AIC_BASE_URL=your-tenant.forgeblocks.com",
        "pingone-aic-mcp:latest"
      ]
    }
  }
}
```

Replace `your-tenant.forgeblocks.com` with your PingOne AIC environment hostname.

**Authentication**: When authentication is required, your MCP client should display a URL. Click it to authenticate in your browser, then accept the prompt in your client. If you don't see the URL, your client may not support form elicitation yet.

## Available Tools

### listManagedObjects
Discover all managed object types available in your PingOne AIC environment.

**Parameters:** None

**Required Scopes:** `fr:idm:*`

**Returns:** List of all managed object type names (e.g., 'alpha_user', 'bravo_role', 'alpha_device').

**Examples:**
```
"What managed object types are defined in this environment?"
"List all available managed objects"
"Show me what object types I can work with"
```

### queryManagedObjects
Query managed objects (users, roles, groups, organizations) using powerful CREST query filter syntax with pagination, sorting, and field selection.

**Parameters:**
- `objectType`: Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `queryFilter` (optional): CREST query filter expression. If omitted, returns all objects up to pageSize
- `pageSize` (optional): Number of objects to return per page (default: 50, max: 250)
- `pagedResultsCookie` (optional): Pagination cookie from previous response to retrieve next page
- `sortKeys` (optional): Comma-separated field names to sort by (prefix with "-" for descending)
- `fields` (optional): Comma-separated field names to return (returns all fields if omitted)

**Required Scopes:** `fr:idm:*`

**Important:** Call `getManagedObjectSchema` first to discover available fields for your queries.

**Query Filter Operators:**
- `eq` (equals), `co` (contains), `sw` (starts with)
- `gt`, `ge`, `lt`, `le` (comparison)
- `pr` (present), `!` (NOT)
- `and`, `or` (boolean logic)

**Examples:**
```
"List all alpha_users"
"Find alpha_users where userName starts with 'admin'"
"Query bravo_roles where name contains 'manager' and return only name and description fields"
"Get the first 10 alpha_groups sorted by name"
```

### getManagedObjectSchema
Retrieve the schema definition for a managed object type to understand required and optional fields.

**Parameters:**
- `objectType`: Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.

**Required Scopes:** `fr:idm:*`

**Example:**
```
"What fields are required to create an alpha_role?"
```

### createManagedObject
Create a new managed object (user, role, group, organization, or any other managed object type).

**Parameters:**
- `objectType`: Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `objectData`: JSON object containing object properties (must include all required fields)

**Required Scopes:** `fr:idm:*`

**Examples:**
```
"Create a new alpha_user with username jsmith and email john.smith@example.com"
"Create a bravo_role called AdminRole with description Full system admin"
```

### getManagedObject
Retrieve a managed object's complete profile by its unique identifier.

**Parameters:**
- `objectType`: Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `objectId`: The unique identifier (_id) of the object

**Required Scopes:** `fr:idm:*`

**Examples:**
```
"Get the alpha_user details for ID abc123"
"Show me the bravo_role with ID xyz789"
```

### patchManagedObject
Update specific fields of a managed object using JSON Patch operations.

**Parameters:**
- `objectType`: Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `objectId`: The unique identifier (_id) of the object
- `revision`: The current revision (_rev) from getManagedObject (ensures safe concurrent updates)
- `operations`: Array of JSON Patch operations (add, remove, replace, etc.)

**Required Scopes:** `fr:idm:*`

**Important:** Always retrieve the object first with `getManagedObject` to obtain the current `_rev` value.

**Examples:**
```
"Update the email address for alpha_user abc123 to newemail@example.com"
"Change the description of bravo_role xyz789 to Updated admin role"
```

### deleteManagedObject
Delete a managed object by its unique identifier.

**Parameters:**
- `objectType`: Any managed object type in your environment (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization'). Use `listManagedObjects` to discover available types.
- `objectId`: The unique identifier (_id) of the object

**Required Scopes:** `fr:idm:*`

**Examples:**
```
"Delete the alpha_user with ID abc123"
"Remove the bravo_group with ID def456"
```

### getLogSources
Retrieve the list of available log sources in PingOne AIC.

**Parameters:** None

**Required Scopes:** `fr:idc:monitoring:*`

**Returns:** List of available log sources (e.g., 'am-authentication', 'am-everything', 'idm-activity', 'idm-everything')

**Example:**
```
"What log sources are available in this environment?"
```

### queryLogs
Query PingOne AIC logs with advanced filtering capabilities including time ranges, log sources, transaction IDs, and payload content filters.

**Parameters:**
- `sources` (optional): Array of log sources to query (e.g., ['am-authentication', 'idm-activity'])
- `beginTime` (optional): Start time in ISO 8601 format (e.g., '2025-01-11T10:00:00Z')
- `endTime` (optional): End time in ISO 8601 format (e.g., '2025-01-11T12:00:00Z')
- `transactionId` (optional): Filter by specific transaction ID
- `queryFilter` (optional): Advanced payload content filter using ForgeRock query filter syntax
- `pageSize` (optional): Number of logs to return (1-1000, default 100)
- `pagedResultsCookie` (optional): Pagination token for retrieving next page of results

**Required Scopes:** `fr:idc:monitoring:*`

**Important:**
- **CRITICAL**: All queryFilter field paths MUST start with `/` (e.g., `/payload/level`). Missing the leading slash causes 500 Internal Server Error.
- Time range limited to 24 hours maximum
- Logs stored for 30 days
- Rate limit: 60 requests/min
- Use `pagedResultsCookie` from response to retrieve additional pages

**Query Filter Examples:**
```
/payload/level eq "ERROR"
/payload/eventName eq "AM-LOGIN-COMPLETED"
/payload/result eq "SUCCESSFUL"
/payload/client/ip co "10.104.1.5"
/payload/principal co "bob"
/payload/response.statusCode ge 400
```

**Examples:**
```
"Show me ERROR level logs from the last 2 hours"
"Find all authentication logs where the user is john.doe"
"Get logs from am-authentication source between 10am and 11am today"
"Show me the next page of results using this pagination token"
"Show me logs for transaction ID a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Tip:** To query by transaction ID, simply include `transactionId` in your request to `queryLogs`:
```
queryLogs({
  sources: ['am-everything', 'idm-everything'],
  transactionId: 'your-transaction-id-here'
})
```

## Theme Management Tools

Customize the appearance of authentication journeys and account pages with comprehensive theme management.

### getThemeSchema
Get comprehensive schema documentation for PingOne AIC themes.

**Parameters:** None

**Required Scopes:** None (static documentation)

**Returns:** Complete documentation of all available theme fields, types, enums, defaults, and requirements.

**Important:** Call this before creating or updating themes to understand all available customization options.

**Example:**
```
"Show me the theme schema to understand what fields I can customize"
```

### getThemes
List all themes available in a realm.

**Parameters:**
- `realm`: The realm to query ('alpha' or 'bravo')

**Required Scopes:** `fr:idm:*`

**Returns:** List of themes with their names and default status.

**Examples:**
```
"Show me all themes in the alpha realm"
"List available themes for bravo"
```

### getTheme
Retrieve a specific theme's complete configuration.

**Parameters:**
- `realm`: The realm containing the theme
- `themeIdentifier`: Theme ID or name

**Required Scopes:** `fr:idm:*`

**Returns:** Complete theme configuration including all styling, logos, headers, footers, and page settings.

**Examples:**
```
"Get the theme named 'Corporate Brand' from the alpha realm"
"Show me the complete configuration for theme ID abc-123"
```

### createTheme
Create a new theme for a realm.

**Parameters:**
- `realm`: The realm to create the theme in
- `themeData`: Theme configuration object (must include `name` property)

**Required Scopes:** `fr:idm:*`

**Important:**
- Only `name` is required - all other fields are optional
- The AIC UI applies defaults as necessary for omitted fields
- Theme is created with `isDefault: false` (use `setDefaultTheme` to change)
- Call `getThemeSchema` first to see all available customization options

**Examples:**
```
"Create a new theme called 'Corporate Brand' in the alpha realm"
"Create a theme named 'Dark Mode' with primary color #1a1a1a and background color #000000"
```

### updateTheme
Update an existing theme's properties.

**Parameters:**
- `realm`: The realm containing the theme
- `themeIdentifier`: Theme ID or name to update
- `themeUpdates`: Object containing fields to update

**Required Scopes:** `fr:idm:*`

**Important:**
- Provide only the fields you want to change - all others are preserved
- Cannot update `_id` (immutable) or `isDefault` (use `setDefaultTheme`)

**Examples:**
```
"Update the 'Corporate Brand' theme to use primary color #0066cc"
"Change the logo URL for theme 'Marketing Theme' to https://example.com/new-logo.svg"
```

### deleteTheme
Delete a theme from a realm.

**Parameters:**
- `realm`: The realm containing the theme
- `themeIdentifier`: Theme ID or name to delete

**Required Scopes:** `fr:idm:*`

**Important:**
- Cannot delete the default theme
- Must set another theme as default first using `setDefaultTheme`
- Deletion is permanent and cannot be undone

**Examples:**
```
"Delete the theme named 'Test Theme' from the alpha realm"
"Remove the theme with ID abc-123 from bravo"
```

### setDefaultTheme
Set a theme as the default for a realm.

**Parameters:**
- `realm`: The realm containing the theme
- `themeIdentifier`: Theme ID or name to set as default

**Required Scopes:** `fr:idm:*`

**Note:** Automatically sets the current default theme to non-default. Only one theme can be default per realm.

**Examples:**
```
"Set 'Corporate Brand' as the default theme for alpha realm"
"Make the theme with ID xyz-789 the default for bravo"
```

## Environment Secrets and Variables (ESV) Tools

Manage environment secrets and variables used for configuration and credentials in PingOne AIC.

### queryESVs
Query environment secrets or variables by ID pattern with pagination and sorting.

**Parameters:**
- `type`: Type of ESV to query ('variable' or 'secret')
- `queryTerm` (optional): Search term to filter by ID. If omitted, returns all ESVs up to pageSize
- `pageSize` (optional): Number of results to return per page (default: 50, max: 100)
- `pagedResultsCookie` (optional): Pagination cookie from previous response to retrieve next page
- `sortKeys` (optional): Comma-separated field names to sort by (prefix with "-" for descending)

**Required Scopes:** `fr:idc:esv:read`

**Examples:**
```
"List all environment variables"
"Find environment variables with ID starting with esv-prod"
"Show me all environment secrets"
"Get the next page of variables using this pagination cookie"
```

### getVariable
Retrieve a specific environment variable by ID with decoded value.

**Parameters:**
- `variableId`: Variable ID (format: esv-*)

**Required Scopes:** `fr:idc:esv:read`

**Returns:** Variable configuration including decoded value.

**Example:**
```
"Get the variable esv-database-url"
```

### setVariable
Create or update an environment variable.

**Parameters:**
- `variableId`: Variable ID (format: esv-*)
- `type`: Variable type ('string', 'array', 'object', 'bool', 'int', 'number')
- `value`: Variable value (type must match declared type)
- `description` (optional): Description of the variable's purpose

**Required Scopes:** `fr:idc:esv:*`

**Important:** Type cannot be changed after creation.

**Examples:**
```
"Create an environment variable esv-api-key with value 'secret123'"
"Update the variable esv-max-connections to 100"
```

### deleteVariable
Delete an environment variable by ID.

**Parameters:**
- `variableId`: Variable ID (format: esv-*)

**Required Scopes:** `fr:idc:esv:*`

**Important:** Deletion is permanent and cannot be undone.

**Example:**
```
"Delete the variable esv-old-config"
```

## How Authentication Works

The server uses OAuth 2.0 PKCE (Proof Key for Code Exchange) flow for secure user authentication:

1. **First Use**: Browser opens automatically for user login at PingOne AIC
2. **Token Storage**: Access token stored securely in system keychain
3. **Automatic Reuse**: Cached token used for subsequent requests
4. **Tenant Awareness**: Tokens are validated against the configured `AIC_BASE_URL`
5. **Auto Re-authentication**: When token expires, browser opens again for new login

**Security Features:**
- PKCE prevents authorization code interception attacks
- Tokens stored securely in OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- User-based actions for complete audit trail
- Fresh authentication required on each server startup

## Configuration Reference

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AIC_BASE_URL` | Your PingOne AIC hostname (without `https://`) | `openam-example.forgeblocks.com` |

## Troubleshooting

### "FATAL: AIC_BASE_URL environment variable is not set"
Set the `AIC_BASE_URL` environment variable to your PingOne AIC hostname (without `https://`).

### "Failed to exchange code for token"
If you encounter this error, raise a support ticket with Ping to request the OAuth client configuration.

### "Port 3000 is already in use"
Another service is using port 3000. Stop that service and try again.

### "Browser doesn't open during authentication"
Check that the `open` package has permissions to launch your browser, or manually navigate to the URL shown in the error message.

### "Cached token is for different tenant"
The server detects tenant mismatches automatically. Simply re-authenticate when prompted, and the new token will be cached.

## Development

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation and development guides.

**Tool Organization:** Tools are organized into four categories:
- `src/tools/managedObjects/` - CRUD operations for users, roles, groups, and organizations
- `src/tools/logs/` - Log querying and monitoring
- `src/tools/themes/` - Theme management for authentication journeys
- `src/tools/esv/` - Environment secrets and variables management

Each category has an `index.ts` file that re-exports all tools, making it easy to enable/disable entire feature sets.

### Build & Run

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (includes postbuild to make files executable)
npm start            # Run the server
npm run dev          # Watch mode for development
npm run typecheck    # Type check without building
```

### Testing

The project includes a comprehensive test suite covering all server tools with both snapshot and unit tests.

**Run tests:**
```bash
npm test                        # Run all tests
npm run test:watch              # Watch mode for development
npm run test:coverage           # Run with coverage report
npm run test:snapshots:update   # Update tool schema snapshots
```

**Test Infrastructure:**
- **Framework:** Vitest for fast, modern testing
- **HTTP Mocking:** MSW (Mock Service Worker) for realistic API simulation
- **Pattern:** Dependency injection with `vi.spyOn()` to test application logic without API calls

**Test Coverage:**
- **Snapshot Tests:** All tool schemas are validated against snapshots to detect unintended changes
- **Unit Tests:** Request construction, response processing, input validation, error handling, and security validations (path traversal, query injection prevention)

Tests are organized by tool category in `test/tools/` mirroring the source structure.

### Testing with MCP Inspector

Use the MCP Inspector to visually test your server's tools in a web interface.

**For development (recommended - no build required):**
```bash
AIC_BASE_URL=your-tenant.forgeblocks.com npm run dev:inspect
```

**For production (requires build first):**
```bash
npm run build
AIC_BASE_URL=your-tenant.forgeblocks.com npm run inspect
```

This will:
1. Start the MCP Inspector with your server
2. Pass the required `AIC_BASE_URL` environment variable
3. Open a web interface (default: http://localhost:6274) for interactive testing

The inspector lets you test all available tools, view their inputs/outputs, and debug the OAuth authentication flow. The `dev:inspect` script runs directly on TypeScript source files for faster iteration during development.

## Security

- Authentication tokens stored securely in system keychain
- PKCE flow prevents authorization code interception
- Fresh authentication required on server startup
- Automatic token expiration and re-authentication
- All actions traceable to authenticated users for audit compliance
- Input validation with path traversal protection on all object IDs
- Flexible object type validation accepts any managed object type defined in your environment