import { applyInvites, isValidCategory, MAX_PARTICIPANTS } from '@centimeet/shared';
import type {
  AreaVenuesResponse,
  FriendGroup,
  InviteProfile,
  Activity,
  ActivityCategory,
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
  /** Φίλος: επιλέχθηκε μεμονωμένα από τη λίστα φίλων */
  direct?: boolean;
  /** Φίλος: ομάδες (ids) μέσω των οποίων προσκλήθηκε */
  groups?: string[];
};

type OutingDraft = {
  city: CityId;
  activity: Activity;
  /** Κατηγορία (π.χ. πίτσα) — χωρίς = «Όλα» */
  category?: ActivityCategory;
  departAt?: string;
  people: DraftPerson[];
  suggestions?: SuggestionsResponse;
  plan?: VenuePlanResponse;
  /** Αν τα δεδομένα προέρχονται από αποθηκευμένη έξοδο */
  savedOutingId?: string;
  setCity: (c: CityId) => void;
  /** Αλλάζει δραστηριότητα· η κατηγορία μένει μόνο αν ανήκει στη νέα δραστηριότητα */
  setActivity: (a: Activity, category?: ActivityCategory) => void;
  setCategory: (c?: ActivityCategory) => void;
  setDepartAt: (iso?: string) => void;
  addPerson: (p?: Partial<DraftPerson>) => void;
  /** Ομάδες φίλων που έχουν προσκληθεί */
  invitedGroups: FriendGroup[];
  /** Ορίζει όλη την επιλογή προσκλήσεων (μεμονωμένοι φίλοι + ομάδες) — από τα pop-ups Φίλοι/Ομάδα */
  setInvites: (direct: InviteProfile[], groups: FriendGroup[], me?: string) => void;
  updatePerson: (id: string, patch: Partial<DraftPerson>) => void;
  removePerson: (id: string) => void;
  /** «Εγώ» (ο τρέχων χρήστης) πάντα πρώτο· ενημερώνει το όνομα από το προφίλ */
  ensureMe: (name: string) => void;
  setSuggestions: (s?: SuggestionsResponse) => void;
  /** «Δες μαγαζιά εδώ»: προσθέτει τα μαγαζιά μιας εναλλακτικής περιοχής */
  addAreaVenues: (r: AreaVenuesResponse) => void;
  setPlan: (p?: VenuePlanResponse) => void;
  loadSaved: (s: {
    outingId: string;
    city: CityId;
    activity: Activity;
    category?: ActivityCategory;
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
  category: undefined as ActivityCategory | undefined,
  departAt: undefined,
  // Μόνο «Εγώ»· οι υπόλοιποι προστίθενται με «Πρόσθεσε άτομο» / πρόσκληση φίλων
  people: [{ id: newId(), name: '', isMe: true }] as DraftPerson[],
  invitedGroups: [] as FriendGroup[],
  suggestions: undefined,
  plan: undefined,
  savedOutingId: undefined,
});

export const useOuting = create<OutingDraft>((set) => ({
  ...initial(),
  setCity: (city) => set({ city }),
  setActivity: (activity, category) => set({ activity, category: isValidCategory(activity, category) ? category : undefined }),
  setCategory: (category) => set((s) => ({ category: isValidCategory(s.activity, category) ? category : undefined })),
  setDepartAt: (departAt) => set({ departAt }),
  addPerson: (p) => set((s) => ({ people: [...s.people, { id: newId(), name: '', ...p }] })),
  setInvites: (direct, groups, me) =>
    set((s) => {
      const friends = s.people.filter((p) => p.userId && !p.isMe);
      const current = friends.map((p) => ({ userId: p.userId!, name: p.name, direct: !!p.direct, groups: p.groups ?? [] }));
      const next = applyInvites(current, direct, groups, me);
      const byUser = new Map(friends.map((p) => [p.userId!, p]));
      const invitees: DraftPerson[] = next.map((i) => ({
        ...(byUser.get(i.userId) ?? { id: newId() }),
        name: i.name,
        userId: i.userId,
        direct: i.direct,
        groups: i.groups,
      }));
      const others = s.people.filter((p) => !p.userId || p.isMe);
      return { people: [...others, ...invitees].slice(0, MAX_PARTICIPANTS), invitedGroups: groups };
    }),
  updatePerson: (id, patch) => set((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  // Το «Εγώ» δεν αφαιρείται
  removePerson: (id) => set((s) => ({ people: s.people.filter((p) => p.id !== id || p.isMe) })),
  ensureMe: (name) =>
    set((s) => {
      const me = s.people.find((p) => p.isMe);
      const others = s.people.filter((p) => !p.isMe);
      if (me) return me.name === name && s.people[0] === me ? {} : { people: [{ ...me, name }, ...others] };
      // Δεν υπάρχει «Εγώ»: παίρνει τη θέση μιας κενής κάρτας, αλλιώς μπαίνει πρώτο
      const blank = others.findIndex(isBlank);
      const rest = blank >= 0 ? others.filter((_, i) => i !== blank) : others;
      return { people: [{ id: newId(), name, isMe: true }, ...rest].slice(0, MAX_PARTICIPANTS) };
    }),
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
  loadSaved: ({ outingId, ...rest }) => set({ category: undefined, invitedGroups: [], ...rest, savedOutingId: outingId, plan: undefined }),
  reset: () => set(initial()),
}));

/** Μετατρέπει το πρόχειρο σε participants για το API (μόνο αν είναι πλήρες) */
export function toParticipants(people: DraftPerson[]) {
  const ready = people.every((p) => p.origin && p.mode);
  if (!ready) return null;
  return people.map((p, i) => ({
    id: p.id,
    name: p.name.trim() || (p.isMe ? 'Εγώ' : `Άτομο ${i + 1}`),
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
/** «Διαλέγω εγώ το μέρος»: χωρίς αφετηρίες — μόνο ποιοι καλούνται + ονόματα επισκεπτών */
export function toFixedSaveInput(people: DraftPerson[]) {
  const guests = people.filter((p) => !p.isMe && !p.userId && !isBlank(p));
  return {
    invitees: people.flatMap((p) => (p.userId && !p.isMe ? [p.userId] : [])),
    guests: guests.map((p) => ({ name: p.name.trim() || `Άτομο ${people.indexOf(p) + 1}` })),
  };
}

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
