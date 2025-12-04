// src/utils/responseHelpers.ts

/**
 * API response structure from PingOne AIC monitoring logs endpoint
 * Used by both queryLogs and queryAICLogsByTransactionId tools
 */
export interface MonitoringLogsApiResponse {
  pagedResultsCookie: string | null;
  remainingPagedResults: number;
  result: unknown[]; // Array of log entries
  resultCount: number;
  totalPagedResults: number;
  totalPagedResultsPolicy: string;
}

/**
 * Formats a successful response with optional transaction ID
 * @param data - The response data to format (will be JSON.stringified if not a string)
 * @param response - The fetch Response object containing headers
 * @returns Formatted string with data and transaction ID if available
 */
export function formatSuccess(data: unknown, response: Response): string {
  const transactionId = response.headers.get('x-forgerock-transactionid');
  let result = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  if (transactionId) {
    result += `\n\nTransaction ID: ${transactionId}`;
  }

  return result;
}

/**
 * Formats an error with response details and optional transaction ID
 * In production, sanitizes error body to prevent information leakage
 * @param response - The fetch Response object containing status and headers
 * @param errorBody - The error response body text
 * @param operation - Optional operation name to prefix the error message (e.g., "Failed to fetch users")
 * @returns Formatted error string with status, body, and transaction ID if available
 */
export function formatError(response: Response, errorBody: string, operation?: string): string {
  const transactionId = response.headers.get('x-forgerock-transactionid');
  const prefix = operation ? `${operation}: ` : '';

  // Sanitize error body in production
  let displayError: string;
  if (process.env.NODE_ENV === 'production') {
    // Generic message + status code, no details
    displayError = `Request failed with status ${response.status}`;
  } else {
    // Full details in development
    displayError = `${response.status} ${response.statusText} - ${errorBody}`;
  }

  let result = `${prefix}${displayError}`;

  // Always include transaction ID (not sensitive)
  if (transactionId) {
    result += `\n\nTransaction ID: ${transactionId}`;
  }

  return result;
}
