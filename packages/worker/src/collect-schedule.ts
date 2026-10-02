const FUSEAU = 'Europe/Paris';

function heureLocale(date: Date): { heure: number; minute: number } {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return {
    heure: Number(parties.find((partie) => partie.type === 'hour')?.value),
    minute: Number(parties.find((partie) => partie.type === 'minute')?.value),
  };
}

/** Réduit à un réveil par heure entre 1 h et 5 h, heure de Nice. */
export function collecteDue(date: Date): boolean {
  const { heure, minute } = heureLocale(date);
  return heure < 1 || heure > 5 || minute === 7;
}
