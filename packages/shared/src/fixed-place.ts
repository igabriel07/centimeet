// «Διαλέγω εγώ το μέρος»: ο διοργανωτής ορίζει το μαγαζί/σημείο από πριν — κανείς δεν δηλώνει αφετηρία.
import { z } from 'zod';
import { ALL_CATEGORIES, isValidCategory, type ActivityCategory } from './categories';
import { bayesianRating } from './fairness';
import { ACTIVITIES, CITIES, type Venue } from './types';

/** fair = δίκαιο σημείο · fixed = διαλέγω εγώ το μέρος · none = χωρίς μέρος (απλώς συνάντηση) */
export const PLACE_MODES = ['fair', 'fixed', 'none'] as const;
export type PlaceMode = (typeof PLACE_MODES)[number];

/** GET /v1/places/popular */
export const PopularVenuesRequestSchema = z
  .object({
    city: z.enum(CITIES),
    activity: z.enum(ACTIVITIES).exclude(['spot']),
    category: z.enum(ALL_CATEGORIES as [ActivityCategory, ...ActivityCategory[]]).optional(),
  })
  .refine((r) => isValidCategory(r.activity, r.category), { message: 'category does not belong to activity', path: ['category'] });
export type PopularVenuesRequest = z.infer<typeof PopularVenuesRequestSchema>;
export type PopularVenuesResponse = { venues: Venue[] };

/** Πόσα δημοφιλή δείχνουμε */
export const POPULAR_MAX = 10;

/** Δημοφιλή = υψηλή βαθμολογία ΚΑΙ πολλές κριτικές (bayesian), μόνο ανοιχτά μαγαζιά, χωρίς διπλά */
export function rankPopular(venues: Venue[], max = POPULAR_MAX): Venue[] {
  const seen = new Set<string>();
  return venues
    .filter((v) => (!v.businessStatus || v.businessStatus === 'OPERATIONAL') && !seen.has(v.id) && seen.add(v.id))
    .sort((a, b) => bayesianRating(b.rating, b.ratingCount) - bayesianRating(a.rating, a.ratingCount))
    .slice(0, max);
}

/** Το μέρος που αποθηκεύεται στην έξοδο (outings.chosen_venue) */
export const FixedVenueSchema = z.object({
  id: z.string().max(300).optional(),
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  rating: z.number().optional(),
  ratingCount: z.number().optional(),
});
export type FixedVenue = z.infer<typeof FixedVenueSchema>;
