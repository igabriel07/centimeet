import { MAX_PARTICIPANTS } from '@centimeet/shared';
import type {
  AreaVenuesResponse,
  Activity,
  CityId,
  LatLng,
  OriginInput,
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
  /** id χρήστη Supabase, αν είναι φίλος με λογαριασμό — δηλώνει μόνος του αφετηρία/μέσο */
  userId?: string;
  /** Αυτό το άτομο είναι ο συνδεδεμένος χρήστης (διοργανωτής) */
  isMe?: boolean;
};

type OutingDraft = {
  city: CityId;
  activity: Activity;
  departAt?: string;
  people: DraftPerson[];
  suggestions?: SuggestionsResponse;
  plan?: VenuePlanResponse;
  /** Αν τα δεδομένα προέρχονται από αποθηκευμένη έξοδο */
  savedOutingId?: string;
  setCity: (c: CityId) => void;
  setActivity: (a: Activity) => void;
  setDepartAt: (iso?: string) => void;
  addPerson: (p?: Partial<DraftPerson>) => void;
  addFriends: (friends: { id: string; display_name: string }[]) => void;
  updatePerson: (id: string, patch: Partial<DraftPerson>) => void;
  removePerson: (id: string) => void;
  setMe: (id: string) => void;
  setSuggestions: (s?: SuggestionsResponse) => void;
  /** «Δες μαγαζιά εδώ»: προσθέτει τα μαγαζιά μιας εναλλακτικής περιοχής */
  addAreaVenues: (r: AreaVenuesResponse) => void;
  setPlan: (p?: VenuePlanResponse) => void;
  loadSaved: (s: {
    outingId: string;
    city: CityId;
    activity: Activity;
    departAt?: string;
    people: DraftPerson[];
    suggestions: SuggestionsResponse;
  }) => void;
  reset: () => void;
};

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${seq++}`;

/** Κενή κάρτα που δεν έχει αγγιχτεί ακόμη */
const isBlank = (p: DraftPerson) => !p.name.trim() && !p.origin && !p.mode && !p.userId && !p.isMe;

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
  savedOutingId: undefined,
});

export const useOuting = create<OutingDraft>((set) => ({
  ...initial(),
  setCity: (city) => set({ city }),
  setActivity: (activity) => set({ activity }),
  setDepartAt: (departAt) => set({ departAt }),
  addPerson: (p) => set((s) => ({ people: [...s.people, { id: newId(), name: '', ...p }] })),
  addFriends: (friends) =>
    set((s) => {
      const known = new Set(s.people.map((p) => p.userId).filter(Boolean));
      const fresh = friends.filter((f) => !known.has(f.id)).map((f) => ({ id: newId(), name: f.display_name, userId: f.id }));
      // Οι φίλοι παίρνουν πρώτα τη θέση κενών καρτών, μετά προστίθενται στο τέλος
      const people = [...s.people];
      for (const f of fresh) {
        const blank = people.findIndex(isBlank);
        if (blank >= 0) people[blank] = f;
        else people.push(f);
      }
      return { people: people.slice(0, MAX_PARTICIPANTS) };
    }),
  updatePerson: (id, patch) => set((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removePerson: (id) => set((s) => ({ people: s.people.length > 2 ? s.people.filter((p) => p.id !== id) : s.people })),
  setMe: (id) => set((s) => ({ people: s.people.map((p) => ({ ...p, isMe: p.id === id ? !p.isMe : false })) })),
  setSuggestions: (suggestions) => set({ suggestions, plan: undefined }),
  addAreaVenues: (r) =>
    set((s) =>
      s.suggestions
        ? {
            suggestions: {
              ...s.suggestions,
              areas: s.suggestions.areas.map((a) => (a.id === r.area.id ? r.area : a)),
              alternatives: [...s.suggestions.alternatives, ...r.venues],
              notices: { ...s.suggestions.notices, ...r.notices },
            },
          }
        : {},
    ),
  setPlan: (plan) => set({ plan }),
  loadSaved: ({ outingId, ...rest }) => set({ ...rest, savedOutingId: outingId, plan: undefined }),
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

const toOrigin = (p: DraftPerson): OriginInput => ({
  lat: p.origin!.lat,
  lng: p.origin!.lng,
  label: p.originPlace?.name,
  mode: p.mode!,
});

/**
 * Προετοιμάζει το πρόχειρο για αποθήκευση (create_outing):
 * «Εγώ» → αφετηρία διοργανωτή, φίλοι → προσκλήσεις, υπόλοιποι → επισκέπτες.
 */
export function toSaveInput(people: DraftPerson[]):
  | { ok: true; me: OriginInput; invitees: string[]; guests: (OriginInput & { name: string })[] }
  | { ok: false; error: 'needMe' | 'incomplete' } {
  const me = people.find((p) => p.isMe);
  if (!me) return { ok: false, error: 'needMe' };
  const guests = people.filter((p) => !p.isMe && !p.userId && !isBlank(p));
  if (![me, ...guests].every((p) => p.origin && p.mode)) return { ok: false, error: 'incomplete' };
  return {
    ok: true,
    me: toOrigin(me),
    invitees: people.flatMap((p) => (p.userId && !p.isMe ? [p.userId] : [])),
    guests: guests.map((p) => ({ ...toOrigin(p), name: p.name.trim() || `Άτομο ${people.indexOf(p) + 1}` })),
  };
}
