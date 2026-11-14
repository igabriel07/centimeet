/**
 * Κείμενα κοινοποίησης & deep links (Viber, WhatsApp, Messenger, SMS, email).
 * Χωρίς εξαρτήσεις React Native ώστε να τεστάρονται και να τα χρησιμοποιεί και το backend.
 */
import type { ParticipantPlan, Venue } from './types';

const MODE_LABEL: Record<ParticipantPlan['mode'], string> = {
  car: '🚗 Αυτοκίνητο',
  motorbike: '🏍️ Μηχανή',
  transit: '🚇 Συγκοινωνίες',
  walk: '🚶 Με τα πόδια',
  bike: '🚲 Ποδήλατο',
  taxi: '🚕 Ταξί',
};

export function buildPersonalMessage(opts: {
  venue: Venue;
  plan: ParticipantPlan;
  whenLabel?: string;
  shareUrl?: string;
}): string {
  const { venue, plan, whenLabel, shareUrl } = opts;
  const lines = [
    `Γεια ${plan.name}! 👋 Βρεθήκαμε στη μέση με το CentiMeet:`,
    `📍 ${venue.name}${venue.address ? ` – ${venue.address}` : ''}`,
    whenLabel ? `🕒 ${whenLabel}` : null,
    `${MODE_LABEL[plan.mode]}: ~${plan.durationMin}′ • ${plan.costEur.toFixed(2)}€`,
  ];
  if (plan.transitSteps?.length) {
    const route = plan.transitSteps
      .filter((s) => s.kind !== 'walk')
      .map((s) => s.line ?? s.kind)
      .join(' → ');
    if (route) lines.push(`Διαδρομή: ${route}`);
  }
  if (plan.parking?.length) {
    const p = plan.parking[0]!;
    lines.push(`🅿️ Parking: ${p.name} (${p.walkMin}′ με τα πόδια)`);
  }
  lines.push(`🧭 Πλοήγηση: ${plan.navigationUrl}`);
  if (shareUrl) lines.push(`Λεπτομέρειες: ${shareUrl}`);
  return lines.filter(Boolean).join('\n');
}

export type ShareChannel = 'viber' | 'whatsapp' | 'messenger' | 'sms' | 'email';

/** Επιστρέφει URL που ανοίγει την αντίστοιχη εφαρμογή με προσυμπληρωμένο μήνυμα. */
export function channelUrl(channel: ShareChannel, text: string, opts: { phone?: string; email?: string; link?: string } = {}): string {
  const t = encodeURIComponent(text);
  switch (channel) {
    case 'viber':
      return `viber://forward?text=${t}`;
    case 'whatsapp':
      return `whatsapp://send?text=${t}${opts.phone ? `&phone=${encodeURIComponent(opts.phone)}` : ''}`;
    case 'messenger':
      // Το Messenger δέχεται μόνο link (όχι ελεύθερο κείμενο)
      return `fb-messenger://share?link=${encodeURIComponent(opts.link ?? '')}`;
    case 'sms':
      // iOS: sms:&body= , Android: sms:?body= — το '&' δουλεύει και στα δύο στις νεότερες εκδόσεις
      return `sms:${opts.phone ?? ''}&body=${t}`;
    case 'email':
      return `mailto:${opts.email ?? ''}?subject=${encodeURIComponent('Συνάντηση – CentiMeet')}&body=${t}`;
  }
}

export function googleMapsNavUrl(dest: { lat: number; lng: number }, mode: ParticipantPlan['mode'], placeId?: string): string {
  const travelmode =
    mode === 'transit' ? 'transit' : mode === 'walk' ? 'walking' : mode === 'bike' ? 'bicycling' : mode === 'motorbike' ? 'two-wheeler' : 'driving';
  const base = `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=${travelmode}`;
  return placeId ? `${base}&destination_place_id=${encodeURIComponent(placeId)}` : base;
}
