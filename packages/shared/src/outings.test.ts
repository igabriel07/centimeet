import { describe, expect, it } from 'vitest';
import { isPending, MyOutingRowSchema, OutingParticipantRowSchema, outingToParticipants, type OutingParticipantRow } from './index';

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
