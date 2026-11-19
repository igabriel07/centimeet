import { describe, expect, it } from 'vitest';
import { inServiceArea } from './cities';

describe('inServiceArea (πόλη ή νομός)', () => {
  it('Αθήνα: κέντρο, προάστια και Αττική', () => {
    expect(inServiceArea('athens', { lat: 37.9755, lng: 23.7348 })).toBe(true); // Σύνταγμα
    expect(inServiceArea('athens', { lat: 37.7158, lng: 24.0566 })).toBe(true); // Λαύριο
    expect(inServiceArea('athens', { lat: 37.9966, lng: 23.3453 })).toBe(true); // Μέγαρα
    expect(inServiceArea('athens', { lat: 38.3166, lng: 23.7987 })).toBe(true); // Ωρωπός
  });
  it('Αθήνα: όχι Χαλκίδα / Κόρινθος / Θεσσαλονίκη', () => {
    expect(inServiceArea('athens', { lat: 38.4636, lng: 23.5994 })).toBe(false);
    expect(inServiceArea('athens', { lat: 37.9386, lng: 22.9322 })).toBe(false);
    expect(inServiceArea('athens', { lat: 40.6401, lng: 22.9444 })).toBe(false);
  });
  it('Θεσσαλονίκη: χωριά του νομού', () => {
    expect(inServiceArea('thessaloniki', { lat: 40.7686, lng: 23.0646 })).toBe(true); // Λαγκαδάς
    expect(inServiceArea('thessaloniki', { lat: 40.8167, lng: 23.3556 })).toBe(true); // Σοχός
    expect(inServiceArea('thessaloniki', { lat: 40.7273, lng: 23.7106 })).toBe(true); // Ασπροβάλτα
    expect(inServiceArea('thessaloniki', { lat: 40.4378, lng: 22.9322 })).toBe(true); // Επανομή
  });
  it('Θεσσαλονίκη: όχι Χαλκιδική / Κιλκίς / Βέροια', () => {
    expect(inServiceArea('thessaloniki', { lat: 40.2394, lng: 23.2853 })).toBe(false); // Ν. Μουδανιά
    expect(inServiceArea('thessaloniki', { lat: 40.9939, lng: 22.8753 })).toBe(false); // Κιλκίς
    expect(inServiceArea('thessaloniki', { lat: 40.5236, lng: 22.2028 })).toBe(false); // Βέροια
  });
});
