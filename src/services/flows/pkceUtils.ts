import * as crypto from 'crypto';

/**
 * Generate PKCE verifier and SHA256-based challenge
 */
export function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
