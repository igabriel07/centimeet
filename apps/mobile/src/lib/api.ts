import type {
  SuggestRequest,
  SuggestionsResponse,
  VenuePlanRequest,
  VenuePlanResponse,
  CityId,
  LatLng,
  PlaceSuggestion,
  ResolvedPlace,
} from '@centimeet/shared';
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'error', body.message ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  suggestions: (req: SuggestRequest) =>
    request<SuggestionsResponse>('/v1/suggestions', { method: 'POST', body: JSON.stringify(req) }),
  venuePlan: (req: VenuePlanRequest) =>
    request<VenuePlanResponse>('/v1/venue-plan', { method: 'POST', body: JSON.stringify(req) }),
  autocomplete: (q: string, city: CityId, session: string, signal?: AbortSignal) =>
    request<{ suggestions: PlaceSuggestion[] }>(`/v1/places/autocomplete?${new URLSearchParams({ q, city, session })}`, {
      signal,
    }),
  resolvePlace: (placeId: string, session: string) =>
    request<ResolvedPlace>(`/v1/places/${encodeURIComponent(placeId)}?session=${session}`),
  reverse: (loc: LatLng, signal?: AbortSignal) =>
    request<ResolvedPlace>(`/v1/places/reverse?lat=${loc.lat}&lng=${loc.lng}`, { signal }),
};
