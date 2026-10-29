import { AsyncLocalStorage } from 'node:async_hooks';

export interface EnvironmentConfig {
  name: string;
  baseUrl: string;
}

const environmentStorage = new AsyncLocalStorage<string>();

function normalizeBaseUrl(value: string): string {
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function loadEnvironmentConfigs(): Map<string, EnvironmentConfig> {
  const configured = process.env.AIC_TENANTS;

  if (configured) {
    const parsed = JSON.parse(configured) as Record<string, string>;
    const entries = Object.entries(parsed);

    if (entries.length === 0) {
      throw new Error('AIC_TENANTS must define at least one environment.');
    }

    const configuredOrder = (process.env.AIC_ORDER_OF_TENANTS || '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);

    entries.sort(([left], [right]) => {
      const leftIndex = configuredOrder.indexOf(left.toLowerCase());
      const rightIndex = configuredOrder.indexOf(right.toLowerCase());
      const normalizedLeftIndex = leftIndex === -1 ? configuredOrder.length : leftIndex;
      const normalizedRightIndex = rightIndex === -1 ? configuredOrder.length : rightIndex;

      return normalizedLeftIndex - normalizedRightIndex;
    });

    return new Map(entries.map(([name, baseUrl]) => [name, { name, baseUrl: normalizeBaseUrl(baseUrl) }]));
  }

  if (!process.env.AIC_BASE_URL) {
    throw new Error('AIC_BASE_URL or AIC_TENANTS must be configured.');
  }

  return new Map([
    [
      'default',
      {
        name: 'default',
        baseUrl: normalizeBaseUrl(process.env.AIC_BASE_URL)
      }
    ]
  ]);
}

const environments = loadEnvironmentConfigs();

export function getEnvironmentNames(): string[] {
  return [...environments.keys()];
}

export function getEnvironment(name?: string): EnvironmentConfig {
  const selectedName = name ?? environmentStorage.getStore() ?? getEnvironmentNames()[0];
  const environment = environments.get(selectedName);

  if (!environment) {
    throw new Error(`Unknown PingOne AIC environment: ${selectedName}`);
  }

  return environment;
}

export function runWithEnvironment<T>(name: string | undefined, callback: () => Promise<T>): Promise<T> {
  return environmentStorage.run(getEnvironment(name).name, callback);
}

export function getCurrentEnvironmentName(): string {
  return getEnvironment().name;
}
