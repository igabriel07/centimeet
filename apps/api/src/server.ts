import cors from '@fastify/cors';
import Fastify from 'fastify';
import { CITY_CONFIG, SuggestRequestSchema, VenuePlanRequestSchema, CITIES } from '@centimeet/shared';
import { z } from 'zod';
import type { Env } from './env';
import { venuePlan, PARKING_RADIUS_M } from './engine/plan';
import { suggest } from './engine/suggest';
import { outOfServiceArea } from './engine/areas';
import { makeAuthHook } from './lib/auth';
import { MemoryCache, type Cache } from './lib/cache';
import { GoogleProvider } from './providers/google';
import { MockProvider } from './providers/mock';
import { mergeParking, osmParking } from './providers/osm';
import { PhotonGeocoder } from './providers/photon';
import type { Geocoder, PlacesProvider, Providers } from './providers/types';

/** Ποια υπηρεσία κάνει αναζήτηση διευθύνσεων */
export function pickGeocoder(env: Env, cache: Cache, fallback: Geocoder): Geocoder {
  const mode =
    env.GEOCODER === 'auto' ? (!env.USE_MOCK_PROVIDERS && env.GOOGLE_MAPS_API_KEY ? 'google' : 'photon') : env.GEOCODER;
  if (mode === 'photon') return new PhotonGeocoder(cache, env.PHOTON_URL);
  if (mode === 'google') return new GoogleProvider(env.GOOGLE_MAPS_API_KEY, cache);
  return fallback;
}

/** Αντικαθιστά τις μεθόδους διευθύνσεων ενός PlacesProvider με άλλον Geocoder */
function withGeocoder(places: PlacesProvider, geo: Geocoder): PlacesProvider {
  if (geo === places) return places;
  return {
    searchVenues: places.searchVenues.bind(places),
    getVenue: places.getVenue.bind(places),
    searchParking: places.searchParking.bind(places),
    autocomplete: geo.autocomplete.bind(geo),
    resolvePlace: geo.resolvePlace.bind(geo),
    reverse: geo.reverse.bind(geo),
  };
}

export function buildProviders(env: Env, cache: Cache): { providers: Providers; findParking?: Parameters<typeof venuePlan>[2] } {
  if (env.USE_MOCK_PROVIDERS) {
    const m = new MockProvider();
    return { providers: { places: withGeocoder(m, pickGeocoder(env, cache, m)), routing: m } };
  }
  const g = new GoogleProvider(env.GOOGLE_MAPS_API_KEY, cache);
  return {
    providers: { places: withGeocoder(g, pickGeocoder(env, cache, g)), routing: g },
    findParking: async (center) => {
      const [google, osm] = await Promise.all([
        g.searchParking(center, PARKING_RADIUS_M).catch(() => []),
        osmParking(center, PARKING_RADIUS_M, cache).catch(() => []),
      ]);
      return mergeParking([google, osm]);
    },
  };
}

export function buildServer(env: Env, overrides?: { providers?: Providers }) {
  const app = Fastify({ logger: { level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' } });
  const cache = new MemoryCache();
  const built = buildProviders(env, cache);
  const providers = overrides?.providers ?? built.providers;

  app.register(cors, { origin: true });
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    return makeAuthHook(env)(req, reply);
  });

  app.get('/health', async () => ({ ok: true, mock: env.USE_MOCK_PROVIDERS }));

  /** Προτάσεις μαγαζιών («μοιρασμένη απόσταση») */
  app.post('/v1/suggestions', async (req, reply) => {
    const parsed = SuggestRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues });
    const outside = outOfServiceArea(parsed.data.city, parsed.data.participants);
    if (outside.length) {
      return reply.code(422).send({
        error: 'out_of_service_area',
        message: `Εκτός ${CITY_CONFIG[parsed.data.city].label}: ${outside.map((p) => p.name).join(', ')}`,
      });
    }
    return suggest(parsed.data, providers);
  });

  /** Αναλυτικό πλάνο ανά άτομο για το μαγαζί που επιλέχθηκε */
  app.post('/v1/venue-plan', async (req, reply) => {
    const parsed = VenuePlanRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues });
    const result = await venuePlan(parsed.data, providers, overrides?.providers ? undefined : built.findParking);
    if (!result) return reply.code(404).send({ error: 'venue_not_found' });
    return result;
  });

  /** Αναζήτηση διεύθυνσης για την αφετηρία κάθε ατόμου (το κλειδί Google μένει εδώ) */
  const AutocompleteQuery = z.object({
    q: z.string().min(2).max(120),
    city: z.enum(CITIES).default('athens'),
    session: z.string().max(64).optional(),
  });
  app.get('/v1/places/autocomplete', async (req, reply) => {
    const parsed = AutocompleteQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    const { q, city, session } = parsed.data;
    try {
      return { suggestions: await providers.places.autocomplete(q, CITY_CONFIG[city].center, session) };
    } catch (e) {
      req.log.warn({ err: e }, 'autocomplete failed');
      return reply.code(502).send({ error: 'geocoder_unavailable' });
    }
  });

  /** Pin στον χάρτη / «η τοποθεσία μου» → διεύθυνση */
  const ReverseQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });
  app.get('/v1/places/reverse', async (req, reply) => {
    const parsed = ReverseQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    const place = await providers.places.reverse(parsed.data).catch(() => null);
    // Χωρίς αποτέλεσμα: επιστρέφουμε τις συντεταγμένες ώστε η επιλογή να συνεχίσει να δουλεύει
    return (
      place ?? {
        placeId: `coords:${parsed.data.lat},${parsed.data.lng}`,
        name: 'Σημείο στον χάρτη',
        address: `${parsed.data.lat.toFixed(5)}, ${parsed.data.lng.toFixed(5)}`,
        location: parsed.data,
      }
    );
  });

  app.get('/v1/places/:placeId', async (req, reply) => {
    const { placeId } = req.params as { placeId: string };
    const session = (req.query as { session?: string }).session;
    const place = await providers.places.resolvePlace(placeId, session);
    if (!place) return reply.code(404).send({ error: 'not_found' });
    return place;
  });

  return app;
}
