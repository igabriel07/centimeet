import { CITY_CONFIG, haversineKm, weightedCentroid, type CityId, type Participant, type SuggestionArea } from '@centimeet/shared';

/**
 * Υποψήφιες περιοχές:
 *  1. Κύρια: το σταθμισμένο (κατά μέσο) κέντρο της παρέας
 *  2. Εναλλακτικές: οι πλησιέστεροι γνωστοί κόμβοι (πλατείες/σταθμοί) που απέχουν
 *     αρκετά από την κύρια και μεταξύ τους, ώστε να δίνουν πραγματικά «άλλη» επιλογή.
 */
export function candidateAreas(city: CityId, participants: Participant[], alternatives = 2): SuggestionArea[] {
  const cfg = CITY_CONFIG[city];
  const center = weightedCentroid(participants);

  const nearestHub = [...cfg.hubs].sort(
    (a, b) => haversineKm(a.location, center) - haversineKm(b.location, center),
  )[0];
  const primaryLabel =
    nearestHub && haversineKm(nearestHub.location, center) < 1.0 ? nearestHub.label : 'Κέντρο παρέας';

  const areas: SuggestionArea[] = [{ id: 'primary', label: primaryLabel, center, isPrimary: true }];

  const MIN_SEPARATION_KM = 1.2;
  const sorted = [...cfg.hubs].sort((a, b) => haversineKm(a.location, center) - haversineKm(b.location, center));
  for (const hub of sorted) {
    if (areas.length > alternatives) break;
    const farEnough = areas.every((a) => haversineKm(a.center, hub.location) >= MIN_SEPARATION_KM);
    if (farEnough) areas.push({ id: hub.id, label: hub.label, center: hub.location, isPrimary: false });
  }
  return areas;
}

/** Ελέγχει ότι όλες οι αφετηρίες είναι μέσα στην περιοχή εξυπηρέτησης */
export function outOfServiceArea(city: CityId, participants: Participant[]): Participant[] {
  const cfg = CITY_CONFIG[city];
  return participants.filter((p) => haversineKm(p.origin, cfg.center) > cfg.serviceRadiusKm);
}
