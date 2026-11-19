import { describe, expect, it } from 'vitest';
import { applyInvites, FriendGroupsSchema, newMembers, type FriendGroup, type InviteProfile } from './invites';

const p = (id: string, name = id.toUpperCase()): InviteProfile => ({ id, username: id, display_name: name });
const anna = p('anna', 'Άννα');
const babis = p('babis', 'Μπάμπης');
const chloe = p('chloe', 'Χλόη');
const dimos = p('dimos', 'Δήμος');
const school: FriendGroup = { id: 'g1', name: 'Σχολή', members: [babis, chloe] };
const gym: FriendGroup = { id: 'g2', name: 'Γυμναστήριο', members: [chloe, dimos] };

describe('προσκλήσεις: φίλοι & ομάδες', () => {
  it('μεμονωμένοι φίλοι', () => {
    const r = applyInvites([], [anna, babis], []);
    expect(r).toEqual([
      { userId: 'anna', name: 'Άννα', direct: true, groups: [] },
      { userId: 'babis', name: 'Μπάμπης', direct: true, groups: [] },
    ]);
  });

  it('ομάδα → όλα τα μέλη, χωρίς διπλούς όταν κάποιος είναι σε δύο ομάδες', () => {
    const r = applyInvites([], [], [school, gym]);
    expect(r.map((i) => i.userId)).toEqual(['babis', 'chloe', 'dimos']);
    expect(r.find((i) => i.userId === 'chloe')!.groups).toEqual(['g1', 'g2']);
  });

  it('φίλος και μεμονωμένα και μέσω ομάδας: μένει όταν αφαιρεθεί από το ένα', () => {
    let r = applyInvites([], [babis], [school]);
    expect(r.find((i) => i.userId === 'babis')).toMatchObject({ direct: true, groups: ['g1'] });
    r = applyInvites(r, [], [school]); // − από τους φίλους
    expect(r.find((i) => i.userId === 'babis')).toMatchObject({ direct: false, groups: ['g1'] });
    r = applyInvites(r, [], []); // − και η ομάδα
    expect(r).toEqual([]);
  });

  it('αφαίρεση ομάδας κρατά όσους ανήκουν και σε άλλη ομάδα', () => {
    const r = applyInvites(applyInvites([], [], [school, gym]), [], [gym]);
    expect(r.map((i) => i.userId)).toEqual(['chloe', 'dimos']);
  });

  it('κρατά τη σειρά όσων υπήρχαν, οι νέοι στο τέλος', () => {
    const first = applyInvites([], [dimos, anna], []);
    const r = applyInvites(first, [anna, dimos, babis], []);
    expect(r.map((i) => i.userId)).toEqual(['dimos', 'anna', 'babis']);
  });

  it('ο εαυτός μου δεν προσκαλείται ποτέ', () => {
    expect(applyInvites([], [anna], [school], 'babis').map((i) => i.userId)).toEqual(['anna', 'chloe']);
  });

  it('νέα μέλη ομάδας (όσοι δεν είναι ήδη προσκεκλημένοι)', () => {
    expect(newMembers(gym, [{ userId: 'chloe' }]).map((m) => m.id)).toEqual(['dimos']);
  });

  it('το σχήμα δέχεται απάντηση του my_groups()', () => {
    expect(FriendGroupsSchema.safeParse([{ id: 'g', name: 'Σχολή', members: [anna] }]).success).toBe(true);
  });
});
