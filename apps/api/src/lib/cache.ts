/**
 * Απλή in-memory cache με TTL. Στην παραγωγή αντικαθίσταται από Redis
 * με το ίδιο interface, ώστε να μη χρεωνόμαστε ξανά τις ίδιες κλήσεις Google.
 */
export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSec: number): Promise<void>;
}

export class MemoryCache implements Cache {
  private store = new Map<string, { value: unknown; expires: number }>();
  constructor(private maxEntries = 5000) {}

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + ttlSec * 1000 });
  }
}

export async function cached<T>(cache: Cache, key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  await cache.set(key, value, ttlSec);
  return value;
}

/** Στρογγυλεύει συντεταγμένες (~11 m) ώστε κοντινές αναζητήσεις να μοιράζονται cache */
export const geoKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
