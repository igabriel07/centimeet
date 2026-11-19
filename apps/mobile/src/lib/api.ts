import type {
  AreaVenuesRequest,
  AreaVenuesResponse,
  SuggestRequest,
  SuggestionsResponse,
  VenuePlanRequest,
  VenuePlanResponse,
  CityId,
  LatLng,
  PlaceSuggestion,
  ResolvedPlace,
  PopularVenuesResponse,
} from '@centimeet/shared';
import i18n from '@/i18n';
import { supabase } from './supabase';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Όριο αναμονής: ο server μπορεί να «ξυπνά» (Cloud Run) και οι υπολογισμοί θέλουν λίγα δευτερόλεπτα */
const TIMEOUT_MS = 25_000;

/** Φιλικά μηνύματα για τα συνηθισμένα σφάλματα του API */
function messageFor(status: number, code: string, fallback?: string): string {
  if (code === 'daily_limit' && fallback) return fallback;
  if (status === 401) return i18n.t('errors.sessionExpired');
  if (status === 422 && fallback) return fallback;
  if (status === 429) return fallback ?? i18n.t('errors.tooMany');
  if (status >= 500) return i18n.t('errors.server');
  return fallback ?? i18n.t('common.error');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  // Αν ο καλών δώσει δικό του signal (π.χ. ακύρωση αναζήτησης), το σεβόμαστε κι αυτό
  init?.signal?.addEventListener('abort', () => timeout.abort());

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: timeout.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch (e) {
    if (init?.signal?.aborted) throw e; // ακύρωση από τον καλούντα: όχι μήνυμα σφάλματος
    const timedOut = timeout.signal.aborted;
    throw new ApiError(0, timedOut ? 'timeout' : 'offline', i18n.t(timedOut ? 'errors.timeout' : 'errors.offline'));
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body.error ?? 'error';
    throw new ApiError(res.status, code, messageFor(res.status, code, body.message));
  }
  return body as T;
}

export const api = {
  suggestions: (req: SuggestRequest) =>
    request<SuggestionsResponse>('/v1/suggestions', { method: 'POST', body: JSON.stringify(req) }),
  areaVenues: (req: AreaVenuesRequest) =>
    request<AreaVenuesResponse>('/v1/area-venues', { method: 'POST', body: JSON.stringify(req) }),
  venuePlan: (req: VenuePlanRequest) =>
    request<VenuePlanResponse>('/v1/venue-plan', { method: 'POST', body: JSON.stringify(req) }),
  autocomplete: (q: string, city: CityId, session: string, signal?: AbortSignal) =>
    request<{ suggestions: PlaceSuggestion[] }>(`/v1/places/autocomplete?${new URLSearchParams({ q, city, session })}`, {
      signal,
    }),
  resolvePlace: (placeId: string, session: string) =>
    request<ResolvedPlace>(`/v1/places/${encodeURIComponent(placeId)}?session=${session}`),
  popularVenues: (q: { city: string; activity: string; category?: string }) =>
    request<PopularVenuesResponse>(
      `/v1/places/popular?city=${q.city}&activity=${q.activity}${q.category ? `&category=${q.category}` : ''}`,
    ),
  reverse: (loc: LatLng, signal?: AbortSignal) =>
    request<ResolvedPlace>(`/v1/places/reverse?lat=${loc.lat}&lng=${loc.lng}`, { signal }),
};
