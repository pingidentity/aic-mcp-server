import { describe, it, expect, afterEach, vi } from 'vitest';

async function loadEnvironmentContext(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value as string);
  }
  return import('../../src/services/environmentContext.js');
}

describe('environmentContext', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('single tenant', () => {
    it('uses AIC_BASE_URL as the only environment, named default', async () => {
      const context = await loadEnvironmentContext({ AIC_TENANTS: undefined, AIC_BASE_URL: 'single.example.com' });

      expect(context.getEnvironmentNames()).toEqual(['default']);
      expect(context.getEnvironment()).toEqual({ name: 'default', baseUrl: 'single.example.com' });
    });

    it('throws when neither AIC_BASE_URL nor AIC_TENANTS is configured', async () => {
      await expect(loadEnvironmentContext({ AIC_TENANTS: undefined, AIC_BASE_URL: undefined })).rejects.toThrow(
        'AIC_BASE_URL or AIC_TENANTS must be configured.'
      );
    });
  });

  describe('multiple tenants', () => {
    it('normalizes hostnames and orders environments by AIC_ORDER_OF_TENANTS', async () => {
      const context = await loadEnvironmentContext({
        AIC_TENANTS: JSON.stringify({
          prod: 'https://prod.example.com/',
          dev: 'dev.example.com',
          sandbox: 'http://sandbox.example.com'
        }),
        AIC_ORDER_OF_TENANTS: 'sandbox, DEV ,prod'
      });

      expect(context.getEnvironmentNames()).toEqual(['sandbox', 'dev', 'prod']);
      expect(context.getEnvironment('prod').baseUrl).toBe('prod.example.com');
      expect(context.getEnvironment('sandbox').baseUrl).toBe('sandbox.example.com');
    });

    it('places environments missing from AIC_ORDER_OF_TENANTS after the ordered ones', async () => {
      const context = await loadEnvironmentContext({
        AIC_TENANTS: JSON.stringify({ extra: 'extra.example.com', dev: 'dev.example.com' }),
        AIC_ORDER_OF_TENANTS: 'dev'
      });

      expect(context.getEnvironmentNames()).toEqual(['dev', 'extra']);
    });

    it('defaults to the first ordered environment outside a tool call', async () => {
      const context = await loadEnvironmentContext({
        AIC_TENANTS: JSON.stringify({ prod: 'prod.example.com', dev: 'dev.example.com' }),
        AIC_ORDER_OF_TENANTS: 'dev,prod'
      });

      expect(context.getCurrentEnvironmentName()).toBe('dev');
    });

    it('scopes the current environment to the callback passed to runWithEnvironment', async () => {
      const context = await loadEnvironmentContext({
        AIC_TENANTS: JSON.stringify({ dev: 'dev.example.com', prod: 'prod.example.com' }),
        AIC_ORDER_OF_TENANTS: 'dev,prod'
      });

      const inside = await context.runWithEnvironment('prod', async () => {
        await Promise.resolve();
        return context.getEnvironment().baseUrl;
      });

      expect(inside).toBe('prod.example.com');
      expect(context.getCurrentEnvironmentName()).toBe('dev');
    });

    it('keeps concurrent tool calls isolated to their own environment', async () => {
      const context = await loadEnvironmentContext({
        AIC_TENANTS: JSON.stringify({ dev: 'dev.example.com', prod: 'prod.example.com' })
      });
      const observe = (name: string) =>
        context.runWithEnvironment(name, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return context.getEnvironment().name;
        });

      await expect(Promise.all([observe('prod'), observe('dev'), observe('prod')])).resolves.toEqual([
        'prod',
        'dev',
        'prod'
      ]);
    });

    it('rejects an unknown environment name', async () => {
      const context = await loadEnvironmentContext({ AIC_TENANTS: JSON.stringify({ dev: 'dev.example.com' }) });

      expect(() => context.getEnvironment('staging')).toThrow('Unknown PingOne AIC environment: staging');
    });

    it('rejects an empty AIC_TENANTS object', async () => {
      await expect(loadEnvironmentContext({ AIC_TENANTS: '{}' })).rejects.toThrow(
        'AIC_TENANTS must define at least one environment.'
      );
    });
  });
});
