import { describe, it, expect } from 'vitest';
import { getOidcAppSchemaTool } from '../../../src/tools/applications/getOidcAppSchema.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

const mockAmSchema = {
  type: 'object',
  properties: {
    coreOAuth2ClientConfig: {
      type: 'object',
      title: 'Core',
      propertyOrder: 0,
      properties: {
        redirectionUris: {
          title: 'Redirect URIs',
          description: 'Long description about redirect URIs...',
          propertyOrder: 1,
          type: 'object',
          exampleValue: '',
          properties: {
            inherited: { type: 'boolean', required: true },
            value: { type: 'array', required: false }
          }
        },
        status: {
          title: 'Status',
          description: 'Whether the client is active...',
          propertyOrder: 2,
          type: 'object',
          exampleValue: '',
          properties: {
            inherited: { type: 'boolean', required: true },
            value: { type: 'string', required: true, enum: ['Active', 'Inactive'] }
          }
        }
      }
    },
    advancedOAuth2ClientConfig: {
      type: 'object',
      title: 'Advanced',
      propertyOrder: 1,
      properties: {
        grantTypes: {
          title: 'Grant Types',
          description: 'Long description about grant types...',
          propertyOrder: 0,
          type: 'object',
          exampleValue: '',
          properties: {
            inherited: { type: 'boolean', required: true },
            value: { type: 'array', required: false }
          }
        }
      }
    }
  }
};

const mockIdmConfig = {
  objects: [
    {
      name: 'alpha_application',
      schema: {
        properties: {
          name: { type: 'string', title: 'Name' },
          owners: { type: 'array', title: 'Owners' },
          ssoEntities: { type: 'object', title: 'SSO Entities' }
        },
        required: ['name']
      }
    }
  ]
};

function useSchemaHandlers(amSchema = mockAmSchema, idmConfig = mockIdmConfig) {
  server.use(
    http.post('https://*/am/json/alpha/realm-config/agents/OAuth2Client', () => {
      return HttpResponse.json(amSchema);
    }),
    http.get('https://*/openidm/config/managed', () => {
      return HttpResponse.json(idmConfig);
    })
  );
}

describe('getOidcAppSchema', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getOidcAppSchema', getOidcAppSchemaTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should call AM schema endpoint with POST', async () => {
      useSchemaHandlers();

      await getOidcAppSchemaTool.toolFunction({ realm: 'alpha', summary: false });

      const calls = getSpy().mock.calls;
      const amCall = calls.find(([url]) => url.includes('realm-config/agents/OAuth2Client'));
      expect(amCall).toBeDefined();
      expect(amCall![0]).toContain('_action=schema');
      expect(amCall![2]?.method).toBe('POST');
    });

    it('should call AM template endpoint when includeDefaults is true and summary is false', async () => {
      useSchemaHandlers();

      await getOidcAppSchemaTool.toolFunction({ realm: 'alpha', summary: false, includeDefaults: true });

      const calls = getSpy().mock.calls;
      const templateCall = calls.find(([url]) => url.includes('_action=template'));
      expect(templateCall).toBeDefined();
    });

    it('should not call AM template endpoint when includeDefaults is false', async () => {
      useSchemaHandlers();

      await getOidcAppSchemaTool.toolFunction({ realm: 'alpha', summary: false, includeDefaults: false });

      const calls = getSpy().mock.calls;
      const templateCall = calls.find(([url]) => url.includes('_action=template'));
      expect(templateCall).toBeUndefined();
    });

    it('should skip template fetch when summary is true even if includeDefaults is true', async () => {
      useSchemaHandlers();

      await getOidcAppSchemaTool.toolFunction({ realm: 'alpha', summary: true, includeDefaults: true });

      const calls = getSpy().mock.calls;
      const templateCall = calls.find(([url]) => url.includes('_action=template'));
      expect(templateCall).toBeUndefined();
    });

    it('should pass correct scopes', async () => {
      useSchemaHandlers();

      await getOidcAppSchemaTool.toolFunction({ realm: 'alpha', summary: false });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:am:*', 'fr:idm:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return summary by default', async () => {
      useSchemaHandlers();

      const result = await getOidcAppSchemaTool.toolFunction({ realm: 'alpha' });
      const parsed = JSON.parse(result.content[0].text);

      const core = parsed.oauth2Client.schema.coreOAuth2ClientConfig;
      expect(core.redirectionUris).toEqual({ title: 'Redirect URIs', type: 'array' });
      expect(core.status).toEqual({ title: 'Status', type: 'string', enum: ['Active', 'Inactive'] });

      expect(core.redirectionUris.description).toBeUndefined();
      expect(core.redirectionUris.propertyOrder).toBeUndefined();
      expect(core.redirectionUris.exampleValue).toBeUndefined();
      expect(core.redirectionUris.properties).toBeUndefined();
    });

    it('should extract enum values in summary mode', async () => {
      useSchemaHandlers();

      const result = await getOidcAppSchemaTool.toolFunction({ realm: 'alpha' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.oauth2Client.schema.coreOAuth2ClientConfig.status.enum).toEqual(['Active', 'Inactive']);
      expect(parsed.oauth2Client.schema.coreOAuth2ClientConfig.redirectionUris.enum).toBeUndefined();
    });

    it('should summarize IDM schema by default', async () => {
      useSchemaHandlers();

      const result = await getOidcAppSchemaTool.toolFunction({ realm: 'alpha' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.managedApplication.schema.name).toEqual({ type: 'string', required: true });
      expect(parsed.managedApplication.schema.owners).toEqual({ type: 'array', required: false });
    });

    it('should return full schema when summary is false', async () => {
      useSchemaHandlers();

      const result = await getOidcAppSchemaTool.toolFunction({ realm: 'alpha', summary: false });
      const parsed = JSON.parse(result.content[0].text);

      const uris = parsed.oauth2Client.schema.properties.coreOAuth2ClientConfig.properties.redirectionUris;
      expect(uris.description).toBe('Long description about redirect URIs...');
      expect(uris.propertyOrder).toBe(1);
      expect(uris.properties.inherited).toBeDefined();
      expect(uris.properties.value).toBeDefined();
    });

    it('should filter to requested sections when summary is false', async () => {
      useSchemaHandlers();

      const result = await getOidcAppSchemaTool.toolFunction({
        realm: 'alpha',
        summary: false,
        sections: ['coreOAuth2ClientConfig']
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.oauth2Client.schema.properties.coreOAuth2ClientConfig).toBeDefined();
      expect(parsed.oauth2Client.schema.properties.advancedOAuth2ClientConfig).toBeUndefined();
    });

    it('should return empty properties when sections match nothing', async () => {
      useSchemaHandlers();

      const result = await getOidcAppSchemaTool.toolFunction({
        realm: 'alpha',
        summary: false,
        sections: ['nonExistentSection']
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(Object.keys(parsed.oauth2Client.schema.properties)).toHaveLength(0);
    });

    it('should omit ssoEntities from IDM schema in summary mode', async () => {
      useSchemaHandlers();

      const result = await getOidcAppSchemaTool.toolFunction({ realm: 'alpha' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.managedApplication.schema.ssoEntities).toBeUndefined();
      expect(parsed.managedApplication.schema.name).toBeDefined();
    });

    it('should omit ssoEntities from IDM schema in full mode', async () => {
      useSchemaHandlers();

      const result = await getOidcAppSchemaTool.toolFunction({ realm: 'alpha', summary: false });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.managedApplication.schema.properties.ssoEntities).toBeUndefined();
      expect(parsed.managedApplication.schema.properties.name).toBeDefined();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept valid realm values', () => {
      const schema = getOidcAppSchemaTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should reject invalid realm values', () => {
      const schema = getOidcAppSchemaTool.inputSchema.realm;
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('should default summary to true', () => {
      const schema = getOidcAppSchemaTool.inputSchema.summary;
      expect(schema.parse(undefined)).toBe(true);
    });

    it('should accept sections as array of strings', () => {
      const schema = getOidcAppSchemaTool.inputSchema.sections;
      expect(() => schema.parse(['coreOAuth2ClientConfig'])).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle AM API errors', async () => {
      server.use(
        http.post('https://*/am/json/alpha/realm-config/agents/OAuth2Client', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        }),
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({ objects: [] });
        })
      );

      const result = await getOidcAppSchemaTool.toolFunction({ realm: 'alpha', summary: false });
      expect(result.content[0].text).toContain('Failed to get OIDC app schema');
    });
  });
});
