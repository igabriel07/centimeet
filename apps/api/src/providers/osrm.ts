/**
 * Δωρεάν χρόνοι διαδρομών από OSRM (OpenStreetMap) — ROUTING_PROVIDER=osrm.
 *
 *  - Ένας server ανά προφίλ: {OSRM_URL}/routed-car · /routed-foot · /routed-bike
 *    (έτσι είναι ο δημόσιος routing.openstreetmap.de — μόνο για ανάπτυξη· στην παραγωγή δικός μας).
 *  - matrix(): Table service. ⚠️ Το OSRM θέλει «lon,lat» (ανάποδα από το Google).
 *    Κάθε κλήση ≤ 100 συντεταγμένες (origins + destinations) — το όριο του OSRM.
 *  - Αυτοκίνητο / ταξί / μηχανή → car. Η μηχανή (×0.85) και το parking εφαρμόζονται στη μηχανή
 *    (engine/modes.ts: DURATION_FACTOR), όπως και με το Google — όχι εδώ, για να μη μετρηθούν δύο φορές.
 *  - Χωρίς κίνηση: οι χρόνοι αυτοκινήτου στην αιχμή είναι πιο αισιόδοξοι από του Google.
 *  - Συγκοινωνίες: το OSRM δεν τις κάνει → `transit` (Google πίσω από το φρένο κόστους, αν υπάρχει κλειδί,
 *    αλλιώς εκτίμηση απόστασης, σημειωμένη `estimated`).
 *    TODO: OpenTripPlanner με GTFS ΟΑΣΑ / ΟΑΣΘ για δωρεάν πραγματικές συγκοινωνίες.
 *  - Αν ο server αποτύχει → εκτίμηση απόστασης (ποτέ σφάλμα στον χρήστη).
 */
import type { LatLng, TransportMode } from '@centimeet/shared';
import { cached, geoKey, type Cache } from '../lib/cache';
import { EstimateRouting } from './estimate';
import type { MatrixCell, RouteTiming, RoutingProvider } from './types';

export const DEFAULT_OSRM_URL = 'https://routing.openstreetmap.de';
/** Μέγιστες συντεταγμένες ανά κλήση Table (προεπιλογή OSRM: max-table-size 100) */
export const OSRM_MAX_COORDS = 100;

type OsrmProfile = 'car' | 'foot' | 'bike';

export function osrmProfile(mode: TransportMode): OsrmProfile | null {
  switch (mode) {
    case 'car':
    case 'taxi':
    case 'motorbike':
      return 'car';
    case 'walk':
      return 'foot';
    case 'bike':
      return 'bike';
    default:
      return null; // transit
  }
}

/** «lon,lat» με 6 δεκαδικά (~10 cm) */
export const osrmCoord = (p: LatLng) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;

/** Κομμάτια ώστε κάθε κλήση να έχει ≤ max συντεταγμένες (origins + destinations) */
export function osrmChunks(nOrigins: number, nDestinations: number, max = OSRM_MAX_COORDS): { o: [number, number]; d: [number, number] }[] {
  const out: { o: [number, number]; d: [number, number] }[] = [];
  const oSize = Math.min(nOrigins, Math.floor(max / 2));
  for (let o = 0; o < nOrigins; o += oSize) {
    const oEnd = Math.min(nOrigins, o + oSize);
    const dSize = max - (oEnd - o);
    for (let d = 0; d < nDestinations; d += dSize) out.push({ o: [o, oEnd], d: [d, Math.min(nDestinations, d + dSize)] });
  }
  return out;
}

type TableResponse = { code?: string; durations?: (number | null)[][]; distances?: (number | null)[][] };
type RouteResponse = { code?: string; routes?: { duration: number; distance: number }[] };

export class OsrmRouting implements RoutingProvider {
  private estimate = new EstimateRouting();

  constructor(
    private cache: Cache,
    /** Για τις συγκοινωνίες (Google με φρένο κόστους, ή εκτίμηση) */
    private transit: RoutingProvider = new EstimateRouting(),
    private baseUrl = DEFAULT_OSRM_URL,
    private fetchImpl: typeof fetch = fetch,
    private log: (msg: string, extra?: Record<string, unknown>) => void = () => {},
  ) {}

  private async get<T extends { code?: string }>(url: string): Promise<T> {
    const res = await this.fetchImpl(url, { headers: { 'User-Agent': 'CentiMeet/0.1' } });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = (await res.json()) as T;
    if (data.code && data.code !== 'Ok') throw new Error(`OSRM ${data.code}`);
    return data;
  }

  async matrix(origins: LatLng[], destinations: LatLng[], mode: TransportMode, timing?: RouteTiming): Promise<MatrixCell[][]> {
    const profile = osrmProfile(mode);
    if (!profile) return this.transit.matrix(origins, destinations, mode, timing);
    const out: MatrixCell[][] = origins.map(() => destinations.map(() => null));
    if (origins.length === 0 || destinations.length === 0) return out;

    try {
      for (const { o, d } of osrmChunks(origins.length, destinations.length)) {
        const os = origins.slice(o[0], o[1]);
        const ds = destinations.slice(d[0], d[1]);
        const key = `osrm:table:${profile}:${os.map((p) => geoKey(p.lat, p.lng)).join('|')}>${ds.map((p) => geoKey(p.lat, p.lng)).join('|')}`;
        const data = await cached(this.cache, key, 10 * 60, () => {
          const coords = [...os, ...ds].map(osrmCoord).join(';');
          const sources = os.map((_, i) => i).join(';');
          const dests = ds.map((_, i) => os.length + i).join(';');
          return this.get<TableResponse>(
            `${this.baseUrl}/routed-${profile}/table/v1/driving/${coords}?sources=${sources}&destinations=${dests}&annotations=duration,distance`,
          );
        });
        os.forEach((_, i) =>
          ds.forEach((_, j) => {
            const sec = data.durations?.[i]?.[j];
            const m = data.distances?.[i]?.[j];
            // null = δεν υπάρχει διαδρομή
            out[o[0] + i]![d[0] + j] = sec == null ? null : { durationMin: sec / 60, distanceKm: (m ?? 0) / 1000 };
          }),
        );
      }
      return out;
    } catch (e) {
      this.log('osrm matrix failed → estimate', { err: String(e) });
      return this.estimate.matrix(origins, destinations, mode);
    }
  }

  async route(origin: LatLng, destination: LatLng, mode: TransportMode, timing?: RouteTiming): ReturnType<RoutingProvider['route']> {
    const profile = osrmProfile(mode);
    if (!profile) return this.transit.route(origin, destination, mode, timing);
    try {
      const key = `osrm:route:${profile}:${geoKey(origin.lat, origin.lng)}>${geoKey(destination.lat, destination.lng)}`;
      const data = await cached(this.cache, key, 10 * 60, () =>
        this.get<RouteResponse>(`${this.baseUrl}/routed-${profile}/route/v1/driving/${osrmCoord(origin)};${osrmCoord(destination)}?overview=false`),
      );
      const r = data.routes?.[0];
      if (!r) return null;
      return { durationMin: Math.round(r.duration / 60), distanceKm: r.distance / 1000 };
    } catch (e) {
      this.log('osrm route failed → estimate', { err: String(e) });
      return this.estimate.route(origin, destination, mode);
    }
  }
}
