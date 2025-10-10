// src/tools/queryAICLogsByTransactionId.ts
import { z } from 'zod';
import { authService } from '../services/authService.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:monitoring:*'];

export const queryAICLogsByTransactionIdTool = {
  name: 'queryAICLogsByTransactionId',
  title: 'Query AIC Logs by Transaction ID',
  description: 'Query am-authentication logs in a Ping Advanced Identity Cloud environment by transaction ID.',
  scopes: SCOPES,
  inputSchema: {
    transactionId: z.string().describe("The transaction ID to query the logs for."),
  },
  async toolFunction({ transactionId }: { transactionId: string; }) {
    const url = `https://${aicBaseUrl}/monitoring/logs?source=am-authentication&transactionId=${transactionId}`;

    try {
      const token = await authService.getToken(SCOPES);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to fetch logs: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const logs = await response.json();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(logs, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error processing your request: ${error.message}`
        }]
      };
    }
  }
};
