# PingOne Advanced Identity Cloud MCP Server

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

---

**[Features](#features)** • **[Use Cases](#use-cases)** • **[Prerequisites](#prerequisites)** • **[Quick Start](#quick-start)** • **[Authentication](#authentication)** • **[Available Tools](#available-tools)** • **[Docker Deployment](#docker-deployment)** • **[Security](#security)** • **[Troubleshooting](#troubleshooting)** • **[Development](#development)** • **[License](#license)**

---

> [!CAUTION]
> **Beta Software Notice: This software is currently in beta and is provided AS IS without any warranties.**
>
> - Features, APIs, and functionality may change at any time without notice
> - Not recommended for production use or critical workloads
> - Support during the beta period is limited
> - Issues and feedback can be reported through the [GitHub issue tracker](https://github.com/your-org/pingone_AIC_MCP/issues)
>
> By using this beta software, you acknowledge and accept these conditions.

An MCP (Model Context Protocol) server that enables AI assistants to interact with PingOne Advanced Identity Cloud environments. Manage users, roles, groups, organizations, customize authentication themes, analyze logs, and query identity data directly from your AI conversations.

Ask questions like "Find all alpha_users with email starting with john@example.com", "Create a new theme called 'Corporate Brand' with primary color #0066cc", or "Show me all ERROR level logs from the am-authentication source in the last hour".

## Features

- **Administer your AIC environment using natural language** - Interact with PingOne AIC from whichever AI tool you use daily. No need to switch to the admin console or write API scripts - just ask your AI assistant.

- **Secure authentication** - Supports OAuth 2.0 PKCE flow for local deployment and Device Code Flow for containerized deployment. All actions are user-based and auditable. Tokens stored securely in OS keychain (local) or ephemerally (Docker).

- **Broad tool support** - Supports full CRUD operations against any managed object type in your environment (users, roles, groups, organizations, and custom types), authentication theme management, advanced log querying, and environment variable configuration.

## Use Cases

- **Identity Operations** - "Find all users with admin in their username", "Create a new developer role", "Update the email for user xyz123"
- **Authentication Customization** - "Create a branded theme with our corporate colors", "Show me all themes in production", "Set the new theme as default"
- **Audit & Monitoring** - "Show me failed login attempts in the last hour", "Find all logs for transaction abc-123", "What log sources are available?"
- **Configuration Management** - "List all environment variables", "Create a new API key variable", "Update the database connection string"

## Getting Started

### Prerequisites

- **Node.js 18+**
- **PingOne Advanced Identity Cloud environment**
- **MCP-compatible client** (Claude Desktop, VS Code with Cline, Cursor, Zed, etc.)

### 1. Install

```bash
git clone https://github.com/your-org/pingone_AIC_MCP.git
cd pingone_AIC_MCP
npm install
npm run build
```

### 2. Configure Your MCP Client

The MCP server requires the `AIC_BASE_URL` environment variable to be set to your PingOne AIC hostname.

#### Claude Desktop

Add this to your Claude Desktop MCP configuration:

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

> **Note**: Use your PingOne AIC hostname without `https://` or path components.

#### VS Code (Cline Extension)

> **Note**: Configuration details to be added

#### Cursor

> **Note**: Configuration details to be added

#### Zed

> **Note**: Configuration details to be added

#### Other MCP Clients

For other MCP clients supporting STDIO transport:
- **Command**: `node`
- **Args**: `["/absolute/path/to/pingone_AIC_MCP/dist/index.js"]`
- **Environment**: `AIC_BASE_URL=your-tenant.forgeblocks.com`

### 3. Start Using

Restart your MCP client and start asking questions! Your browser will open for authentication when you use the first tool in a session.

## Authentication

The server uses **OAuth 2.0 PKCE flow** for secure user authentication:

1. **First Tool Use** - Browser opens automatically for user login at PingOne AIC when you use a tool for the first time in a session
2. **Token Storage** - Access tokens stored securely in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
3. **Automatic Reuse** - Cached tokens used for subsequent tool calls within the same session
4. **Auto Re-authentication** - When tokens expire during a session, browser opens again for new login

**Docker Deployment**: Uses OAuth 2.0 Device Code Flow with ephemeral token storage (tokens deleted on container restart).

**Security Features**:
- User-based actions provide complete audit trail
- All actions traceable to authenticated users for compliance

> [!CAUTION]
> **Administrator Access Required**: This server requires administrative authentication and provides administrative capabilities to your PingOne AIC development environment. All operations are performed as the authenticated administrator and are fully auditable.
>
> **Development Environments Only**: This server can only be used with development environments. Use with trusted AI assistants in secure contexts. AI-driven operations can make mistakes - review and test changes carefully before promoting to higher environments.

## Available Tools

The server provides tools for AI agents to interact with your PingOne AIC environment:

### Managed Objects

Generic CRUD operations for **any managed object type** in your environment.

| Tool | Description | Usage Examples |
|------|-------------|----------------|
| `listManagedObjects` | Discover all managed object types in your environment | - `What object types are available?` <br> - `List all managed objects` <br> - `Show me what types I can work with` |
| `getManagedObjectSchema` | Get schema definition for an object type | - `What fields are required for alpha_user?` <br> - `Show me the schema for bravo_role` <br> - `What properties does alpha_group have?` |
| `queryManagedObjects` | Query objects with filters, pagination, sorting | - `Find users with email @example.com` <br> - `List all roles sorted by name` <br> - `Show me the first 10 alpha_groups` |
| `getManagedObject` | Retrieve an object's complete profile | - `Get user xyz123` <br> - `Show me the details for role abc456` <br> - `Display the profile for alpha_user xyz` |
| `createManagedObject` | Create a new managed object | - `Create user jsmith` <br> - `Add a new admin role` <br> - `Create a bravo_group called Developers` |
| `patchManagedObject` | Update object fields | - `Update user xyz123 email to new@example.com` <br> - `Change role description` <br> - `Modify the alpha_group name` |
| `deleteManagedObject` | Delete an object | - `Delete user xyz123` <br> - `Remove role abc456` <br> - `Delete the test group` |

### Themes

Customize login and account page appearance.

| Tool | Description | Usage Examples |
|------|-------------|----------------|
| `getThemeSchema` | Get complete theme schema documentation | - `Show me available theme customizations` <br> - `What fields can I set on a theme?` <br> - `Display the theme configuration options` |
| `getThemes` | List all themes in a realm | - `Show themes in alpha realm` <br> - `List all available themes` <br> - `What themes exist in bravo?` |
| `getTheme` | Get a theme's complete configuration | - `Get the Corporate Brand theme` <br> - `Show me theme xyz123` <br> - `Display the Dark Mode theme settings` |
| `createTheme` | Create a new theme | - `Create theme called Dark Mode` <br> - `Add new theme with blue color scheme` <br> - `Create a Corporate Brand theme with our colors` |
| `updateTheme` | Update theme properties | - `Change Corporate Brand logo` <br> - `Update theme colors` <br> - `Modify the Dark Mode background color` |
| `deleteTheme` | Delete a theme | - `Delete Test Theme` <br> - `Remove theme xyz123` <br> - `Delete the old branding theme` |
| `setDefaultTheme` | Set a theme as the realm default | - `Set Corporate Brand as default` <br> - `Make Dark Mode the default theme` <br> - `Use the new theme as default for alpha` |

### Logging

Query and analyze authentication and activity logs.

| Tool | Description | Usage Examples |
|------|-------------|----------------|
| `getLogSources` | List available log sources | - `What log sources are available?` <br> - `Show me all log types` <br> - `Display available logging sources` |
| `queryLogs` | Query logs with time range, source, and content filters | - `Show ERROR logs from last 2 hours` <br> - `Find login failures for user jsmith` <br> - `Get logs for transaction xyz` |

### ESVs (Environment Secrets and Variables)

Manage environment secrets and variables.

| Tool | Description | Usage Examples |
|------|-------------|----------------|
| `queryESVs` | Query variables or secrets by ID pattern | - `List all environment variables` <br> - `Find variables starting with esv-prod` <br> - `Show me all secrets in the environment` |
| `getVariable` | Retrieve a variable with decoded value | - `Get esv-database-url` <br> - `Show me the API key variable` <br> - `Display the value of esv-config` |
| `setVariable` | Create or update a variable | - `Create variable esv-api-key` <br> - `Update esv-max-connections to 100` <br> - `Set esv-endpoint to https://api.example.com` |
| `deleteVariable` | Delete a variable | - `Delete esv-old-config` <br> - `Remove variable xyz` <br> - `Delete the deprecated esv-legacy-url` |

## Docker Deployment

> **⚠️ EXPERIMENTAL**: Docker deployment uses OAuth 2.0 Device Code Flow with MCP form elicitation. This requires MCP client support for form elicitation, which is currently limited. If your client doesn't support it, use the local deployment method above.

### Build Image

```bash
npm run docker:build
```

### Configure Your MCP Client

#### Claude Desktop

Add this to your Claude Desktop MCP configuration:

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

**Authentication**: When authentication is required, your MCP client should display a URL. Click it to authenticate in your browser, then accept the prompt in your client.

**Token Storage**: Tokens are stored ephemerally in the container filesystem (`/app/tokens/token.json`) and deleted on container restart for enhanced security.

## Security

The PingOne AIC MCP Server implements multiple security layers:

- **Secure credential storage** - Tokens stored in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) for local deployment, or ephemerally in container filesystem for Docker
- **No plain text secrets** - No sensitive information stored in configuration files
- **OAuth 2.0 authentication** - PKCE flow for local deployment prevents authorization code interception; Device Code flow for containerized deployment
- **User-based authentication** - All API calls are authenticated as the user who logged in, providing complete audit trails
- **Input validation** - Built-in protections against path traversal and query injection attacks
- **Tenant isolation** - Tokens are validated against the configured `AIC_BASE_URL` to prevent accidental cross-tenant operations

## Troubleshooting

### "FATAL: AIC_BASE_URL environment variable is not set"
Set the `AIC_BASE_URL` environment variable in your MCP client configuration to your PingOne AIC hostname (without `https://`).

### "Port 3000 is already in use"
Another service is using port 3000 (required for OAuth redirect). Stop that service and try again.

### "Browser doesn't open during authentication"
Check that the `open` package has permissions to launch your browser, or manually navigate to the URL shown in the error message.

### Docker: "URL not displayed during authentication"
Your MCP client may not support form elicitation yet. Use the local deployment method instead.

## Development

### Build

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Type check without building
npm run typecheck
```

### Testing

The project includes a comprehensive test suite covering all tools and authentication flows.

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

### MCP Inspector

Use the MCP Inspector to visually test tools in a web interface:

```bash
# Development mode (no build required - faster iteration)
AIC_BASE_URL=your-tenant.forgeblocks.com npm run dev:inspect

# Production mode (requires build first)
npm run build
AIC_BASE_URL=your-tenant.forgeblocks.com npm run inspect
```

Hosts a web interface for interactive tool testing and OAuth flow debugging.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Feedback & Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/your-org/pingone_AIC_MCP/issues).

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

*Built with the [Model Context Protocol](https://modelcontextprotocol.io/)*
