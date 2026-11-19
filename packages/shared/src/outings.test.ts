import { describe, expect, it } from 'vitest';
import { homeInvites, inviteTabs, isPending, MyOutingRowSchema, OutingParticipantRowSchema, outingToParticipants, type MyOutingRow, type OutingParticipantRow } from './index';

const row = (p: Partial<OutingParticipantRow>): OutingParticipantRow => ({
  id: 'x',
  user_id: null,
  name: 'Άννα',
  mode: 'walk',
  rsvp: 'going',
  declared: true,
  is_organizer: false,
  lat: 37.97,
  lng: 23.73,
  origin_label: null,
  ...p,
});

describe('outingToParticipants', () => {
  it('παίρνει όσους έχουν δηλώσει, αφήνει εκκρεμείς και αγνοεί όσους αρνήθηκαν', () => {
    const { participants, pending } = outingToParticipants([
      row({ id: 'a', name: 'Άννα' }),
      row({ id: 'b', name: 'Μπάμπης', declared: false, mode: null, lat: null, lng: null, rsvp: 'invited' }),
      row({ id: 'c', name: 'Χλόη', rsvp: 'declined', declared: false }),
      row({ id: 'g', name: 'Γιώργος', mode: 'transit', lat: 37.94, lng: 23.65 }),
    ]);
    expect(participants).toEqual([
      { id: 'a', name: 'Άννα', origin: { lat: 37.97, lng: 23.73 }, mode: 'walk' },
      { id: 'g', name: 'Γιώργος', origin: { lat: 37.94, lng: 23.65 }, mode: 'transit' },
    ]);
    expect(pending.map((p) => p.id)).toEqual(['b']);
  });

  it('όσοι έχουν δηλώσει αλλά δεν είναι ορατοί σε εσένα (lat = null) δεν στέλνονται στο API', () => {
    const { participants, pending } = outingToParticipants([row({ id: 'b', lat: null, lng: null })]);
    expect(participants).toEqual([]);
    expect(pending.map((p) => p.id)).toEqual(['b']);
  });

  it('κενό όνομα → «Άτομο N», πολύ μεγάλο όνομα κόβεται στους 60 χαρακτήρες', () => {
    const { participants } = outingToParticipants([row({ id: 'a', name: '  ' }), row({ id: 'b', name: 'α'.repeat(80) })]);
    expect(participants[0]!.name).toBe('Άτομο 1');
    expect(participants[1]!.name).toHaveLength(60);
  });
});

describe('isPending', () => {
  it('εκκρεμεί μόνο όποιος δεν έχει δηλώσει ούτε αρνηθεί', () => {
    expect(isPending({ declared: false, rsvp: 'invited' })).toBe(true);
    expect(isPending({ declared: false, rsvp: 'declined' })).toBe(false);
    expect(isPending({ declared: true, rsvp: 'going' })).toBe(false);
  });
});

describe('schemas γραμμών RPC', () => {
  it('δέχονται τη μορφή που επιστρέφει η PostgREST', () => {
    expect(
      OutingParticipantRowSchema.parse({
        id: 'u1', user_id: null, name: 'Γιώργος', mode: null, rsvp: 'invited', declared: false,
        is_organizer: false, lat: null, lng: null, origin_label: null,
      }).rsvp,
    ).toBe('invited');
    expect(
      MyOutingRowSchema.parse({
        id: 'o1', title: null, activity: 'coffee', city: 'athens', meet_at: '2026-11-20T17:00:00+00:00',
        status: 'collecting', is_organizer: true, my_participant_id: 'p1', my_rsvp: 'going', my_declared: true,
        declared_count: 2, total_count: 4, created_at: '2026-11-14T10:00:00+00:00',
      }).total_count,
    ).toBe(4);
  });

  it('απορρίπτουν άγνωστο μέσο', () => {
    expect(() => OutingParticipantRowSchema.parse({ ...row({}), mode: 'rocket' })).toThrow();
  });
});

describe('homeInvites', () => {
  const now = new Date('2026-11-20T18:00:00Z');
  const base: MyOutingRow = {
    id: 'o',
    title: null,
    activity: 'coffee',
    category: null,
    city: 'athens',
    meet_at: null,
    status: 'collecting',
    is_organizer: false,
    organizer_name: 'Μαρία',
    my_participant_id: 'p',
    my_rsvp: 'invited',
    my_declared: false,
    declared_count: 1,
    total_count: 3,
    created_at: '2026-11-20T10:00:00Z',
  };
  const r = (p: Partial<MyOutingRow>): MyOutingRow => ({ ...base, ...p });

  it('χωρίζει ληφθείσες/σταλμένες, κρύβει αρνήσεις και παλιές', () => {
    const { received, sent, unanswered } = homeInvites(
      [
        r({ id: 'going', my_rsvp: 'going', meet_at: '2026-11-20T19:00:00Z' }),
        r({ id: 'new', meet_at: '2026-11-21T19:00:00Z' }),
        r({ id: 'declined', my_rsvp: 'declined' }),
        r({ id: 'stale', meet_at: '2026-11-20T14:00:00Z' }),
        r({ id: 'recent', my_rsvp: 'going', meet_at: '2026-11-20T16:00:00Z' }),
        r({ id: 'mine-later', is_organizer: true, my_rsvp: 'going', meet_at: '2026-11-22T19:00:00Z' }),
        r({ id: 'mine-soon', is_organizer: true, my_rsvp: 'going', meet_at: '2026-11-20T20:00:00Z' }),
      ],
      now,
    );
    // πρώτα όσες περιμένουν απάντηση, μετά με την πιο κοντινή ώρα
    expect(received.map((x) => x.id)).toEqual(['new', 'recent', 'going']);
    expect(sent.map((x) => x.id)).toEqual(['mine-soon', 'mine-later']);
    expect(unanswered).toBe(1);
  });

  it('«Σήμερα» χωρίς ώρα: κρύβεται όταν περάσει η μέρα', () => {
    const { received } = homeInvites(
      [r({ id: 'today', my_rsvp: 'going', meet_day: '2026-11-20' }), r({ id: 'yesterday', my_rsvp: 'going', meet_day: '2026-11-19' })],
      new Date(2026, 10, 20, 18, 0),
    );
    expect(received.map((x) => x.id)).toEqual(['today']);
  });

  it('χωρίς ώρα: μετά από όσες έχουν ώρα', () => {
    const { received } = homeInvites([r({ id: 'noTime', my_rsvp: 'going' }), r({ id: 'timed', my_rsvp: 'going', meet_at: '2026-11-25T10:00:00Z' })], now);
    expect(received.map((x) => x.id)).toEqual(['timed', 'noTime']);
  });

  it('δέχεται γραμμή χωρίς organizer_name (παλιά βάση)', () => {
    const { organizer_name: _, ...old } = base;
    expect(MyOutingRowSchema.parse(old).organizer_name).toBeUndefined();
  });
});

describe('inviteTabs', () => {
  const now = new Date('2026-11-20T18:00:00Z');
  const r = (p: Partial<MyOutingRow>): MyOutingRow => ({
    id: 'o',
    title: null,
    activity: 'coffee',
    category: null,
    city: 'athens',
    meet_at: '2026-11-20T20:00:00Z',
    status: 'collecting',
    is_organizer: false,
    organizer_name: 'Μαρία',
    my_participant_id: 'p',
    my_rsvp: 'invited',
    my_declared: false,
    declared_count: 1,
    total_count: 3,
    created_at: '2026-11-20T10:00:00Z',
    ...p,
  });

  it('Απάντησε / Πάμε / Έστειλες', () => {
    const { tabs, initial } = inviteTabs(
      [
        r({ id: 'new' }),
        r({ id: 'undeclared', my_rsvp: 'going' }),
        r({ id: 'declared', my_rsvp: 'going', my_declared: true }),
        r({ id: 'fixed', my_rsvp: 'going', place_mode: 'fixed' }),
        r({ id: 'mine', is_organizer: true, my_rsvp: 'going', my_declared: true }),
        r({ id: 'no', my_rsvp: 'declined' }),
      ],
      now,
    );
    expect(tabs.answer.map((o) => o.id)).toEqual(['new', 'undeclared']);
    expect(tabs.going.map((o) => o.id).sort()).toEqual(['declared', 'fixed']);
    expect(tabs.sent.map((o) => o.id)).toEqual(['mine']);
    expect(tabs.saved).toEqual([]);
    expect(initial).toBe('answer');
  });

  it('αρχικό tab: το πρώτο που έχει κάτι', () => {
    expect(inviteTabs([r({ id: 'mine', is_organizer: true, my_rsvp: 'going' })], now).initial).toBe('sent');
    expect(inviteTabs([], now).initial).toBe('answer');
  });

  it('Αποθηκευμένα: ξεχωριστή λίστα, δεν επιλέγεται αυτόματα', () => {
    const saved = [r({ id: 'old', status: 'done', meet_at: '2026-11-01T10:00:00Z' })];
    const { tabs, initial } = inviteTabs([], now, saved);
    expect(tabs.saved.map((o) => o.id)).toEqual(['old']);
    expect(initial).toBe('answer');
  });
});
