/**
 * Normalizes an AIC base URL by extracting just the hostname
 * Removes protocol, port, paths, query params, and fragments
 * @param url - The URL to normalize (may include protocol, path, etc.)
 * @returns The normalized hostname only
 * @example
 * normalizeAicBaseUrl('https://tenant.forgeblocks.com') // 'tenant.forgeblocks.com'
 * normalizeAicBaseUrl('tenant.forgeblocks.com/admin') // 'tenant.forgeblocks.com'
 * normalizeAicBaseUrl('tenant.forgeblocks.com:8080') // 'tenant.forgeblocks.com'
 */
export function normalizeAicBaseUrl(url: string): string {
  let normalized = url.trim();

  // Remove http:// or https:// prefix
  normalized = normalized.replace(/^https?:\/\//, '');

  // Remove everything after first occurrence of /, ?, or # (paths, query params, fragments)
  normalized = normalized.replace(/[/?#].*$/, '');

  // Remove port number (everything after and including the first colon)
  normalized = normalized.replace(/:.*$/, '');

  return normalized;
}
