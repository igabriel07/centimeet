/**
 * Πώς ψάχνουμε κάθε δραστηριότητα / κατηγορία στο Google και στο OpenStreetMap.
 *
 * Google:
 *  - `types`: Nearby Search με includedTypes (Table A του Places API New) — προτιμάται.
 *  - `text`:  Text Search, για ό,τι δεν έχει δικό του τύπο (σουβλάκι, λουκουμάδες, θερινό σινεμά…).
 *             Χρεώνεται σε άλλο SKU (Text Search Enterprise + Atmosphere, 1.000 δωρεάν/μήνα),
 *             γι' αυτό μετριέται χωριστά (`text_search`).
 * OSM (εφεδρικά, όταν εξαντληθεί το δωρεάν όριο Google): φίλτρα Overpass. Αν μια κατηγορία δεν
 * βρει τίποτα (οι ετικέτες cuisine δεν είναι πάντα συμπληρωμένες), πέφτουμε στη δραστηριότητα.
 */
import type { ActivityCategory, VenueActivity } from '@centimeet/shared';

export type GoogleSearch = { types: string[] } | { text: string };

export const ACTIVITY_GOOGLE: Record<VenueActivity, { types: string[] }> = {
  coffee: { types: ['cafe', 'coffee_shop'] },
  food: { types: ['restaurant'] },
  drinks: { types: ['bar', 'pub', 'wine_bar'] },
  cinema: { types: ['movie_theater'] },
  theater: { types: ['performing_arts_theater'] },
};

export const CATEGORY_GOOGLE: Record<ActivityCategory, GoogleSearch> = {
  // φαγητό
  pizza: { types: ['pizza_restaurant'] },
  souvlaki: { text: 'σουβλάκι' },
  burger: { types: ['hamburger_restaurant'] },
  taverna: { types: ['greek_restaurant'] },
  seafood: { types: ['seafood_restaurant'] },
  italian: { types: ['italian_restaurant'] },
  sushi: { types: ['sushi_restaurant', 'japanese_restaurant'] },
  asian: { types: ['asian_restaurant', 'chinese_restaurant', 'thai_restaurant', 'indian_restaurant', 'vietnamese_restaurant'] },
  vegetarian: { types: ['vegetarian_restaurant', 'vegan_restaurant'] },
  // ποτό
  cocktail: { text: 'cocktail bar' },
  wine: { types: ['wine_bar'] },
  beer: { types: ['pub'] },
  bar: { types: ['bar'] },
  club: { types: ['night_club'] },
  // σινεμά
  indoor: { types: ['movie_theater'] },
  summer: { text: 'θερινός κινηματογράφος' },
  // θέατρο
  stage: { types: ['performing_arts_theater'] },
  standup: { text: 'stand up comedy' },
  open_air: { text: 'θερινό θέατρο' },
  kids: { text: 'παιδικό θέατρο' },
  // φαγητό: γλυκά
  pastry: { types: ['dessert_shop', 'confectionery'] },
  icecream: { types: ['ice_cream_shop'] },
  loukoumades: { text: 'λουκουμάδες' },
  crepes: { text: 'κρέπες' },
  // φαγητό: πρωινό / brunch
  brunch: { types: ['brunch_restaurant'] },
  breakfast: { types: ['breakfast_restaurant'] },
  bougatsa: { text: 'μπουγάτσα' },
  pancakes: { text: 'pancakes' },
  bakery: { types: ['bakery'] },
};

export function googleSearchFor(activity: VenueActivity, category?: ActivityCategory): GoogleSearch {
  return category ? CATEGORY_GOOGLE[category] : ACTIVITY_GOOGLE[activity];
}

export const usesTextSearch = (activity: VenueActivity, category?: ActivityCategory) => 'text' in googleSearchFor(activity, category);

export const ACTIVITY_OSM: Record<VenueActivity, string[]> = {
  coffee: ['[amenity=cafe]'],
  food: ['[amenity=restaurant]', '[amenity=fast_food]'],
  drinks: ['[amenity=bar]', '[amenity=pub]'],
  cinema: ['[amenity=cinema]'],
  theater: ['[amenity=theatre]'],
};

const EAT = '[amenity~"^(restaurant|fast_food)$"]';
const CAFE_OR_EAT = '[amenity~"^(cafe|restaurant|fast_food)$"]';

export const CATEGORY_OSM: Record<ActivityCategory, string[]> = {
  pizza: [`${EAT}[cuisine~"pizza"]`],
  souvlaki: [`${EAT}[cuisine~"souvlaki|kebab|gyros|grill"]`],
  burger: [`${EAT}[cuisine~"burger"]`],
  taverna: ['[amenity=restaurant][cuisine~"greek|taverna|meze"]'],
  seafood: [`${EAT}[cuisine~"seafood|fish"]`],
  italian: [`${EAT}[cuisine~"italian|pasta"]`],
  sushi: [`${EAT}[cuisine~"sushi|japanese"]`],
  asian: [`${EAT}[cuisine~"asian|chinese|thai|vietnamese|indian|korean"]`],
  vegetarian: [`${CAFE_OR_EAT}["diet:vegetarian"~"yes|only"]`, `${CAFE_OR_EAT}["diet:vegan"~"yes|only"]`],
  cocktail: ['[amenity=bar]["drink:cocktail"~"yes|served"]', '[amenity=bar][cocktails=yes]'],
  wine: ['[amenity~"^(bar|pub)$"]["drink:wine"~"yes|served"]', '[amenity=bar][cuisine~"wine"]'],
  beer: ['[amenity=pub]', '[amenity=biergarten]'],
  bar: ['[amenity=bar]'],
  club: ['[amenity=nightclub]'],
  indoor: ['[amenity=cinema]'],
  summer: ['[amenity=cinema][open_air=yes]', '[amenity=cinema]["cinema:type"~"open_air|outdoor"]'],
  stage: ['[amenity=theatre]'],
  standup: ['[amenity=theatre]["theatre:genre"~"comedy|stand_up"]', '[amenity=nightclub][name~"[Cc]omedy"]'],
  open_air: ['[amenity=theatre][open_air=yes]', '[amenity=theatre]["theatre:type"~"amphi|open_air"]'],
  kids: ['[amenity=theatre]["theatre:genre"~"children|puppet"]'],
  pastry: ['[shop=pastry]', '[shop=confectionery]'],
  icecream: ['[amenity=ice_cream]', '[shop=ice_cream]'],
  loukoumades: [`${CAFE_OR_EAT}[cuisine~"loukoumades|donut"]`, '[shop=pastry][name~"ουκουμ"]'],
  crepes: [`${CAFE_OR_EAT}[cuisine~"crepe"]`],
  brunch: ['[amenity~"^(cafe|restaurant)$"][cuisine~"brunch"]'],
  breakfast: ['[amenity~"^(cafe|restaurant)$"][cuisine~"breakfast"]'],
  bougatsa: [`${CAFE_OR_EAT}[cuisine~"bougatsa|pie"]`, '[shop~"^(bakery|pastry)$"][name~"πουγάτσ|ΠΟΥΓΑΤΣ"]'],
  pancakes: ['[amenity~"^(cafe|restaurant)$"][cuisine~"pancake|crepe"]'],
  bakery: ['[shop=bakery]'],
};
