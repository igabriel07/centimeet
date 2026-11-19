/**
 * Προσκλήσεις σε νέα έξοδο: φίλοι (μεμονωμένα) + ομάδες φίλων.
 * Ένας φίλος μπορεί να είναι προσκεκλημένος και μεμονωμένα και μέσω μίας ή περισσότερων ομάδων·
 * φεύγει από την έξοδο μόνο όταν δεν τον «κρατά» τίποτα από αυτά.
 */
import { z } from 'zod';

export const InviteProfileSchema = z.object({ id: z.string(), username: z.string(), display_name: z.string() });
export type InviteProfile = z.infer<typeof InviteProfileSchema>;

/** Γραμμή από my_groups() */
export const FriendGroupSchema = z.object({ id: z.string(), name: z.string(), members: z.array(InviteProfileSchema) });
export type FriendGroup = z.infer<typeof FriendGroupSchema>;
export const FriendGroupsSchema = z.array(FriendGroupSchema);

export type Invitee = {
  userId: string;
  name: string;
  /** Επιλέχθηκε μεμονωμένα από τους φίλους */
  direct: boolean;
  /** Ομάδες (ids) μέσω των οποίων προσκλήθηκε */
  groups: string[];
};

/**
 * Νέα λίστα προσκεκλημένων από την πλήρη επιλογή (μεμονωμένοι φίλοι + ομάδες).
 * Κρατά τη σειρά όσων υπήρχαν ήδη· οι νέοι μπαίνουν στο τέλος. Ο εαυτός μου (me) εξαιρείται.
 */
export function applyInvites(current: Invitee[], direct: InviteProfile[], groups: FriendGroup[], me?: string): Invitee[] {
  const names = new Map<string, string>();
  const directIds = new Set<string>();
  const viaGroups = new Map<string, string[]>();
  for (const f of direct) {
    directIds.add(f.id);
    names.set(f.id, f.display_name);
  }
  for (const g of groups) {
    for (const m of g.members) {
      viaGroups.set(m.id, [...(viaGroups.get(m.id) ?? []), g.id]);
      if (!names.has(m.id)) names.set(m.id, m.display_name);
    }
  }
  const make = (userId: string, fallbackName = ''): Invitee => ({
    userId,
    name: names.get(userId) ?? fallbackName,
    direct: directIds.has(userId),
    groups: viaGroups.get(userId) ?? [],
  });
  const kept = current.map((c) => make(c.userId, c.name)).filter((c) => c.direct || c.groups.length > 0);
  const seen = new Set(kept.map((c) => c.userId));
  const added = [...names.keys()].filter((id) => !seen.has(id)).map((id) => make(id));
  return [...kept, ...added].filter((c) => c.userId !== me);
}

/** Τα μέλη μιας ομάδας που ΔΕΝ είναι ήδη προσκεκλημένα (για «+3 νέοι» στη λίστα ομάδων) */
export function newMembers(group: FriendGroup, invited: Pick<Invitee, 'userId'>[]): InviteProfile[] {
  const ids = new Set(invited.map((i) => i.userId));
  return group.members.filter((m) => !ids.has(m.id));
}
