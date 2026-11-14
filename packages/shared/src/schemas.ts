import { z } from 'zod';
import { ACTIVITIES, CITIES, TRANSPORT_MODES } from './types';

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
  /** ISO ώρα αναχώρησης/συνάντησης – προαιρετική */
  departAt: z.iso.datetime({ offset: true }).optional(),
  participants: z.array(ParticipantSchema).min(2).max(12),
  filters: z
    .object({
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
  participants: z.array(ParticipantSchema).min(1).max(12),
});
export type VenuePlanRequest = z.infer<typeof VenuePlanRequestSchema>;
