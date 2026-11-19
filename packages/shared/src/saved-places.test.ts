import { describe, expect, it } from 'vitest';
import { cleanLabel, findSaved, savedToPlace } from './saved-places';

const home = { id: '1', label: 'Σπίτι', lat: 37.98, lng: 23.73 };
const work = { id: '2', label: 'Δουλειά', lat: 37.99, lng: 23.74 };

describe('findSaved', () => {
  it('βρίσκει την κοντινή (≤40μ)', () => {
    expect(findSaved([home, work], { lat: 37.9802, lng: 23.7301 })?.id).toBe('1');
  });
  it('μακριά → null', () => {
    expect(findSaved([home, work], { lat: 37.985, lng: 23.735 })).toBeNull();
  });
  it('διαλέγει την πιο κοντινή', () => {
    const near = { ...home, id: '3', lat: 37.98001 };
    expect(findSaved([home, near], { lat: 37.98002, lng: 23.73 })?.id).toBe('3');
  });
});

describe('savedToPlace / cleanLabel', () => {
  it('μετατροπή σε ResolvedPlace', () => {
    expect(savedToPlace({ id: 'x', label: 'L', name: 'Σόλωνος 10', address: null, place_id: null, lat: 1, lng: 2 })).toEqual({
      placeId: 'saved:x',
      name: 'Σόλωνος 10',
      address: undefined,
      location: { lat: 1, lng: 2 },
    });
  });
  it('ετικέτα', () => {
    expect(cleanLabel('   ')).toBeNull();
    expect(cleanLabel('  Σπίτι   μου ')).toBe('Σπίτι μου');
    expect(cleanLabel('x'.repeat(60))).toHaveLength(40);
  });
});
