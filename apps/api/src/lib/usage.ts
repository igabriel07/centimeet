/**
 * Μετρητής χρήσης — το «φρένο» κόστους.
 *
 * Κάθε κλήση Google «καταναλώνει» μονάδες από ένα μηνιαίο όριο ανά SKU (κάτω από το δωρεάν όριο
 * του Google). Αν δεν χωράει, ο GuardedProvider γυρίζει σε δωρεάν εφεδρική λειτουργία αντί να χρεώσει.
 * Ο ίδιος μηχανισμός μετρά και τις αναζητήσεις ανά χρήστη την ημέρα.
 *
 * Στην παραγωγή οι μετρητές ζουν στη βάση (Supabase), ώστε να επιβιώνουν από επανεκκινήσεις
 * και να μοιράζονται ανάμεσα σε instances (Cloud Run).
 */

export interface UsageStore {
  /**
   * Ατομικά: αν count + n ≤ limit, αυξάνει τον μετρητή και επιστρέφει true· αλλιώς false χωρίς αλλαγή.
   */
  consume(period: string, key: string, n: number, limit: number): Promise<boolean>;
  get(period: string, key: string): Promise<number>;
}

export class MemoryUsageStore implements UsageStore {
  private counts = new Map<string, number>();
  async consume(period: string, key: string, n: number, limit: number) {
    const k = `${period}|${key}`;
    const cur = this.counts.get(k) ?? 0;
    if (cur + n > limit) return false;
    this.counts.set(k, cur + n);
    return true;
  }
  async get(period: string, key: string) {
    return this.counts.get(`${period}|${key}`) ?? 0;
  }
}

/** Μετρητές στη βάση μέσω της συνάρτησης consume_api_usage (μόνο με service role key) */
export class SupabaseUsageStore implements UsageStore {
  constructor(
    private url: string,
    private serviceKey: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private headers() {
    // Τα νέα secret keys (sb_secret_…) πάνε μόνο στο apikey· τα παλιά service_role JWT και στο Authorization
    return {
      'Content-Type': 'application/json',
      apikey: this.serviceKey,
      ...(this.serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${this.serviceKey}` } : {}),
    };
  }

  private async rpc<T>(fn: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`usage store ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  async consume(period: string, key: string, n: number, limit: number) {
    return this.rpc<boolean>('consume_api_usage', { p_period: period, p_key: key, p_n: n, p_limit: limit });
  }

  async get(period: string, key: string) {
    return this.rpc<number>('get_api_usage', { p_period: period, p_key: key });
  }
}

/** SKU του Google που μετράμε (με τα δωρεάν μηνιαία όρια του Google, Νοέμβριος 2026) */
export const GOOGLE_FREE_MONTHLY = {
  /** Nearby Search Enterprise + Atmosphere (μαγαζιά) */
  places_search: 1000,
  /** Place Details Enterprise (στοιχεία μαγαζιού για το πλάνο, όταν δεν είναι στην cache) */
  place_details: 1000,
  /** Nearby Search Pro (parking) */
  parking_search: 5000,
  /** Compute Route Matrix: στοιχεία (origins × destinations) */
  matrix_pro: 5000,
  matrix_essentials: 10000,
  /** Compute Routes: κλήσεις */
  routes_pro: 5000,
  routes_essentials: 10000,
} as const;

export type GoogleSku = keyof typeof GOOGLE_FREE_MONTHLY;

/** Προεπιλογή: σταματάμε στο 90% του δωρεάν ορίου (περιθώριο για καθυστερήσεις μέτρησης του Google) */
export function defaultLimits(factor = 0.9): Record<GoogleSku, number> {
  return Object.fromEntries(
    Object.entries(GOOGLE_FREE_MONTHLY).map(([k, v]) => [k, Math.floor(v * factor)]),
  ) as Record<GoogleSku, number>;
}

/** Μήνας / ημέρα σε ώρα UTC (ο κύκλος χρέωσης του Google είναι ημερολογιακός μήνας) */
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export class UsageGuard {
  constructor(
    private store: UsageStore,
    private limits: Record<GoogleSku, number>,
    private now: () => Date = () => new Date(),
    private onError: (e: unknown) => void = () => {},
  ) {}

  /**
   * Επιτρέπεται κλήση που κοστίζει `n` μονάδες; Αν ναι, τις καταγράφει.
   * Αν ο μετρητής δεν είναι διαθέσιμος, απαντά «όχι» (ασφαλές: καλύτερα εφεδρική λειτουργία παρά χρέωση).
   */
  async tryConsume(sku: GoogleSku, n = 1): Promise<boolean> {
    try {
      return await this.store.consume(monthKey(this.now()), `google:${sku}`, n, this.limits[sku]);
    } catch (e) {
      this.onError(e);
      return false;
    }
  }

  async report(): Promise<Record<GoogleSku, { used: number; limit: number }>> {
    const month = monthKey(this.now());
    const entries = await Promise.all(
      (Object.keys(this.limits) as GoogleSku[]).map(async (sku) => [
        sku,
        { used: await this.store.get(month, `google:${sku}`).catch(() => -1), limit: this.limits[sku] },
      ]),
    );
    return Object.fromEntries(entries);
  }
}
