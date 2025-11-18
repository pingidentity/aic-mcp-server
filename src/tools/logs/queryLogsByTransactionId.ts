// src/tools/queryLogsByTransactionId.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess, MonitoringLogsApiResponse } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:monitoring:*'];

export const queryLogsByTransactionIdTool = {
  name: 'queryLogsByTransactionId',
  title: 'Query Logs by Transaction ID',
  description: 'Query am-everything and idm-everything logs in PingOne AIC by transaction ID',
  scopes: SCOPES,
  inputSchema: {
    transactionId: z.string().describe("The transaction ID to query the logs for."),
  },
  async toolFunction({ transactionId }: { transactionId: string; }) {
    const url = `https://${aicBaseUrl}/monitoring/logs?source=am-everything,idm-everything&transactionId=${transactionId}`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);
      const logs = data as MonitoringLogsApiResponse;
      return createToolResponse(formatSuccess(logs, response));
    } catch (error: any) {
      return createToolResponse(`Failed to query logs by transaction ID: ${error.message}`);
    }
  }
};
