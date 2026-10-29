/**
 * Initialization module that validates and normalizes environment variables.
 * Must be imported before other application modules to ensure consistent configuration.
 */

import { normalizeAicBaseUrl } from './utils/urlHelpers.js';

// Validate required environment configuration
const tenantVariables = Object.entries(process.env)
  .filter(([name, value]) => name.startsWith('AIC_TENANT_') && value)
  .map(([name, value]) => [name.slice('AIC_TENANT_'.length).toLowerCase(), value as string]);

if (!process.env.AIC_BASE_URL && !process.env.AIC_TENANTS && tenantVariables.length === 0) {
  console.error('FATAL: AIC_BASE_URL, AIC_TENANTS, or AIC_TENANT_* environment variables are not set.');
  process.exit(1);
}

if (!process.env.AIC_TENANTS && tenantVariables.length > 0) {
  process.env.AIC_TENANTS = JSON.stringify(Object.fromEntries(tenantVariables));
}

if (process.env.AIC_BASE_URL) {
  // Normalize AIC_BASE_URL (removes protocol, path, port - keeps hostname only)
  process.env.AIC_BASE_URL = normalizeAicBaseUrl(process.env.AIC_BASE_URL);
}

if (process.env.AIC_TENANTS) {
  try {
    const tenants = JSON.parse(process.env.AIC_TENANTS) as Record<string, string>;
    const normalizedTenants = Object.fromEntries(
      Object.entries(tenants).map(([name, baseUrl]) => [name, normalizeAicBaseUrl(baseUrl)])
    );
    process.env.AIC_TENANTS = JSON.stringify(normalizedTenants);

    // Keep legacy module-level URL construction valid for tools that are routed
    // through apiHelpers after their URL is created.
    if (!process.env.AIC_BASE_URL) {
      process.env.AIC_BASE_URL = Object.values(normalizedTenants)[0];
    }
  } catch {
    console.error('FATAL: AIC_TENANTS must be a JSON object mapping environment names to hostnames.');
    process.exit(1);
  }
}
