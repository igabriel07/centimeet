/**
 * Προφίλ κόστους του αλγορίθμου.
 *
 *  lean   (Φάση 1, ~300 χρήστες): χωράει στα ΔΩΡΕΑΝ μηνιαία όρια του Google (~600 αναζητήσεις/μήνα)
 *  growth (Φάση 2): πληρέστερα αποτελέσματα, ~$0.40–0.55 ανά αναζήτηση 4 ατόμων
 *
 * Ο αλγόριθμος είναι ίδιος· αλλάζει μόνο πόσες κλήσεις Google κάνει.
 */
export type CostMode = 'lean' | 'growth';

export type EngineConfig = {
  /** Πόσα υποψήφια σημεία στέλνουμε στο Routes API (άτομα × σημεία = χρεώσιμα στοιχεία) */
  maxRealPoints: number;
  /** Ακτίνες αναζήτησης μαγαζιών γύρω από το κύριο σημείο (μία κλήση Places ανά ακτίνα) */
  primaryRadiiM: number[];
  /** …και γύρω από τις εναλλακτικές */
  altRadiiM: number[];
  /** Μαγαζιά των εναλλακτικών αμέσως (true) ή «κατά παραγγελία» με POST /v1/area-venues (false) */
  alternativesWithVenues: boolean;
};

export const ENGINE_PROFILES: Record<CostMode, EngineConfig> = {
  lean: {
    maxRealPoints: 5,
    primaryRadiiM: [300, 600],
    altRadiiM: [600],
    alternativesWithVenues: false,
  },
  growth: {
    maxRealPoints: 8,
    primaryRadiiM: [300, 500, 800],
    altRadiiM: [500, 800],
    alternativesWithVenues: true,
  },
};
