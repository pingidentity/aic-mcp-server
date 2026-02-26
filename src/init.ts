/**
 * Initialization module that validates and normalizes environment variables.
 * Must be imported before other application modules to ensure consistent configuration.
 */

import { normalizeAicBaseUrl } from './utils/urlHelpers.js';

// Validate required environment variable
if (!process.env.AIC_BASE_URL) {
  console.error('FATAL: AIC_BASE_URL environment variable is not set.');
  process.exit(1);
}

// Normalize AIC_BASE_URL (removes protocol, path, port - keeps hostname only)
process.env.AIC_BASE_URL = normalizeAicBaseUrl(process.env.AIC_BASE_URL);
