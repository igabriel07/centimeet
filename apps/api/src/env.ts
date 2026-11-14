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
  SUPABASE_URL: z.string().default(''),
  SUPABASE_JWT_SECRET: z.string().default(''),
  REQUIRE_AUTH: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = EnvSchema.parse(source);
  if (!env.USE_MOCK_PROVIDERS && !env.GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY λείπει (ή ορίστε USE_MOCK_PROVIDERS=true)');
  }
  if (env.REQUIRE_AUTH && !env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL λείπει ενώ REQUIRE_AUTH=true');
  }
  return env;
}
