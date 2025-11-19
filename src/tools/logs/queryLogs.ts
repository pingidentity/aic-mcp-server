// src/tools/queryLogs.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess, MonitoringLogsApiResponse } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:monitoring:*'];

export const queryLogsTool = {
  name: 'queryLogs',
  title: 'Query Logs',
  description: 'Query PingOne AIC logs with flexible filtering by time range, source, transaction ID, and payload content',
  scopes: SCOPES,
  inputSchema: {
    sources: z.array(z.string())
      .describe("Log sources to query (e.g., ['am-authentication', 'idm-activity']). IMPORTANT: use the getLogSources tool to determine available sources."),
    beginTime: z.string().optional()
      .describe("Start time in ISO 8601 format without milliseconds (e.g., '2025-01-11T10:00:00Z'). Filters logs after this time. Defaults to 24 hours before endTime if omitted. Must be within 24 hours of endTime."),
    endTime: z.string().optional()
      .describe("End time in ISO 8601 format without milliseconds (e.g., '2025-01-11T12:00:00Z'). Filters logs before this time. Defaults to current time if omitted. Must be within 24 hours of beginTime."),
    transactionId: z.string().optional()
      .describe("Filter by specific transaction ID to trace a request across the system."),
    queryFilter: z.string().max(2000).optional()
      .describe(
        'CRITICAL: All field paths MUST start with / (e.g., /payload/level, /payload/principal). Missing the leading slash causes 500 Internal Server Error.\n\n' +
        'Operators: eq, co, sw, lt, le, gt, ge, pr (present), ! (NOT). Boolean: and, or. Quote string values.\n' +
        'Time filtering: Use beginTime/endTime parameters for time ranges. Use /payload/timestamp only for exact timestamp matches.\n\n' +
        'Examples:\n' +
        '  /payload/level eq "ERROR"\n' +
        '  /payload/principal co "admin"\n' +
        '  /payload/eventName eq "AM-LOGIN-COMPLETED"\n' +
        '  (/payload/level eq "ERROR") and (/payload/http/request/path co "openidm")\n' +
        '  /payload/response.statusCode ge 400\n\n' +
        'Troubleshooting: If you receive a 500 error, verify all field paths begin with /'
      ),
    pagedResultsCookie: z.string().optional()
      .describe("Opaque pagination cookie from a previous response. Use this to retrieve the next page of results."),
    pageSize: z.number().int().min(1).max(1000).optional()
      .describe("Maximum logs to return (default 100)."),
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

    // Page size - default to 100, max 1000
    const effectivePageSize = Math.min(pageSize || 100, 1000);
    url.searchParams.append('_pageSize', effectivePageSize.toString());

    try {
      const { data, response } = await makeAuthenticatedRequest(url.toString(), SCOPES);

      const logs = data as MonitoringLogsApiResponse;
      return createToolResponse(formatSuccess(logs, response));
    } catch (error: any) {
      return createToolResponse(`Failed to query logs: ${error.message}`);
    }
  }
};
