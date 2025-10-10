# AI Project: PingOne AIC MCP Server

This document provides an overview of the PingOne AIC MCP Server, a TypeScript-based MCP server designed to integrate with AI agents that support the Model Context Protocol (MCP).

## Project Overview

This server exposes tools that allow AI agents to interact with a PingOne Advanced Identity Cloud (AIC) environment. It provides programmatic access to tools such as user management and monitoring capabilities through a secure OAuth 2.0 PKCE authentication flow.

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

### Authentication Service
[src/services/authService.ts](src/services/authService.ts) handles OAuth 2.0 PKCE authentication:
- Implements the complete PKCE flow (Authorization Code with PKCE)
- Opens system browser for user authentication
- Runs local HTTP server on configurable port to receive OAuth redirect
- Stores access tokens securely in system keychain with expiration tracking
- Automatically refreshes expired tokens by re-authenticating
- Configurable via environment variables for different OAuth client setups

**Key Features:**
- Token persistence across sessions via keychain
- Automatic token expiry checking
- In-flight request deduplication (prevents multiple simultaneous auth flows)

### Available Tools

#### 1. `searchUsers`
**File:** [src/tools/searchUsers.ts](src/tools/searchUsers.ts)

Searches for users in a specified PingOne AIC realm.

**Parameters:**
- `realm` (string): The realm to query (e.g., 'alpha')
- `queryTerm` (string): Search term to match against userName, givenName, sn, or mail

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

### Optional Environment Variables (with defaults)

- **`AIC_CLIENT_REALM`** (default: `'alpha'`): The OAuth client's realm in PingOne AIC
  - Used to construct OAuth endpoints: `/am/oauth2/{realm}/authorize`
  - Change this if your OAuth client is registered in a different realm

- **`AIC_CLIENT_ID`** (default: `'mcp'`): The OAuth 2.0 client ID
  - Must match a client registered in your PingOne AIC environment
  - Client must be configured as:
    - Client Type: Public
    - Token Endpoint Authentication Method: none
    - Grant Types: Authorization Code
    - Redirect URIs: `http://localhost:{REDIRECT_URI_PORT}`
    - Scopes: `openid fr:idm:* fr:idc:monitoring:*`

- **`REDIRECT_URI_PORT`** (default: `3000`): Port for the local OAuth redirect server
  - Useful if port 3000 is already in use
  - Must match the redirect URI registered in your OAuth client

### OAuth Client Configuration

The server expects an OAuth 2.0 client with the following configuration in PingOne AIC:

**Required Settings:**
- **Client Type:** Public
- **Token Endpoint Authentication Method:** none
- **Grant Types:** Authorization Code
- **Redirect URIs:** `http://localhost:3000` (or your custom `REDIRECT_URI_PORT`)
- **Scopes:** `openid`, `fr:idm:*`, `fr:idc:monitoring:*` (and more as relevant for future tools)

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
   Set at minimum `AIC_BASE_URL` and optionally customize other settings:
   ```bash
   export AIC_BASE_URL="your-tenant.forgeblocks.com"
   export AIC_CLIENT_REALM="alpha"
   export AIC_CLIENT_ID="mcp"
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
        "AIC_CLIENT_REALM": "alpha",
        "AIC_CLIENT_ID": "mcp",
        "REDIRECT_URI_PORT": "3000"
      }
    }
  }
}
```

### Other MCP Clients

Any MCP client that supports STDIO transport can use this server. Ensure environment variables are configured appropriately for your client.

## Authentication Flow

1. When a tool is first called, the server checks for a valid access token in the system keychain
2. If no valid token exists or the token has expired:
   - Server starts a local HTTP server on `REDIRECT_URI_PORT`
   - Opens the system's default browser to the PingOne AIC authorization page
   - User authenticates and grants consent
   - Browser redirects to `http://localhost:{port}` with authorization code
   - Server exchanges authorization code for access token using PKCE
   - Token is stored in system keychain with expiration time
3. Access token is used for subsequent API calls until it expires
4. When token expires, the flow repeats automatically

**Security Features:**
- PKCE (Proof Key for Code Exchange) prevents authorization code interception
- Tokens stored in OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- No client secrets (public client model)
- Tokens are bound to the specific PingOne AIC environment

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
│   │   └── authService.ts                 # OAuth 2.0 PKCE authentication service
│   └── tools/
│       ├── searchUsers.ts                 # User search tool
│       └── queryAICLogsByTransactionId.ts # Log query tool
├── dist/                                   # Compiled JavaScript (generated)
├── package.json                            # Dependencies and scripts
├── tsconfig.json                           # TypeScript configuration
├── GEMINI.md                               # This file
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

export const myNewTool = {
  name: 'myNewTool',
  title: 'My New Tool',
  description: 'Description of what the tool does',
  inputSchema: {
    param1: z.string().describe("Description of param1"),
    param2: z.number().optional().describe("Optional parameter"),
  },
  async toolFunction({ param1, param2 }: { param1: string; param2?: number }) {
    try {
      const token = await authService.getToken();

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

If your new tool requires additional OAuth scopes:

1. Update the `SCOPES` constant in `src/services/authService.ts`
2. Ensure the OAuth client in PingOne AIC is configured with the additional scopes
3. Users will need to re-authenticate to grant new permissions

**Note:** Consider implementing token exchange (RFC 8693) for fine-grained scope management per tool in the future.

## Known Limitations

- **Single user session:** Only one user can be authenticated at a time (tokens are stored per machine, not per user)
- **Browser-based auth only:** Requires a system browser; no support for headless/server environments currently
- **Token refresh:** No refresh token flow implemented; requires re-authentication when access token expires
- **Scope management:** All tools share the same broad OAuth scopes; no per-tool scope reduction
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
4. Update GEMINI.md with any new features or configuration options
5. Test with a real PingOne AIC environment

## Support and Documentation

- **PingOne AIC Documentation:** https://docs.pingidentity.com/pingoneaic/
- **MCP Protocol Specification:** https://modelcontextprotocol.io/
- **MCP TypeScript SDK:** https://github.com/modelcontextprotocol/typescript-sdk

---

*Last Updated: 2025-01-10*
*Version: 1.0.0*