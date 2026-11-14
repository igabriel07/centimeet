import { z } from 'zod';
import { ACTIVITIES, CITIES, TRANSPORT_MODES } from './types';

/** Μέγιστο μέγεθος παρέας */
export const MAX_PARTICIPANTS = 20;

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const ParticipantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  origin: LatLngSchema,
  mode: z.enum(TRANSPORT_MODES),
});

export const SuggestRequestSchema = z.object({
  city: z.enum(CITIES),
  activity: z.enum(ACTIVITIES),
  /** ISO ώρα ΣΥΝΑΝΤΗΣΗΣ (άφιξης στο μαγαζί) – προαιρετική. Χωρίς αυτή = «τώρα». */
  departAt: z.iso.datetime({ offset: true }).optional(),
  participants: z.array(ParticipantSchema).min(2).max(MAX_PARTICIPANTS),
  filters: z
    .object({
      /** Μόνο ανοιχτά την ώρα της συνάντησης (προεπιλογή: true) */
      openNow: z.boolean().optional(),
      minRating: z.number().min(0).max(5).optional(),
      maxPriceLevel: z.number().int().min(0).max(4).optional(),
    })
    .optional(),
});
export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

export const VenuePlanRequestSchema = z.object({
  city: z.enum(CITIES),
  departAt: z.iso.datetime({ offset: true }).optional(),
  venueId: z.string().min(1),
  participants: z.array(ParticipantSchema).min(1).max(MAX_PARTICIPANTS),
});
export type VenuePlanRequest = z.infer<typeof VenuePlanRequestSchema>;

export const TravelEstimateSchema = z.object({
  participantId: z.string().min(1),
  durationMin: z.number().min(0).max(24 * 60),
  distanceKm: z.number().min(0).max(1000),
  costEur: z.number().min(0).max(1000),
});

/** «Δες μαγαζιά εδώ» για εναλλακτική περιοχή (οι χρόνοι έρχονται από την αρχική απάντηση) */
export const AreaVenuesRequestSchema = SuggestRequestSchema.extend({
  area: z.object({
    id: z.string().min(1).max(64),
    label: z.string().max(80),
    center: LatLngSchema,
    travel: z.array(TravelEstimateSchema).min(1).max(MAX_PARTICIPANTS),
  }),
  /** Μαγαζιά που εμφανίζονται ήδη (να μην ξαναβγούν) */
  excludeIds: z.array(z.string().max(300)).max(100).optional(),
});
export type AreaVenuesRequest = z.infer<typeof AreaVenuesRequestSchema>;
