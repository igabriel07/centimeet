import { describe, expect, it } from 'vitest';
import { PopularVenuesRequestSchema, rankPopular, type Venue } from './index';

const v = (id: string, rating?: number, ratingCount?: number, extra: Partial<Venue> = {}): Venue => ({
  id,
  name: id,
  location: { lat: 37.97, lng: 23.73 },
  rating,
  ratingCount,
  ...extra,
});

describe('δημοφιλή μαγαζιά', () => {
  it('βαθμολογία + πλήθος κριτικών· όχι κλειστά, όχι διπλά', () => {
    const out = rankPopular([
      v('tiny', 5, 3),
      v('big', 4.6, 2000),
      v('closed', 4.9, 5000, { businessStatus: 'CLOSED_PERMANENTLY' }),
      v('big', 4.6, 2000),
      v('mid', 4.4, 300),
    ]);
    expect(out.map((x) => x.id)).toEqual(['big', 'mid', 'tiny']);
  });

  it('όριο αποτελεσμάτων', () => {
    expect(rankPopular(Array.from({ length: 20 }, (_, i) => v(`v${i}`, 4, 100)), 5)).toHaveLength(5);
  });

  it('ελέγχει ότι η κατηγορία ανήκει στη δραστηριότητα· όχι «Σημείο»', () => {
    expect(PopularVenuesRequestSchema.safeParse({ city: 'athens', activity: 'food', category: 'pizza' }).success).toBe(true);
    expect(PopularVenuesRequestSchema.safeParse({ city: 'athens', activity: 'coffee', category: 'pizza' }).success).toBe(false);
    expect(PopularVenuesRequestSchema.safeParse({ city: 'athens', activity: 'spot' }).success).toBe(false);
  });
});
