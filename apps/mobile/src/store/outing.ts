import type {
  Activity,
  CityId,
  LatLng,
  ResolvedPlace,
  SuggestionsResponse,
  TransportMode,
  VenuePlanResponse,
} from '@centimeet/shared';
import { create } from 'zustand';

export type DraftPerson = {
  id: string;
  name: string;
  origin?: LatLng;
  /** Η διεύθυνση που επιλέχθηκε (για εμφάνιση) */
  originPlace?: ResolvedPlace;
  mode?: TransportMode;
  /** id χρήστη Supabase, αν είναι φίλος με λογαριασμό */
  userId?: string;
};

type OutingDraft = {
  city: CityId;
  activity: Activity;
  departAt?: string;
  people: DraftPerson[];
  suggestions?: SuggestionsResponse;
  plan?: VenuePlanResponse;
  setCity: (c: CityId) => void;
  setActivity: (a: Activity) => void;
  setDepartAt: (iso?: string) => void;
  addPerson: (p?: Partial<DraftPerson>) => void;
  updatePerson: (id: string, patch: Partial<DraftPerson>) => void;
  removePerson: (id: string) => void;
  setSuggestions: (s?: SuggestionsResponse) => void;
  setPlan: (p?: VenuePlanResponse) => void;
  reset: () => void;
};

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${seq++}`;

const initial = () => ({
  city: 'athens' as CityId,
  activity: 'coffee' as Activity,
  departAt: undefined,
  people: [
    { id: newId(), name: '' },
    { id: newId(), name: '' },
  ],
  suggestions: undefined,
  plan: undefined,
});

export const useOuting = create<OutingDraft>((set) => ({
  ...initial(),
  setCity: (city) => set({ city }),
  setActivity: (activity) => set({ activity }),
  setDepartAt: (departAt) => set({ departAt }),
  addPerson: (p) => set((s) => ({ people: [...s.people, { id: newId(), name: '', ...p }] })),
  updatePerson: (id, patch) => set((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removePerson: (id) => set((s) => ({ people: s.people.length > 2 ? s.people.filter((p) => p.id !== id) : s.people })),
  setSuggestions: (suggestions) => set({ suggestions, plan: undefined }),
  setPlan: (plan) => set({ plan }),
  reset: () => set(initial()),
}));

/** Μετατρέπει το πρόχειρο σε participants για το API (μόνο αν είναι πλήρες) */
export function toParticipants(people: DraftPerson[]) {
  const ready = people.every((p) => p.origin && p.mode);
  if (!ready) return null;
  return people.map((p, i) => ({
    id: p.id,
    name: p.name.trim() || `Άτομο ${i + 1}`,
    origin: p.origin!,
    mode: p.mode!,
  }));
}
