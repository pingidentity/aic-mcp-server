# PingOne Advanced Identity Cloud MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to interact with PingOne Advanced Identity Cloud environments. Query users, analyze authentication logs, and manage identity data directly from your AI conversations.

## What is This?

This server allows AI assistants like Claude to access your PingOne AIC environment through secure, authenticated API calls. Instead of manually querying APIs or navigating the admin console, you can ask your AI assistant natural language questions and get instant answers.

**Example queries:**
- "Find all users with email starting with john@example.com"
- "Show me the authentication logs for transaction ID xyz123"
- "Search for users in the alpha realm with lastname Smith"

## Features

- 🔐 **Dual Authentication**: Supports both interactive user login (PKCE) and service account authentication
- 🔍 **User Search**: Query users across realms with flexible search criteria
- 📊 **Log Analysis**: Retrieve authentication logs by transaction ID
- 🔒 **Secure**: Tokens stored in system keychain, automatic expiration handling
- ⚡ **Efficient**: Per-scope token caching for service accounts

## Prerequisites

- Node.js (with ES2022 support)
- Access to a PingOne Advanced Identity Cloud environment
- One of the following:
  - **For interactive use**: An OAuth 2.0 public client configured in PingOne AIC
  - **For automation**: A service account with appropriate permissions

## Quick Start

### 1. Install

```bash
git clone <repository-url>
cd pingone_AIC_MCP
npm install
npm run build
```

### 2. Configure Authentication

Choose one authentication method:

#### Option A: User Authentication (Interactive)

Best for: Desktop AI assistants, development, testing

Required OAuth client configuration in PingOne AIC:
- Client Type: **Public**
- Grant Types: **Authorization Code**
- Redirect URI: `http://localhost:3000`
- Scopes: `openid`, `fr:idm:*`, `fr:idc:monitoring:*`

Set environment variables:
```bash
export AIC_BASE_URL="your-tenant.forgeblocks.com"
export AIC_CLIENT_REALM="alpha"          # optional, defaults to 'alpha'
export AIC_CLIENT_ID="mcp"               # optional, defaults to 'mcp'
export REDIRECT_URI_PORT="3000"          # optional, defaults to 3000
```

#### Option B: Service Account Authentication

Best for: CI/CD, automation, headless environments

Required setup in PingOne AIC:
- Service account with permissions: `fr:idm:*`, `fr:idc:monitoring:*`
- Private key downloaded as JWK file

Set environment variables:
```bash
export AIC_BASE_URL="your-tenant.forgeblocks.com"
export SERVICE_ACCOUNT_ID="your-service-account-id"
export SERVICE_ACCOUNT_PRIVATE_KEY='{"kty":"RSA","n":"...","e":"AQAB",...}'
```

> **Note**: Service accounts do not support monitoring scopes, so log query tools won't be available.

### 3. Configure Your AI Assistant

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

**User Authentication:**
```json
{
  "mcpServers": {
    "pingone-aic": {
      "command": "node",
      "args": ["/absolute/path/to/pingone_AIC_MCP/dist/index.js"],
      "env": {
        "AIC_BASE_URL": "your-tenant.forgeblocks.com",
        "AIC_CLIENT_REALM": "alpha",
        "AIC_CLIENT_ID": "mcp"
      }
    }
  }
}
```

**Service Account:**
```json
{
  "mcpServers": {
    "pingone-aic": {
      "command": "node",
      "args": ["/absolute/path/to/pingone_AIC_MCP/dist/index.js"],
      "env": {
        "AIC_BASE_URL": "your-tenant.forgeblocks.com",
        "SERVICE_ACCOUNT_ID": "your-service-account-id",
        "SERVICE_ACCOUNT_PRIVATE_KEY": "{\"kty\":\"RSA\",\"n\":\"...\",\"e\":\"AQAB\",...}"
      }
    }
  }
}
```

### 4. Start Using

Restart your AI assistant and start asking questions about your PingOne AIC environment!

## Available Tools

### Search Users
Search for users in a specified realm.

**Parameters:**
- `realm`: Realm to search (e.g., 'alpha', 'bravo')
- `queryTerm`: Search term to match against userName, givenName, sn, or mail

**Required Scopes:** `fr:idm:*`

**Example:**
```
"Find users in the alpha realm with email starting with admin"
```

### Query Logs by Transaction ID
Retrieve authentication logs for a specific transaction.

**Parameters:**
- `transactionId`: The transaction ID to look up

**Required Scopes:** `fr:idc:monitoring:*`

**Note:** Not available when using service account authentication (monitoring scopes not supported).

**Example:**
```
"Show me the authentication logs for transaction a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

## How Authentication Works

The server automatically detects which authentication method to use:

1. **Service Account Detected** (if both `SERVICE_ACCOUNT_ID` and `SERVICE_ACCOUNT_PRIVATE_KEY` are set):
   - Creates signed JWT assertions
   - Exchanges for access tokens with minimal required scopes
   - Caches tokens per scope combination
   - 15-minute token expiry with automatic refresh

2. **User PKCE** (otherwise):
   - Opens browser for user authentication (first use only)
   - Requests all tool scopes upfront
   - Stores token in system keychain
   - Automatic re-authentication when token expires

## Configuration Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `AIC_BASE_URL` | Your PingOne AIC hostname | `openam-example.forgeblocks.com` |

### User Authentication (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `AIC_CLIENT_REALM` | `alpha` | OAuth client realm |
| `AIC_CLIENT_ID` | `mcp` | OAuth client ID |
| `REDIRECT_URI_PORT` | `3000` | Local redirect server port |

### Service Account (Optional)

| Variable | Description |
|----------|-------------|
| `SERVICE_ACCOUNT_ID` | Service account identifier from PingOne AIC |
| `SERVICE_ACCOUNT_PRIVATE_KEY` | JWK private key as JSON string |

## Troubleshooting

### "FATAL: AIC_BASE_URL environment variable is not set"
Set the `AIC_BASE_URL` environment variable to your PingOne AIC hostname (without `https://`).

### "Failed to import service account JWK"
Ensure `SERVICE_ACCOUNT_PRIVATE_KEY` is valid JSON in JWK format. Check that quotes are properly escaped in your configuration.

### "Port 3000 is already in use"
Change `REDIRECT_URI_PORT` to an available port and update your OAuth client's redirect URI to match.

### Browser doesn't open during authentication
Check that the `open` package has permissions to launch your browser, or manually navigate to the URL shown in the error message.

### Tool not available when using service account
The log query tool requires monitoring scopes (`fr:idc:monitoring:*`), which are not supported by service accounts. Use user authentication instead.

## Development

See [CLAUDE.md](CLAUDE.md) or [GEMINI.md](GEMINI.md) for detailed architecture documentation and development guides.

## Security

- Authentication tokens stored securely in system keychain
- PKCE flow prevents authorization code interception
- Service account private keys never transmitted (only signed JWTs)
- Minimal scope requests per operation (service accounts)
- Automatic token expiration and refresh