import { server } from '../setup.js';
import { http, HttpResponse } from 'msw';

interface RealmConfig {
  realm: Record<string, any[]>;
}

/**
 * Builds a standard realm configuration object for tests.
 */
export function buildRealmConfig(realms: Record<string, any[]>): RealmConfig {
  return { realm: realms };
}

/**
 * Registers MSW handlers for GET/PUT of themerealm config.
 */
export function mockThemeConfigHandlers(config: RealmConfig, onPut?: (body: any) => void) {
  server.use(
    http.get('https://*/openidm/config/ui/themerealm', () => {
      return HttpResponse.json(config);
    }),
    http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
      const body = await request.json();
      onPut?.(body);
      return HttpResponse.json(body);
    })
  );
}

/**
 * Utility to capture the last PUT body when updating the theme config.
 */
export function capturePutBody() {
  let lastBody: any = null;
  const handler = (body: any) => {
    lastBody = body;
  };
  return { handler, get: () => lastBody };
}
