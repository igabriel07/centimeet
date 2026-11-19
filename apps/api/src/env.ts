import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  USE_MOCK_PROVIDERS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  GOOGLE_MAPS_API_KEY: z.string().default(''),
  /**
   * Αναζήτηση διευθύνσεων: auto = Google αν υπάρχει κλειδί (και όχι mock), αλλιώς Photon (δωρεάν).
   * mock = ψεύτικες διευθύνσεις (tests, χωρίς δίκτυο)
   */
  GEOCODER: z.enum(['auto', 'google', 'photon', 'mock']).default('auto'),
  PHOTON_URL: z.string().default('https://photon.komoot.io'),
  /**
   * Χρόνοι διαδρομών: auto = osrm (δωρεάν) αν δεν υπάρχει GOOGLE_MAPS_API_KEY, αλλιώς google.
   * osrm: αυτοκίνητο/πόδια/ποδήλατο από OSRM — οι συγκοινωνίες από Google (αν υπάρχει κλειδί) ή εκτίμηση.
   */
  ROUTING_PROVIDER: z.enum(['auto', 'google', 'osrm', 'mock']).default('auto'),
  /**
   * Μαγαζιά: auto = osm (δωρεάν) αν δεν υπάρχει κλειδί, αλλιώς google.
   * hybrid = μαγαζιά OSM + μία κλήση Google Nearby Search για βαθμολογίες (ίδιο κόστος με google).
   */
  VENUES_PROVIDER: z.enum(['auto', 'google', 'osm', 'hybrid', 'mock']).default('auto'),
  /** OSRM με ένα path ανά προφίλ: {OSRM_URL}/routed-car, /routed-foot, /routed-bike */
  OSRM_URL: z.string().default('https://routing.openstreetmap.de'),
  OVERPASS_URL: z.string().default('https://overpass-api.de/api/interpreter'),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_JWT_SECRET: z.string().default(''),
  REQUIRE_AUTH: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * lean = χωράει στα δωρεάν μηνιαία όρια του Google (Φάση 1)· growth = πληρέστερα αποτελέσματα (Φάση 2).
   * Βλ. engine/config.ts
   */
  COST_MODE: z.enum(['lean', 'growth']).default('lean'),
  /**
   * Τι ποσοστό του δωρεάν ορίου κάθε υπηρεσίας Google επιτρέπουμε τον μήνα, πριν περάσουμε σε δωρεάν
   * εφεδρική λειτουργία. 0.9 = σταματάμε στο 90% (€0). >1 = επιτρέπουμε ελεγχόμενη υπέρβαση.
   */
  GOOGLE_BUDGET_FACTOR: z.coerce.number().min(0).max(3).default(0.9),
  /** Αναζητήσεις ανά χρήστη την ημέρα (0 = χωρίς όριο) */
  USER_DAILY_SEARCHES: z.coerce.number().int().min(0).default(10),
  /** Service role / secret key του Supabase — ΜΟΝΟ στο backend (μετρητές χρήσης) */
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  /** Πίσω από proxy (Cloud Run): η IP του χρήστη από το X-Forwarded-For */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  NODE_ENV: z.string().default('development'),
  /** Μετρητές στη μνήμη αντί για τη βάση (μόνο για τοπική δοκιμή με πραγματικό κλειδί Google) */
  ALLOW_MEMORY_USAGE_STORE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = EnvSchema.parse(source);
  const routing = routingProvider(env);
  const venues = venuesProvider(env);
  if ((routing === 'google' || venues === 'google' || venues === 'hybrid') && !env.GOOGLE_MAPS_API_KEY) {
    throw new Error(
      `GOOGLE_MAPS_API_KEY λείπει (ROUTING_PROVIDER=${routing}, VENUES_PROVIDER=${venues}) — ` +
        'ορίστε osrm/osm για δωρεάν πηγές ή USE_MOCK_PROVIDERS=true',
    );
  }
  if (usesGoogle(env) && !(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) && !env.ALLOW_MEMORY_USAGE_STORE) {
    throw new Error(
      'Με πραγματικό Google χρειάζονται SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY για τους μετρητές κόστους ' +
        '(ή ALLOW_MEMORY_USAGE_STORE=true μόνο για τοπική δοκιμή).',
    );
  }
  if (env.NODE_ENV === 'production' && !env.REQUIRE_AUTH) {
    throw new Error('Στην παραγωγή απαιτείται REQUIRE_AUTH=true (αλλιώς οποιοσδήποτε καλεί το API με δικό σας κόστος).');
  }
  if (env.REQUIRE_AUTH && !env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL λείπει ενώ REQUIRE_AUTH=true');
  }
  return env;
}

export type RoutingChoice = 'google' | 'osrm' | 'mock';
export type VenuesChoice = 'google' | 'osm' | 'hybrid' | 'mock';

/** Ποιος δίνει τους χρόνους (USE_MOCK_PROVIDERS=true → πάντα mock) */
export function routingProvider(env: Pick<Env, 'USE_MOCK_PROVIDERS' | 'ROUTING_PROVIDER' | 'GOOGLE_MAPS_API_KEY'>): RoutingChoice {
  if (env.USE_MOCK_PROVIDERS) return 'mock';
  if (env.ROUTING_PROVIDER === 'auto') return env.GOOGLE_MAPS_API_KEY ? 'google' : 'osrm';
  return env.ROUTING_PROVIDER;
}

/** Ποιος δίνει τα μαγαζιά (USE_MOCK_PROVIDERS=true → πάντα mock) */
export function venuesProvider(env: Pick<Env, 'USE_MOCK_PROVIDERS' | 'VENUES_PROVIDER' | 'GOOGLE_MAPS_API_KEY'>): VenuesChoice {
  if (env.USE_MOCK_PROVIDERS) return 'mock';
  if (env.VENUES_PROVIDER === 'auto') return env.GOOGLE_MAPS_API_KEY ? 'google' : 'osm';
  return env.VENUES_PROVIDER;
}

/** Γίνεται έστω και μία χρεώσιμη κλήση Google; (τότε χρειάζεται ο μετρητής κόστους) */
export function usesGoogle(env: Env): boolean {
  if (env.USE_MOCK_PROVIDERS) return false;
  const r = routingProvider(env);
  const v = venuesProvider(env);
  // OSRM: οι συγκοινωνίες πάνε στο Google όταν υπάρχει κλειδί
  return r === 'google' || v === 'google' || v === 'hybrid' || (r === 'osrm' && !!env.GOOGLE_MAPS_API_KEY);
}
