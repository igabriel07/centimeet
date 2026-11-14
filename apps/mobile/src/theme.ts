/**
 * 🎨 Η εμφάνιση του CentiMeet — ΟΛΗ σε αυτό το αρχείο.
 *
 * Αλλάζεις μια τιμή εδώ → αλλάζει παντού (κουμπιά, κάρτες, χάρτες, tabs).
 * Με το Expo ανοιχτό βλέπεις την αλλαγή στο κινητό σε 1–2″.
 *
 * Εικονίδιο & splash: apps/mobile/assets/ (βλ. scripts/make-icons.py για να τα ξαναφτιάξεις)
 */

/** Χρώματα για φωτεινή και σκοτεινή λειτουργία (ακολουθεί τη ρύθμιση του κινητού) */
export const palette = {
  light: {
    /** Φόντο οθονών */
    bg: '#F7F6F2',
    /** Κάρτες, πεδία, tab bar */
    card: '#FFFFFF',
    text: '#1B1B1F',
    /** Δευτερεύον κείμενο */
    muted: '#6B6B76',
    border: '#E4E2DC',
    /** Χρώμα της μάρκας: κουμπιά, επιλεγμένα chips, links */
    primary: '#E4572E',
    /** Κείμενο πάνω στο primary */
    primaryText: '#FFFFFF',
    /** Θετικό (✓ δήλωσε, score) */
    good: '#2E9E5B',
    /** Προσοχή (π.χ. «ίσως έχει κόσμο») */
    warn: '#C77700',
    danger: '#C62828',
    /** Φόντο μη επιλεγμένων chips / δευτερευόντων κουμπιών */
    chip: '#EFEDE7',
    /** Pins των ατόμων στον χάρτη */
    person: '#3B6FE0',
    /** Pin του σημείου συνάντησης / μαγαζιών */
    venue: '#E4572E',
  },
  dark: {
    bg: '#121214',
    card: '#1E1E22',
    text: '#F2F2F4',
    muted: '#A0A0AA',
    border: '#2C2C32',
    primary: '#FF6B3D',
    primaryText: '#FFFFFF',
    good: '#44C07A',
    warn: '#FFB74D',
    danger: '#EF5350',
    chip: '#2A2A30',
    person: '#6C93F0',
    venue: '#FF6B3D',
  },
} as const;

export type Colors = { [K in keyof (typeof palette)['light']]: string };

/**
 * Γραμματοσειρά (πρέπει να έχει ελληνικά). Για αλλαγή: εγκατέστησε άλλη από @expo-google-fonts
 * (π.χ. @expo-google-fonts/commissioner) και άλλαξε εδώ τα ονόματα + το FONT_FILES.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Μεγέθη κειμένου */
export const typeScale = {
  h1: 26,
  title: 17,
  body: 15,
  small: 13,
  label: 13,
  button: 16,
  input: 16,
} as const;

/** Στρογγυλέματα: μικρότερα = πιο «αυστηρό», μεγαλύτερα = πιο «παιχνιδιάρικο» */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  button: 14,
  pill: 999,
} as const;

/** Αποστάσεις */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

/** Από αυτό το πλάτος και πάνω: διάταξη tablet (λίστα + χάρτης δίπλα-δίπλα) */
export const TABLET_MIN_WIDTH = 768;
