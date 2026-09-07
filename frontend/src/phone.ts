/**
 * Numéros de téléphone : l'indicatif du pays, et rien de plus (§17).
 *
 * LE CHAMP ÉTAIT UN `type="tel"` NU. On y tapait « 06 00 00 00 12 », ce qui
 * convient tant qu'on écrit à une agence niçoise depuis la France — et ne dit
 * plus rien dès qu'on candidate depuis l'étranger, ce qui est le cas de
 * beaucoup de gens qui cherchent à Nice. Le numéro partait tel quel dans le
 * message : ni l'agence ni son standard ne savaient quoi en faire.
 *
 * LE NUMÉRO EST RANGÉ EN E.164 — `+33600000012`, indicatif compris, sans espace
 * ni ponctuation. C'est la seule forme non ambiguë, c'est celle que le
 * collecteur emploie déjà pour les téléphones d'agence, et c'est celle qu'un
 * `tel:` doit porter pour qu'un appel aboutisse depuis n'importe où.
 *
 * PAS DE BIBLIOTHÈQUE. `libphonenumber` pèse plus lourd que tout le reste de
 * l'application pour ce qu'on lui demanderait : reconnaître un indicatif et
 * retirer le zéro initial. Ce qu'elle sait faire en plus — valider un numéro
 * pays par pays, distinguer mobile et fixe — ne nous servirait à rien ici : on
 * ne refuse pas un numéro, on le range.
 */

export interface Country {
  /** Code ISO 3166-1 alpha-2, identifiant stable de l'entrée. */
  readonly code: string;
  /** Indicatif international, sans le `+`. */
  readonly dial: string;
  readonly label: string;
  /** Drapeau, en emoji : aucune image à télécharger. */
  readonly flag: string;
  /**
   * Le pays retire-t-il un `0` initial en passant à l'international ?
   *
   * Vrai presque partout en Europe — « 06 00 » devient « +33 6 00 » — et FAUX
   * en Italie, où le zéro fait partie du numéro. Se tromper là-dessus produit
   * un numéro injoignable, ce qui est pire que pas de numéro du tout.
   */
  readonly trunkPrefix: boolean;
}

/**
 * Les pays proposés.
 *
 * LA FRANCE D'ABORD, puis les voisins et les origines les plus courantes des
 * candidats à Nice. La liste est délibérément COURTE : un menu de deux cents
 * entrées se parcourt moins vite qu'il ne se remplit, et ce qui manque se
 * rattrape en tapant l'indicatif à la main dans le numéro.
 */
export const COUNTRIES: readonly Country[] = [
  { code: 'FR', dial: '33', label: 'France', flag: '🇫🇷', trunkPrefix: true },
  { code: 'MC', dial: '377', label: 'Monaco', flag: '🇲🇨', trunkPrefix: false },
  { code: 'BE', dial: '32', label: 'Belgique', flag: '🇧🇪', trunkPrefix: true },
  { code: 'CH', dial: '41', label: 'Suisse', flag: '🇨🇭', trunkPrefix: true },
  { code: 'IT', dial: '39', label: 'Italie', flag: '🇮🇹', trunkPrefix: false },
  { code: 'ES', dial: '34', label: 'Espagne', flag: '🇪🇸', trunkPrefix: false },
  { code: 'PT', dial: '351', label: 'Portugal', flag: '🇵🇹', trunkPrefix: false },
  { code: 'DE', dial: '49', label: 'Allemagne', flag: '🇩🇪', trunkPrefix: true },
  { code: 'GB', dial: '44', label: 'Royaume-Uni', flag: '🇬🇧', trunkPrefix: true },
  { code: 'LU', dial: '352', label: 'Luxembourg', flag: '🇱🇺', trunkPrefix: false },
  { code: 'NL', dial: '31', label: 'Pays-Bas', flag: '🇳🇱', trunkPrefix: true },
  { code: 'IE', dial: '353', label: 'Irlande', flag: '🇮🇪', trunkPrefix: true },
  { code: 'PL', dial: '48', label: 'Pologne', flag: '🇵🇱', trunkPrefix: false },
  { code: 'RO', dial: '40', label: 'Roumanie', flag: '🇷🇴', trunkPrefix: true },
  { code: 'MA', dial: '212', label: 'Maroc', flag: '🇲🇦', trunkPrefix: true },
  { code: 'DZ', dial: '213', label: 'Algérie', flag: '🇩🇿', trunkPrefix: true },
  { code: 'TN', dial: '216', label: 'Tunisie', flag: '🇹🇳', trunkPrefix: false },
  { code: 'US', dial: '1', label: 'États-Unis / Canada', flag: '🇺🇸', trunkPrefix: false },
  { code: 'BR', dial: '55', label: 'Brésil', flag: '🇧🇷', trunkPrefix: false },
  { code: 'CN', dial: '86', label: 'Chine', flag: '🇨🇳', trunkPrefix: false },
  { code: 'RU', dial: '7', label: 'Russie', flag: '🇷🇺', trunkPrefix: false },
  { code: 'UA', dial: '380', label: 'Ukraine', flag: '🇺🇦', trunkPrefix: true },
  { code: 'TR', dial: '90', label: 'Turquie', flag: '🇹🇷', trunkPrefix: true },
  { code: 'IL', dial: '972', label: 'Israël', flag: '🇮🇱', trunkPrefix: true },
];

/** Le pays par défaut : la recherche porte sur Nice. */
export const DEFAULT_COUNTRY = 'FR';

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((country) => country.code === code);
}

/** Un numéro décomposé : le pays, et ce qu'on tape après l'indicatif. */
export interface ParsedPhone {
  readonly country: string;
  /** Le numéro national, chiffres seuls, sans zéro initial. */
  readonly national: string;
}

/** Ne garde que les chiffres. */
function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Retrouve pays et numéro national à partir de ce qui est enregistré.
 *
 * LES INDICATIFS SONT ESSAYÉS DU PLUS LONG AU PLUS COURT, et il le faut :
 * `+33` est un préfixe de rien, mais `+1` l'est de tout ce qui commence par un
 * 1. Sans ce tri, un numéro monégasque `+377…` serait lu comme un `+3` suivi
 * de bêtises — ou pire, reconnu par un indicatif plus court qui existe.
 *
 * SANS `+`, ON NE DEVINE PAS : un numéro nu est réputé être du pays par défaut,
 * et non d'un pays dont l'indicatif ressemblerait à son début. « 3312… » est un
 * numéro français, pas un numéro français préfixé.
 */
export function parsePhone(
  stored: string | null | undefined,
  fallback = DEFAULT_COUNTRY,
): ParsedPhone {
  const raw = (stored ?? '').trim();
  if (raw === '') return { country: fallback, national: '' };

  if (raw.startsWith('+') || raw.startsWith('00')) {
    const digits = digitsOf(raw.startsWith('00') ? raw.slice(2) : raw);
    const byLength = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const country of byLength) {
      if (digits.startsWith(country.dial)) {
        return { country: country.code, national: digits.slice(country.dial.length) };
      }
    }
    // Indicatif hors liste : on garde les chiffres tels quels plutôt que de les
    // ranger sous un pays qui n'est pas le bon (§17).
    return { country: fallback, national: digits };
  }

  return { country: fallback, national: digitsOf(raw).replace(/^0+/, '') };
}

/**
 * Recompose la forme à ENREGISTRER, en E.164.
 *
 * Un numéro national vide rend une chaîne vide, et non un indicatif orphelin :
 * « +33 » tout seul n'est pas un numéro, et le glisser dans un message
 * laisserait croire qu'on en a donné un.
 */
export function formatPhone({ country, national }: ParsedPhone): string {
  const dial = countryByCode(country)?.dial ?? countryByCode(DEFAULT_COUNTRY)?.dial ?? '';
  const trunk = countryByCode(country)?.trunkPrefix ?? true;
  const digits = trunk ? digitsOf(national).replace(/^0+/, '') : digitsOf(national);
  return digits === '' ? '' : `+${dial}${digits}`;
}
