# PingOne Advanced Identity Cloud MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to interact with PingOne Advanced Identity Cloud environments. Manage users, analyze authentication logs, and query identity data directly from your AI conversations.

## What is This?

This server allows AI assistants like Claude to access your PingOne AIC environment through secure, authenticated API calls. Instead of manually querying APIs or navigating the admin console, you can ask your AI assistant natural language questions and get instant answers.

**Example queries:**
- "Find all users with email starting with john@example.com"
- "Show me the authentication logs for transaction ID xyz123"
- "Create a new user in the alpha realm"
- "Get the schema for alpha_user to see what fields are required"

## Features

- 🔐 **Secure Authentication**: OAuth 2.0 PKCE flow with browser-based user login
- 🔍 **User Search**: Query users across realms with flexible search criteria
- 👤 **User Management**: Create, read, update, and delete users
- 📋 **Schema Discovery**: Retrieve managed object schemas to understand data structure
- 📊 **Log Analysis**: Retrieve authentication logs by transaction ID
- 🔒 **Secure Token Storage**: Tokens stored in system keychain with automatic expiration handling

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

## Available Tools

### searchUsers
Search for users in a specified realm.

**Parameters:**
- `realm`: Realm to search (e.g., 'alpha', 'bravo')
- `queryTerm`: Search term to match against userName, givenName, sn, or mail

**Required Scopes:** `fr:idm:*`

**Example:**
```
"Find users in the alpha realm with email starting with admin"
```

### getManagedObjectSchema
Retrieve the schema definition for a managed object type to understand required and optional fields.

**Parameters:**
- `objectType`: The managed object type (e.g., 'alpha_user', 'bravo_user', 'alpha_role')

**Required Scopes:** `fr:idm:*`

**Example:**
```
"What fields are required to create an alpha_user?"
```

### createUser
Create a new user in a specified realm.

**Parameters:**
- `objectType`: The managed object type (e.g., 'alpha_user', 'bravo_user')
- `userData`: JSON object containing user properties (must include all required fields)

**Required Scopes:** `fr:idm:*`

**Example:**
```
"Create a new user in the alpha realm with username jsmith and email john.smith@example.com"
```

### getUser
Retrieve a user's complete profile by their unique identifier.

**Parameters:**
- `objectType`: The managed object type (e.g., 'alpha_user', 'bravo_user')
- `userId`: The unique identifier (_id) of the user

**Required Scopes:** `fr:idm:*`

**Example:**
```
"Get the user details for ID abc123 in the alpha realm"
```

### patchUser
Update specific fields of a user using JSON Patch operations.

**Parameters:**
- `objectType`: The managed object type (e.g., 'alpha_user', 'bravo_user')
- `userId`: The unique identifier (_id) of the user
- `revision`: The current revision (_rev) from getUser (ensures safe concurrent updates)
- `operations`: Array of JSON Patch operations (add, remove, replace, etc.)

**Required Scopes:** `fr:idm:*`

**Important:** Always retrieve the user first with `getUser` to obtain the current `_rev` value.

**Example:**
```
"Update the email address for user abc123 to newemail@example.com"
```

### deleteUser
Delete a user by their unique identifier.

**Parameters:**
- `objectType`: The managed object type (e.g., 'alpha_user', 'bravo_user')
- `userId`: The unique identifier (_id) of the user

**Required Scopes:** `fr:idm:*`

**Example:**
```
"Delete the user with ID abc123 from the alpha realm"
```

### queryAICLogsByTransactionId
Retrieve authentication logs for a specific transaction.

**Parameters:**
- `transactionId`: The transaction ID to look up

**Required Scopes:** `fr:idc:monitoring:*`

**Example:**
```
"Show me the authentication logs for transaction a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
- Tokens stored in OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- No client secrets required (public client configuration)
- All scopes requested upfront during authentication
- User-based actions for complete audit trail
- Fresh authentication required on each server startup

## Configuration Reference

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AIC_BASE_URL` | Your PingOne AIC hostname (without `https://`) | `openam-example.forgeblocks.com` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_TOKEN_EXCHANGE` | Enable RFC 8693 token exchange (experimental) | `false` |

## Troubleshooting

### "FATAL: AIC_BASE_URL environment variable is not set"
Set the `AIC_BASE_URL` environment variable to your PingOne AIC hostname (without `https://`).

### "Failed to exchange code for token"
Contact your PingOne AIC administrator to verify the OAuth client configuration for this MCP server.

### "Port 3000 is already in use"
Another service is using port 3000. Stop that service and try again.

### "Browser doesn't open during authentication"
Check that the `open` package has permissions to launch your browser, or manually navigate to the URL shown in the error message.

### "Cached token is for different tenant"
The server detects tenant mismatches automatically. Simply re-authenticate when prompted, and the new token will be cached.

## Development

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation and development guides.

### Build & Run

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm start            # Run the server
npm run dev          # Watch mode for development
```

## Security

- Authentication tokens stored securely in system keychain
- PKCE flow prevents authorization code interception
- Fresh authentication required on server startup
- Automatic token expiration and re-authentication
- All actions traceable to authenticated users for audit compliance