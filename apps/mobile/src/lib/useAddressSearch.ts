import type { CityId, PlaceSuggestion, ResolvedPlace } from '@centimeet/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';

/**
 * Ζωντανή αναζήτηση διεύθυνσης καθώς πληκτρολογείς:
 * - debounce 250ms, ακύρωση παλιών αιτημάτων (δεν «πηδάνε» αποτελέσματα)
 * - session token: η Google χρεώνει autocomplete + επιλογή ως ένα session
 */
export function useAddressSearch(city: CityId) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [session, setSession] = useState(newToken);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    abort.current?.abort();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const timer = setTimeout(() => {
      api
        .autocomplete(q, city, session, ctrl.signal)
        .then((r) => {
          setResults(r.suggestions);
          setError(false);
        })
        .catch((e) => {
          if (e?.name !== 'AbortError') setError(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, city, session]);

  return useMemo(
    () => ({
      query,
      setQuery,
      results,
      loading,
      error,
      clear: () => {
        setQuery('');
        setResults([]);
      },
      /** Επιλογή αποτελέσματος → συντεταγμένες. Κλείνει το session. */
      pick: async (s: PlaceSuggestion): Promise<ResolvedPlace> => {
        const place = await api.resolvePlace(s.placeId, session);
        setSession(newToken());
        setQuery('');
        setResults([]);
        return { ...place, name: s.mainText, address: [s.mainText, s.secondaryText].filter(Boolean).join(', ') };
      },
    }),
    [query, results, loading, error, session],
  );
}

function newToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
