# AI Project: PingOne AIC MCP Server

This document provides an overview of the PingOne AIC MCP Server, a TypeScript-based MCP server designed to integrate with AI agents that support the Model Context Protocol (MCP).

## Project Overview

This server exposes tools that allow AI agents to interact with a PingOne Advanced Identity Cloud (AIC) environment. It provides programmatic access to tools such as user management and monitoring capabilities through secure user-based authentication. The server uses OAuth 2.0 PKCE flow for interactive authentication, ensuring all actions are traceable to authenticated users for audit and security compliance.

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
- Stores tokens securely in system keychain under `user-token` account
- Provides `getToken()` interface to all tools

**Key Features:**
- User-based authentication for full audit trail
- Token persistence across sessions via system keychain
- Automatic token expiry checking and refresh
- In-flight request deduplication to prevent concurrent auth flows
- PKCE security to prevent authorization code interception
- No client secrets required (public client configuration)

### Available Tools

All tools declare required OAuth scopes, which are requested upfront during user authentication.

#### 1. `searchUsers`
**File:** [src/tools/searchUsers.ts](src/tools/searchUsers.ts)

Searches for users in a specified PingOne AIC realm.

**Parameters:**
- `realm` (string): The realm to query (e.g., 'alpha')
- `queryTerm` (string): Search term to match against userName, givenName, sn, or mail

**Required Scopes:** `fr:idm:*`

**Returns:** JSON array of matching users (max 10 results) with fields: userName, givenName, sn, mail

**Implementation Notes:**
- Uses SCIM-style query filter with `sw` (starts with) operator
- Queries the IDM managed user endpoint (`/openidm/managed/{realm}_user`)
- Results are sorted by userName

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

## Configuration

### Required Environment Variables

- **`AIC_BASE_URL`** (required): The hostname of your PingOne AIC environment
  - Example: `openam-example.forgeblocks.com`
  - Do not include `https://` or path components
  - Server will exit on startup if not set

### Optional Environment Variables

- **`AIC_CLIENT_REALM`** (default: `'root'`): The OAuth client's realm in PingOne AIC
  - Used to construct OAuth endpoints: `/am/oauth2/{realm}/authorize`
  - Change this if your OAuth client is registered in a different realm

- **`AIC_CLIENT_ID`** (default: `'local-client'`): The OAuth 2.0 client ID
  - Must match a client registered in your PingOne AIC environment
  - Client must be configured as described below

- **`REDIRECT_URI_PORT`** (default: `3000`): Port for the local OAuth redirect server
  - Useful if port 3000 is already in use
  - Must match the redirect URI registered in your OAuth client

### OAuth Client Requirements

**Required Configuration in PingOne AIC:**
- **Client Type:** Public
- **Token Endpoint Authentication Method:** none
- **Grant Types:** Authorization Code
- **Redirect URIs:** `http://localhost:3000` (or configured `REDIRECT_URI_PORT`)
- **Scopes:** All scopes used by tools (e.g., `openid`, `fr:idm:*`, `fr:idc:monitoring:*`)

**Authentication Characteristics:**
- Browser-based interactive user authentication
- All scopes requested upfront during login
- Actions are auditable and traceable to authenticated users
- Tokens cached securely in system keychain
- Ideal for interactive desktop applications (e.g., Claude Desktop)

## Setup and Installation

### Prerequisites
- Node.js (version with ES2022 support)
- Access to a PingOne Advanced Identity Cloud environment
- OAuth client configured in PingOne AIC (see Configuration section)

### Installation Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Configure environment variables:**
   ```bash
   export AIC_BASE_URL="your-tenant.forgeblocks.com"
   export AIC_CLIENT_REALM="root"
   export AIC_CLIENT_ID="local-client"
   export REDIRECT_URI_PORT="3000"
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
        "AIC_BASE_URL": "your-tenant.forgeblocks.com",
        "AIC_CLIENT_REALM": "root",
        "AIC_CLIENT_ID": "local-client",
        "REDIRECT_URI_PORT": "3000"
      }
    }
  }
}
```

### Other MCP Clients

Any MCP client that supports STDIO transport can use this server. Ensure environment variables are configured appropriately for your client.

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
│   ├── index.ts                           # Server entry point and tool registration
│   ├── services/
│   │   └── authService.ts                 # OAuth 2.0 PKCE authentication
│   └── tools/
│       ├── searchUsers.ts                 # User search tool
│       ├── queryAICLogsByTransactionId.ts # Log query tool
│       ├── getManagedObjectSchema.ts      # Schema retrieval tool
│       ├── createUser.ts                  # User creation tool
│       ├── getUser.ts                     # User retrieval tool
│       ├── deleteUser.ts                  # User deletion tool
│       └── patchUser.ts                   # User update tool
├── dist/                                   # Compiled JavaScript (generated)
├── package.json                            # Dependencies and scripts
├── tsconfig.json                           # TypeScript configuration
├── CLAUDE.md                               # This file
└── LICENSE                                 # MIT License
```

## Extending the Server

### Adding New Tools

To add a new tool:

1. Create a new file in `src/tools/` (e.g., `myNewTool.ts`)
2. Define the tool following this pattern:

```typescript
import { z } from 'zod';
import { authService } from '../services/authService.js';

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
      const token = await authService.getToken(SCOPES);

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

## Known Limitations

- **Single session per machine:** Only one authentication session at a time (tokens stored per machine)
- **Token refresh:** No refresh token flow; requires re-authentication when access token expires
- **Rate limiting:** No built-in rate limiting; relies on PingOne AIC's rate limits

## Troubleshooting

### "FATAL: AIC_BASE_URL environment variable is not set"
Set the `AIC_BASE_URL` environment variable to your PingOne AIC hostname.

### "Failed to exchange code for token: invalid_client"
Your OAuth client may not exist or is misconfigured. Verify:
- Client ID matches `AIC_CLIENT_ID` (default: 'mcp')
- Client exists in the correct realm (`AIC_CLIENT_REALM`, default: 'alpha')
- Client is configured as Public with Token Endpoint Auth Method = 'none'

### "Port 3000 is already in use"
Change `REDIRECT_URI_PORT` to an available port and update your OAuth client's redirect URI accordingly.

### "Unknown/invalid scope(s)"
Ensure your OAuth client in PingOne AIC has the required scopes configured:
- `openid`
- `fr:idm:*`
- `fr:idc:monitoring:*`

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

*Last Updated: 2025-01-10*
*Version: 1.0.0*