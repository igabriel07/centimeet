/**
 * Δωρεάν εφεδρική δρομολόγηση: εκτίμηση από την απόσταση (ευθεία × 1.3 με μέση ταχύτητα πόλης).
 * Χρησιμοποιείται όταν εξαντληθεί το δωρεάν όριο του Google. Κάθε αποτέλεσμα σημειώνεται `estimated`.
 */
import { estimateMinutes, type LatLng, type TransportMode } from '@centimeet/shared';
import type { MatrixCell, RoutingProvider } from './types';

export class EstimateRouting implements RoutingProvider {
  async matrix(origins: LatLng[], destinations: LatLng[], mode: TransportMode): Promise<MatrixCell[][]> {
    return origins.map((o) => destinations.map((d) => ({ ...estimateMinutes(o, d, mode), estimated: true })));
  }

  async route(origin: LatLng, destination: LatLng, mode: TransportMode) {
    const e = estimateMinutes(origin, destination, mode);
    return { durationMin: Math.round(e.durationMin), distanceKm: e.distanceKm, estimated: true };
  }
}
