/**
 * Κατηγορίες ανά δραστηριότητα (π.χ. Φαγητό → πίτσα, σουβλάκι…).
 * Τα ids είναι μοναδικά σε όλες τις δραστηριότητες. Η αντιστοίχιση σε Google/OSM είναι στο API
 * (apps/api/src/providers/categories.ts), τα κείμενα στο i18n της εφαρμογής (category.<id>).
 */
import type { Activity } from './types';

export const ACTIVITY_CATEGORIES = {
  spot: [],
  coffee: [], // χωρίς κατηγορίες: κατευθείαν, χωρίς pop-up
  // Ενιαίο «Φαγητό»: εστιατόρια + πρωινό/brunch + γλυκά
  food: [
    'pizza', 'souvlaki', 'burger', 'taverna', 'seafood', 'italian', 'sushi', 'asian', 'vegetarian',
    'brunch', 'breakfast', 'bougatsa', 'pancakes', 'bakery',
    'pastry', 'icecream', 'loukoumades', 'crepes',
  ],
  drinks: ['cocktail', 'wine', 'beer', 'bar', 'club'],
  cinema: ['indoor', 'summer'],
  theater: ['stage', 'standup', 'open_air', 'kids'],
} as const satisfies Record<Activity, readonly string[]>;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[Activity][number];

export const ALL_CATEGORIES = Object.values(ACTIVITY_CATEGORIES).flat() as ActivityCategory[];

export const CATEGORY_EMOJI: Record<ActivityCategory, string> = {
  pizza: '🍕',
  souvlaki: '🥙',
  burger: '🍔',
  taverna: '🥘',
  seafood: '🐟',
  italian: '🍝',
  sushi: '🍣',
  asian: '🥢',
  vegetarian: '🥗',
  cocktail: '🍸',
  wine: '🍷',
  beer: '🍺',
  bar: '🥃',
  club: '🎶',
  indoor: '🎬',
  summer: '🌙',
  stage: '🎭',
  standup: '🎤',
  open_air: '🏛️',
  kids: '🧸',
  pastry: '🍰',
  icecream: '🍨',
  loukoumades: '🍯',
  crepes: '🍫',
  brunch: '🍳',
  breakfast: '🥐',
  bougatsa: '🥧',
  pancakes: '🥞',
  bakery: '🥖',
};

export function categoriesFor(activity: Activity): readonly ActivityCategory[] {
  return ACTIVITY_CATEGORIES[activity];
}

/** Η κατηγορία ανήκει στη δραστηριότητα; (κενή κατηγορία = «Όλα», πάντα έγκυρη) */
export function isValidCategory(activity: Activity, category: string | null | undefined): boolean {
  if (category == null || category === '') return true;
  return (ACTIVITY_CATEGORIES[activity] as readonly string[]).includes(category);
}
