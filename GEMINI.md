# Gemini Project: PingOne AIC MCP Server

This document provides an overview of the PingOne AIC MCP Server, a simple STDIO TypeScript-based server designed to integrate with AI agents that support the Model-Context Protocol (MCP).

## Project Overview

The purpose of this server is to expose tools that allow an AI agent to interact with a PingOne Advanced Identity Cloud (AIC) environment. It is designed to be lightweight, extensible, and configurable.

### Key Technologies

*   **Language:** TypeScript
*   **Core Dependencies:**
    *   `@modelcontextprotocol/sdk`: For creating the MCP server.
    *   `zod`: For schema validation of tool inputs.
    *   `keytar`: For securely storing authentication tokens in the system keychain.
    *   `open`: To open the user's browser for OAuth authentication.
*   **Runtime:** Node.js

## Core Functionality

1.  **MCP Server:** The server, initialized in `src/index.ts`, uses the standard I/O transport to communicate with a compatible AI agent.

2.  **Authentication Service:** The `src/services/authService.ts` handles the complete OAuth 2.0 PKCE authentication flow to acquire a valid access token from the PingOne environment. It securely stores the token in the system keychain to persist it between sessions and automatically handles the login flow via the system's default browser when a valid token is not found.

3.  **`getUsers` Tool:** The server's primary tool, `getUsers` (defined in `src/tools/getUsers.ts`), allows the AI agent to query the IDM user API in a PingOne environment. It takes a `realm` and a `queryTerm` as input and returns a list of matching users.

## Setup and Configuration

*   **Environment Variable:** Before running the server, the `AIC_BASE_URL` environment variable must be set to the correct hostname for the target PingOne environment (e.g., `openam-ashw-hlx0930.forgeblocks.com`). The server will exit on startup if this variable is not set.
*   **Installation:** Run `npm install` to install dependencies.
*   **Running:** The server can be built with `npm run build` and started with `npm start`.