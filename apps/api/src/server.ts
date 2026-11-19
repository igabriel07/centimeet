import cors from '@fastify/cors';
import Fastify from 'fastify';
import {
  AreaVenuesRequestSchema,
  CITY_CONFIG,
  PopularVenuesRequestSchema,
  rankPopular,
  SuggestRequestSchema,
  VenuePlanRequestSchema,
  CITIES,
  type PopularVenuesResponse,
} from '@centimeet/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { routingProvider, usesGoogle, venuesProvider, type Env } from './env';
import { venuePlan, PARKING_RADIUS_M } from './engine/plan';
import { ENGINE_PROFILES } from './engine/config';
import { areaVenues, suggest } from './engine/suggest';
import { outOfServiceArea } from './engine/areas';
import { makeAuthHook } from './lib/auth';
import { cached, MemoryCache, type Cache } from './lib/cache';
import { dayKey, defaultLimits, MemoryUsageStore, SupabaseUsageStore, UsageGuard, type UsageStore } from './lib/usage';
import { GoogleProvider } from './providers/google';
import { GuardedProvider } from './providers/guarded';
import { MockProvider } from './providers/mock';
import { mergeParking, osmParking } from './providers/osm';
import { PhotonGeocoder } from './providers/photon';
import { EstimateRouting } from './providers/estimate';
import { HybridPlaces, OsmPlaces } from './providers/osmVenues';
import { OsrmRouting } from './providers/osrm';
import type { Geocoder, PlacesProvider, Providers, RoutingProvider } from './providers/types';

/** Ποια υπηρεσία κάνει αναζήτηση διευθύνσεων (auto: Photon στη λιτή λειτουργία — δωρεάν) */
export function pickGeocoder(env: Env, cache: Cache, fallback: Geocoder): Geocoder {
  const useGoogle = !env.USE_MOCK_PROVIDERS && env.GOOGLE_MAPS_API_KEY && env.COST_MODE === 'growth';
  const mode = env.GEOCODER === 'auto' ? (useGoogle ? 'google' : 'photon') : env.GEOCODER;
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

/**
 * Ποιες πηγές χρησιμοποιούνται (βλ. .env: ROUTING_PROVIDER / VENUES_PROVIDER):
 *  - χρόνοι:  google (με φρένο κόστους) · osrm (δωρεάν· συγκοινωνίες από Google αν υπάρχει κλειδί) · mock
 *  - μαγαζιά: google · osm (δωρεάν) · hybrid (OSM + βαθμολογίες Google με μία κλήση) · mock
 * Το Google (αν χρειάζεται) περνά ΠΑΝΤΑ από το «φρένο» κόστους (GuardedProvider).
 */
export function buildProviders(
  env: Env,
  cache: Cache,
  usage: UsageStore,
  log: (msg: string, extra?: Record<string, unknown>) => void = () => {},
  fetchImpl: typeof fetch = fetch,
): { providers: Providers; findParking?: Parameters<typeof venuePlan>[2] } {
  const routingChoice = routingProvider(env);
  const venuesChoice = venuesProvider(env);
  const mock = new MockProvider();

  // Google πίσω από το φρένο κόστους — μόνο όταν κάποια πηγή το χρειάζεται
  let guarded: GuardedProvider | undefined;
  if (usesGoogle(env) && env.GOOGLE_MAPS_API_KEY) {
    const g = new GoogleProvider(env.GOOGLE_MAPS_API_KEY, cache, fetchImpl);
    const guard = new UsageGuard(usage, defaultLimits(env.GOOGLE_BUDGET_FACTOR), undefined, (e) =>
      log('usage store unavailable → Google blocked', { err: String(e) }),
    );
    guarded = new GuardedProvider(g, guard, pickGeocoder(env, cache, g), cache, log, fetchImpl, env.OVERPASS_URL);
  }
  const geocoder = guarded ?? pickGeocoder(env, cache, mock);

  const routing: RoutingProvider =
    routingChoice === 'mock'
      ? mock
      : routingChoice === 'google'
        ? guarded!
        : new OsrmRouting(cache, guarded ?? new EstimateRouting(), env.OSRM_URL, fetchImpl, log);

  const osm = () => new OsmPlaces(cache, geocoder, env.OVERPASS_URL, fetchImpl);
  const places: PlacesProvider =
    venuesChoice === 'mock'
      ? withGeocoder(mock, geocoder)
      : venuesChoice === 'google'
        ? guarded!
        : venuesChoice === 'osm'
          ? osm()
          : new HybridPlaces(osm(), guarded!, cache, log);

  // Parking: με Google, συγχώνευση Google + OSM· αλλιώς μόνο OSM (δωρεάν, από τον PlacesProvider)
  const findParking: Parameters<typeof venuePlan>[2] =
    venuesChoice === 'google' && guarded
      ? async (center) => {
          const [google, osmList] = await Promise.all([
            guarded!.searchParking(center, PARKING_RADIUS_M).catch(() => []),
            osmParking(center, PARKING_RADIUS_M, cache, fetchImpl, env.OVERPASS_URL).catch(() => []),
          ]);
          return mergeParking([google, osmList]);
        }
      : undefined;

  return { providers: { places, routing }, findParking };
}

/** Ακτίνα αναζήτησης δημοφιλών γύρω από το κέντρο της πόλης */
const POPULAR_RADIUS_M = 4000;

export function buildServer(env: Env, overrides?: { providers?: Providers; usage?: UsageStore; now?: () => Date }) {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 256 * 1024,
    // Τα ids του Photon κουβαλούν την ετικέτα (base64) → για ελληνικές διευθύνσεις ξεπερνούν το 100 (προεπιλογή)
    routerOptions: { maxParamLength: 1024 },
  });

  // Εσωτερικά σφάλματα (π.χ. από Google) δεν φτάνουν στον χρήστη — μόνο στα logs
  app.setErrorHandler((err: { statusCode?: number; validation?: unknown; message?: string }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'request failed');
    return reply.code(status).send(status >= 500 ? { error: 'internal' } : { error: 'bad_request', message: err.message });
  });
  const cache = new MemoryCache();
  const usage: UsageStore =
    overrides?.usage ??
    (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseUsageStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : new MemoryUsageStore());
  const built = buildProviders(env, cache, usage, (msg, extra) => app.log.warn(extra ?? {}, msg));
  const providers = overrides?.providers ?? built.providers;
  const engine = { config: ENGINE_PROFILES[env.COST_MODE] };
  const now = overrides?.now ?? (() => new Date());

  /** Όριο αναζητήσεων ανά χρήστη (ή IP χωρίς σύνδεση) την ημέρα. Αν ο μετρητής δεν απαντά, δεν μπλοκάρουμε. */
  async function dailyLimit(req: FastifyRequest, reply: FastifyReply, kind: 'searches' | 'areas' = 'searches'): Promise<boolean> {
    if (!env.USER_DAILY_SEARCHES) return true;
    const who = req.user?.id ?? `ip:${req.ip}`;
    // «Δες μαγαζιά εδώ» έχει δικό του (διπλάσιο) όριο ώστε να μην «τρώει» αναζητήσεις
    const limit = kind === 'areas' ? env.USER_DAILY_SEARCHES * 2 : env.USER_DAILY_SEARCHES;
    const ok = await usage.consume(dayKey(now()), `${kind}:${who}`, 1, limit).catch(() => true);
    if (!ok) {
      reply.code(429).send({
        error: 'daily_limit',
        message: `Έφτασες το όριο των ${env.USER_DAILY_SEARCHES} αναζητήσεων για σήμερα. Δοκίμασε ξανά αύριο!`,
      });
    }
    return ok;
  }

  app.register(cors, { origin: true });
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    return makeAuthHook(env)(req, reply);
  });

  app.get('/health', async () => ({ ok: true, mock: env.USE_MOCK_PROVIDERS, costMode: env.COST_MODE }));

  /** Προτάσεις μαγαζιών («μοιρασμένη απόσταση») */
  app.post('/v1/suggestions', async (req, reply) => {
    const parsed = SuggestRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues });
    const outside = outOfServiceArea(parsed.data.city, parsed.data.participants);
    if (outside.length) {
      return reply.code(422).send({
        error: 'out_of_service_area',
        message: `Εκτός ${CITY_CONFIG[parsed.data.city].region.label}: ${outside.map((p) => p.name).join(', ')}`,
      });
    }
    if (!(await dailyLimit(req, reply))) return reply;
    return suggest(parsed.data, providers, engine);
  });

  /** «Δες μαγαζιά εδώ» για εναλλακτική περιοχή (στη λιτή λειτουργία φορτώνουν κατά παραγγελία) */
  app.post('/v1/area-venues', async (req, reply) => {
    const parsed = AreaVenuesRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues });
    const center = parsed.data.area.center;
    if (outOfServiceArea(parsed.data.city, [{ id: 'area', name: 'area', origin: center, mode: 'walk' }]).length) {
      return reply.code(422).send({ error: 'out_of_service_area' });
    }
    if (!(await dailyLimit(req, reply, 'areas'))) return reply;
    return areaVenues(parsed.data, providers, engine);
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

  /**
   * «Διαλέγω εγώ το μέρος»: δημοφιλή μαγαζιά της κατηγορίας στην πόλη (γύρω από το κέντρο).
   * Ίδια λίστα για όλους → cache 6 ωρών (μία κλήση Google ανά πόλη/κατηγορία, όχι ανά χρήστη).
   */
  app.get('/v1/places/popular', async (req, reply) => {
    const parsed = PopularVenuesRequestSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues });
    const { city, activity, category } = parsed.data;
    const key = `popular:${city}:${activity}:${category ?? '*'}`;
    const hit = await cache.get<PopularVenuesResponse>(key);
    if (hit) return hit;
    if (!(await dailyLimit(req, reply, 'areas'))) return reply;
    return cached(cache, key, 6 * 3600, async (): Promise<PopularVenuesResponse> => {
      const list = await providers.places.searchVenues(CITY_CONFIG[city].center, activity, POPULAR_RADIUS_M, 20, category);
      return { venues: rankPopular(list) };
    });
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
