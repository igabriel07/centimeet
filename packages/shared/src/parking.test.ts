import { describe, expect, it } from 'vitest';
import { filterHistory, OutingHistoryRowsSchema, type OutingHistoryRow } from './outings';
import {
  addParkedSpot,
  googleMapsUrl,
  PARKING_HISTORY_MAX,
  parseParkedSpots,
  removeParkedSpot,
  type ParkedSpot,
} from './parking';

const syntagma = { lat: 37.9755, lng: 23.7348, name: 'Σύνταγμα', address: 'Πλατεία Συντάγματος, Αθήνα' };
const monastiraki = { lat: 37.9761, lng: 23.7255, name: 'Μοναστηράκι' };
const at = (iso: string) => new Date(iso);

describe('Πού πάρκαρα', () => {
  it('η νεότερη θέση μπαίνει πρώτη, με ώρα αποθήκευσης', () => {
    let list: ParkedSpot[] = [];
    list = addParkedSpot(list, syntagma, at('2026-11-15T10:00:00Z'), 'a');
    list = addParkedSpot(list, monastiraki, at('2026-11-15T12:00:00Z'), 'b');
    expect(list.map((s) => s.name)).toEqual(['Μοναστηράκι', 'Σύνταγμα']);
    expect(list[0]!.savedAt).toBe('2026-11-15T12:00:00.000Z');
    expect(list[1]!.address).toBe('Πλατεία Συντάγματος, Αθήνα');
  });

  it('ίδια θέση με την τελευταία (διπλό πάτημα) → ανανεώνεται, όχι διπλή εγγραφή', () => {
    let list = addParkedSpot([], syntagma, at('2026-11-15T10:00:00Z'), 'a');
    list = addParkedSpot(list, { ...syntagma, lat: syntagma.lat + 0.00005 }, at('2026-11-15T10:01:00Z'), 'b');
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('b');
  });

  it('ίδιο σημείο με παλιότερη (όχι την τελευταία) θέση → νέα εγγραφή στο ιστορικό', () => {
    let list = addParkedSpot([], syntagma, at('2026-11-14T10:00:00Z'), 'a');
    list = addParkedSpot(list, monastiraki, at('2026-11-14T12:00:00Z'), 'b');
    list = addParkedSpot(list, syntagma, at('2026-11-15T10:00:00Z'), 'c');
    expect(list.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it(`κρατά έως ${PARKING_HISTORY_MAX} θέσεις`, () => {
    let list: ParkedSpot[] = [];
    for (let i = 0; i < PARKING_HISTORY_MAX + 5; i++) {
      list = addParkedSpot(list, { lat: 37.9 + i * 0.01, lng: 23.7, name: `Θέση ${i}` }, at(`2026-11-15T10:${String(i).padStart(2, '0')}:00Z`), `id${i}`);
    }
    expect(list).toHaveLength(PARKING_HISTORY_MAX);
    expect(list[0]!.name).toBe(`Θέση ${PARKING_HISTORY_MAX + 4}`);
  });

  it('κενό όνομα → συντεταγμένες· ίδια διεύθυνση με το όνομα δεν αποθηκεύεται δύο φορές', () => {
    const [s] = addParkedSpot([], { lat: 37.97551, lng: 23.73481, name: '  ', address: '  ' }, at('2026-11-15T10:00:00Z'));
    expect(s!.name).toBe('37.97551, 23.73481');
    const [d] = addParkedSpot([], { ...monastiraki, address: 'Μοναστηράκι' }, at('2026-11-15T10:00:00Z'));
    expect(d!.address).toBeUndefined();
  });

  it('διαγραφή', () => {
    const list = addParkedSpot(addParkedSpot([], syntagma, at('2026-11-15T10:00:00Z'), 'a'), monastiraki, at('2026-11-15T11:00:00Z'), 'b');
    expect(removeParkedSpot(list, 'a').map((s) => s.id)).toEqual(['b']);
  });

  it('ανάγνωση: αγνοεί χαλασμένα δεδομένα και ταξινομεί', () => {
    expect(parseParkedSpots(null)).toEqual([]);
    expect(parseParkedSpots('not json')).toEqual([]);
    expect(parseParkedSpots('{"a":1}')).toEqual([]);
    const raw = JSON.stringify([
      { id: 'old', lat: 37.9, lng: 23.7, name: 'Παλιά', savedAt: '2026-11-01T10:00:00Z' },
      { id: 'bad', lat: 'x', lng: 23.7, name: 'Χαλασμένη', savedAt: '2026-11-02T10:00:00Z' },
      { id: 'new', lat: 37.95, lng: 23.72, name: 'Νέα', savedAt: '2026-11-10T10:00:00Z' },
    ]);
    expect(parseParkedSpots(raw).map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('link Google Maps με ακριβείς συντεταγμένες', () => {
    expect(googleMapsUrl({ lat: 37.9755, lng: 23.7348 })).toBe('https://www.google.com/maps/search/?api=1&query=37.975500,23.734800');
  });
});

describe('ιστορικό εξόδων', () => {
  const row = (id: string, activity: OutingHistoryRow['activity']): OutingHistoryRow => ({
    id,
    title: null,
    activity,
    category: null,
    city: 'athens',
    meet_at: null,
    status: 'done',
    venue_name: null,
    is_organizer: false,
    created_at: '2026-11-10T10:00:00Z',
  });
  const rows = [row('1', 'coffee'), row('2', 'food'), row('3', 'coffee')];

  it('φίλτρο ανά δραστηριότητα (π.χ. μόνο καφές)', () => {
    expect(filterHistory(rows, 'coffee').rows.map((r) => r.id)).toEqual(['1', '3']);
    expect(filterHistory(rows).rows).toHaveLength(3);
  });
  it('τα chips δείχνουν μόνο δραστηριότητες που υπάρχουν στο ιστορικό', () => {
    expect(filterHistory(rows).activities).toEqual(['coffee', 'food']);
  });
  it('το σχήμα δέχεται γραμμή της βάσης', () => {
    expect(OutingHistoryRowsSchema.safeParse(rows).success).toBe(true);
  });
});
