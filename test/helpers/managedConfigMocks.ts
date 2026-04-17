import { server } from '../setup.js';
import { http, HttpResponse } from 'msw';

/**
 * Registers an MSW handler for GET /openidm/config/managed that returns
 * the given objects array.
 */
export function mockGetConfig(objects: any[]) {
  server.use(
    http.get('https://*/openidm/config/managed', () => {
      return HttpResponse.json({
        _id: 'managed',
        objects
      });
    })
  );
}

/**
 * Registers MSW handlers for both GET and PATCH on /openidm/config/managed.
 * GET returns the given objects array; PATCH returns the given response.
 */
export function mockGetAndPatch(objects: any[], patchResponse: any) {
  server.use(
    http.get('https://*/openidm/config/managed', () => {
      return HttpResponse.json({
        _id: 'managed',
        objects
      });
    }),
    http.patch('https://*/openidm/config/managed', () => {
      return HttpResponse.json(patchResponse);
    })
  );
}

/**
 * Registers MSW handlers for both GET and PUT on /openidm/config/managed.
 * GET returns the given objects array; PUT returns the given response.
 */
export function mockGetAndPut(objects: any[], putResponse: any) {
  server.use(
    http.get('https://*/openidm/config/managed', () => {
      return HttpResponse.json({
        _id: 'managed',
        objects
      });
    }),
    http.put('https://*/openidm/config/managed', () => {
      return HttpResponse.json(putResponse);
    })
  );
}
