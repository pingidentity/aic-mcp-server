import { describe, it, expect } from 'vitest';
import { queryESVsTool } from '../../../src/tools/esv/queryESVs.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('queryESVs', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('queryESVs', queryESVsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    const setupSecretsEndpoint = () =>
      server.use(
        http.get('https://*/environment/secrets', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }
          return HttpResponse.json({
            result: [],
            resultCount: 0,
            totalPagedResults: 0
          });
        })
      );

    const requestCases = [
      {
        name: 'routes variable type to variables endpoint',
        input: { type: 'variable' },
        assert: ({ url }: any) => expect(url).toContain('environment/variables')
      },
      {
        name: 'routes secret type to secrets endpoint',
        input: { type: 'secret' },
        setup: setupSecretsEndpoint,
        assert: ({ url }: any) => expect(url).toContain('environment/secrets')
      },
      {
        name: 'adds queryFilter with queryTerm',
        input: { type: 'variable', queryTerm: 'api-key' },
        assert: ({ url }: any) => expect(url).toContain('_queryFilter=%2F_id+co+%22api-key%22')
      },
      {
        name: 'defaults queryFilter to true when omitted',
        input: { type: 'variable' },
        assert: ({ url }: any) => expect(url).toContain('_queryFilter=true')
      },
      {
        name: 'escapes double quotes in queryTerm',
        input: { type: 'variable', queryTerm: 'test\"injection' },
        assert: ({ url }: any) => expect(url).toContain('_queryFilter=%2F_id+co+%22test%5C%22injection%22')
      },
      {
        name: 'applies provided pageSize',
        input: { type: 'variable', pageSize: 25 },
        assert: ({ url }: any) => expect(url).toContain('_pageSize=25')
      },
      {
        name: 'defaults pageSize to 50',
        input: { type: 'variable' },
        assert: ({ url }: any) => expect(url).toContain('_pageSize=50')
      },
      {
        name: 'clamps pageSize to maximum 100',
        input: { type: 'variable', pageSize: 150 },
        assert: ({ url }: any) => expect(url).toContain('_pageSize=100')
      },
      {
        name: 'adds pagedResultsCookie when provided',
        input: { type: 'variable', pagedResultsCookie: 'cookie-abc' },
        assert: ({ url }: any) => expect(url).toContain('_pagedResultsCookie=cookie-abc')
      },
      {
        name: 'adds sortKeys when provided',
        input: { type: 'variable', sortKeys: '_id,-lastChangeDate' },
        assert: ({ url }: any) => expect(url).toContain('_sortKeys=_id%2C-lastChangeDate')
      },
      {
        name: 'adds accept-api-version header',
        input: { type: 'variable' },
        assert: ({ options }: any) =>
          expect(options).toEqual(
            expect.objectContaining({
              headers: expect.objectContaining({ 'accept-api-version': 'resource=2.0' })
            })
          )
      },
      {
        name: 'passes correct scopes to auth',
        input: { type: 'variable' },
        assert: ({ scopes }: any) => expect(scopes).toEqual(['fr:idc:esv:read'])
      }
    ];

    it.each(requestCases)('$name', async ({ input, setup, assert }) => {
      setup?.();

      await queryESVsTool.toolFunction(input as any);

      const [url, scopes, options] = getSpy().mock.calls.at(-1)!;
      assert({ url, scopes, options });
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it.each([
      {
        name: 'should format successful response',
        setup: undefined,
        input: { type: 'variable' },
        assert: (response: any) => {
          expect(response).toHaveProperty('result');
          expect(Array.isArray(response.result)).toBe(true);
        }
      },
      {
        name: 'should handle empty results',
        setup: () => {
          server.use(
            http.get('https://*/environment/variables', ({ request }) => {
              const authHeader = request.headers.get('Authorization');
              if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
              }
              return HttpResponse.json({
                result: [],
                resultCount: 0,
                totalPagedResults: 0
              });
            })
          );
        },
        input: { type: 'variable', queryTerm: 'nonexistent' },
        assert: (response: any) => {
          expect(response.result).toEqual([]);
          expect(response.resultCount).toBe(0);
        }
      }
    ])('$name', async ({ input, setup, assert }) => {
      setup?.();

      const result = await queryESVsTool.toolFunction(input as any);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      assert(response);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept both valid type enum values', () => {
      const schema = queryESVsTool.inputSchema.type;
      expect(() => schema.parse('variable')).not.toThrow();
      expect(() => schema.parse('secret')).not.toThrow();
    });

    it.each([
      {
        name: 'rejects invalid type enum',
        schema: queryESVsTool.inputSchema.type,
        value: 'invalid'
      },
      {
        name: 'rejects queryTerm exceeding max length',
        schema: queryESVsTool.inputSchema.queryTerm,
        value: 'a'.repeat(101)
      },
      {
        name: 'rejects sortKeys exceeding max length',
        schema: queryESVsTool.inputSchema.sortKeys,
        value: 'a'.repeat(201)
      }
    ])('$name', ({ schema, value }) => {
      expect(() => schema.parse(value)).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      {
        name: 'should handle 401 Unauthorized error',
        handler: () =>
          new HttpResponse(JSON.stringify({ error: 'unauthorized', message: 'Invalid credentials' }), { status: 401 }),
        expected: '401'
      },
      {
        name: 'should handle 500 Internal Server Error',
        handler: () =>
          new HttpResponse(JSON.stringify({ error: 'internal_error', message: 'Server error' }), { status: 500 }),
        expected: '500'
      }
    ])('$name', async ({ handler, expected }) => {
      server.use(http.get('https://*/environment/variables', handler));

      const result = await queryESVsTool.toolFunction({
        type: 'variable'
      });

      expect(result.content[0].text).toContain('Failed to query environment variables');
      expect(result.content[0].text).toContain(expected);
    });
  });
});
