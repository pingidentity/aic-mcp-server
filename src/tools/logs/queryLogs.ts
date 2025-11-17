// src/tools/queryLogs.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess, MonitoringLogsApiResponse } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:monitoring:*'];

export const queryLogsTool = {
  name: 'queryLogs',
  title: 'Query AIC Logs',
  description:
    'Query PingOne AIC logs with flexible filtering by time range, source, transaction ID, and payload content. ' +
    'Supports complex queries with _queryFilter expressions. ' +
    'Rate limit: 60 requests/min, max 1000 logs per request. Logs stored for 30 days.',
  scopes: SCOPES,
  inputSchema: {
    sources: z.array(z.string())
      .describe("Log sources to query (e.g., ['am-authentication', 'idm-activity']). Available sources can be retrieved using the getLogSources tool."),
    beginTime: z.string().optional()
      .describe("Start time in ISO 8601 format without milliseconds (e.g., '2025-01-11T10:00:00Z'). Filters logs after this time. Defaults to 24 hours before endTime if omitted. Must be within 24 hours of endTime."),
    endTime: z.string().optional()
      .describe("End time in ISO 8601 format without milliseconds (e.g., '2025-01-11T12:00:00Z'). Filters logs before this time. Defaults to current time if omitted. Must be within 24 hours of beginTime."),
    transactionId: z.string().optional()
      .describe("Filter by specific transaction ID to trace a request across the system."),
    queryFilter: z.string().optional()
      .describe(
        "_queryFilter expression for payload content. " +
        "Filter operators: eq (equals), co (contains), sw (starts with), lt (less than), le (less/equal), gt (greater than), ge (greater/equal), pr (present), ! (NOT). " +
        "Boolean operators: and, or. String values must be quoted with double quotes. " +
        "Example filters: /payload/level eq \"ERROR\" OR /payload/eventName eq \"AM-LOGIN-COMPLETED\" OR " +
        "/payload/result eq \"SUCCESSFUL\" OR /payload/client/ip co \"10.104.1.5\" OR /payload/principal co \"bob\" OR " +
        "/payload/response.statusCode ge 400 OR /payload/http.method eq \"POST\" OR " +
        "/payload/timestamp sw \"2023-05-14T16:34:34\" OR /payload/entries/info/nodeType pr OR " +
        "/payload/client/ip co \"10.x\" and /payload/level eq \"ERROR\" OR !(/payload/level eq \"DEBUG\")"
      ),
    pagedResultsCookie: z.string().optional()
      .describe("Opaque pagination cookie from a previous response. Use this to retrieve the next page of results."),
    pageSize: z.number().int().min(1).max(1000).optional()
      .describe("Maximum logs to return (max 1000, default 100). Use smaller values for faster responses."),
  },
  async toolFunction({
    sources,
    beginTime,
    endTime,
    transactionId,
    queryFilter,
    pagedResultsCookie,
    pageSize
  }: {
    sources?: string[];
    beginTime?: string;
    endTime?: string;
    transactionId?: string;
    queryFilter?: string;
    pagedResultsCookie?: string;
    pageSize?: number;
  }) {
    // Build query URL with parameters using URL object for better readability
    const url = new URL(`https://${aicBaseUrl}/monitoring/logs`);

    if (sources && sources.length > 0) {
      url.searchParams.append('source', sources.join(','));
    }

    if (beginTime) {
      url.searchParams.append('beginTime', beginTime);
    }

    if (endTime) {
      url.searchParams.append('endTime', endTime);
    }

    if (transactionId) {
      url.searchParams.append('transactionId', transactionId);
    }

    if (queryFilter) {
      url.searchParams.append('_queryFilter', queryFilter);
    }

    if (pagedResultsCookie) {
      url.searchParams.append('_pagedResultsCookie', pagedResultsCookie);
    }

    if (pageSize) {
      url.searchParams.append('_pageSize', pageSize.toString());
    }

    try {
      const { data, response } = await makeAuthenticatedRequest(url.toString(), SCOPES);

      const logs = data as MonitoringLogsApiResponse;
      return createToolResponse(formatSuccess(logs, response));
    } catch (error: any) {
      return createToolResponse(`Error querying logs: ${error.message}`);
    }
  }
};
