/**
 * QUI A LE DROIT DE NOUS ÉCRIRE — la liste d'expéditeurs que la recherche IMAP
 * accepte.
 *
 * Le collecteur ne descend que les messages VENANT de ces expéditeurs, filtrés
 * côté serveur : c'est la seule chose qui garantit que la correspondance
 * personnelle ne quitte jamais la boîte. Élargir cette liste, c'est élargir ce
 * qui sort de la boîte — d'où la prudence ci-dessous.
 *
 * Aux portails s'ajoutent les agences des annonces DÉJÀ CONTACTÉES, et elles
 * seules : une agence à qui l'on n'a rien demandé n'a aucune raison de nous
 * répondre, et un expéditeur inconnu n'est jamais rapatrié.
 *
 * Cette couche ne lit pas la base : elle reçoit les agences en paramètre.
 */

import { ALERT_SENDERS } from '@maioun/shared';

/**
 * Domaines de messagerie GRAND PUBLIC : suivre `gmail.com` reviendrait à
 * rapatrier toute la correspondance privée hébergée là. Une agence qui publie
 * une telle adresse n'est donc suivie que par son ADRESSE ENTIÈRE.
 *
 * Ce n'est pas un cas de bord : au 2026-09-18, 19 des 133 adresses d'agence
 * connues de la base sont sur une de ces messageries.
 */
const MESSAGERIES_GRAND_PUBLIC: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'orange.fr',
  'wanadoo.fr',
  'free.fr',
  'sfr.fr',
  'neuf.fr',
  'numericable.fr',
  'club-internet.fr',
  'bbox.fr',
  'laposte.net',
  'yahoo.fr',
  'yahoo.com',
  'hotmail.fr',
  'hotmail.com',
  'live.fr',
  'live.com',
  'msn.com',
  'outlook.fr',
  'outlook.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'gmx.fr',
  'gmx.com',
  'protonmail.com',
  'proton.me',
]);

/** Une agence dont l'utilisateur a contacté une annonce. */
export interface AgenceContactee {
  /** Adresse publiée par l'agence ; absente quand on ne la connaît pas. */
  readonly email?: string | null;
  /** Nom de l'agence, pour le journal et l'écran. Jamais pour la recherche. */
  readonly nom?: string | null;
}

/** Ce qui a fait entrer un expéditeur dans la liste. */
export type OrigineExpediteur = 'portail' | 'agence-adresse' | 'agence-domaine';

export interface ExpediteurSuivi {
  /** Fragment cherché dans l'en-tête `From`, en minuscules. */
  readonly match: string;
  readonly origine: OrigineExpediteur;
  /** Nom lisible, quand on en a un. */
  readonly label?: string;
}

export interface ExpediteursOptions {
  /**
   * Adresses ou domaines à ne JAMAIS suivre — au premier chef ceux de
   * l'utilisateur : son propre domaine dans la liste ouvrirait sa boîte
   * entière.
   */
  readonly jamais?: readonly string[];
}

/** `true` si la chaîne a la forme d'une adresse e-mail exploitable. */
const FORME_ADRESSE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/;

/**
 * L'adresse seule d'un `From` (« Agence <contact@x.invalid> » → l'adresse), en
 * minuscules. `null` dès que la forme n'est pas celle d'une adresse : on ne
 * suit pas ce qu'on n'a pas su lire.
 */
export function adresseNormalisee(brut: string | null | undefined): string | null {
  if (brut == null) return null;
  const entreChevrons = /<([^<>]+)>/.exec(brut)?.[1] ?? brut;
  const adresse = entreChevrons.trim().toLowerCase();
  return FORME_ADRESSE.test(adresse) ? adresse : null;
}

/** Le domaine d'une adresse normalisée. */
export function domaineDe(adresse: string): string {
  return adresse.slice(adresse.indexOf('@') + 1);
}

/** `true` si ce domaine est une messagerie grand public. */
export function estMessagerieGrandPublic(domaine: string): boolean {
  return MESSAGERIES_GRAND_PUBLIC.has(domaine.toLowerCase());
}

/**
 * Un domaine peut-il être suivi en entier ?
 *
 * Refusé pour une messagerie grand public, pour un domaine trop court pour être
 * distinctif, et pour un domaine déjà couvert par un fragment de portail — le
 * doublon ferait bouger l'empreinte des expéditeurs sans rien ajouter.
 */
function domaineSuivable(domaine: string, portails: readonly string[]): boolean {
  if (estMessagerieGrandPublic(domaine)) return false;
  const etiquettes = domaine.split('.');
  if (etiquettes.length < 2 || (etiquettes[0]?.length ?? 0) < 3) return false;
  return !portails.some((fragment) => domaine.includes(fragment));
}

/**
 * La liste d'expéditeurs à chercher côté IMAP : les portails, plus les adresses
 * et les domaines des agences contactées.
 *
 * L'ordre est stable (portails, puis domaines, puis adresses, chaque groupe
 * trié) : l'empreinte qui déclenche une relecture ne doit pas bouger au gré de
 * l'ordre des lignes rendues par la base.
 */
export function expediteursSuivis(
  agences: readonly AgenceContactee[] = [],
  options: ExpediteursOptions = {},
): readonly ExpediteurSuivi[] {
  const portails = ALERT_SENDERS.map((sender) => sender.match.toLowerCase());
  const interdits = new Set(
    (options.jamais ?? []).map((valeur) => valeur.trim().toLowerCase()).filter((v) => v !== ''),
  );

  const domaines = new Map<string, string | undefined>();
  const adresses = new Map<string, string | undefined>();

  for (const agence of agences) {
    const adresse = adresseNormalisee(agence.email);
    if (adresse === null || interdits.has(adresse)) continue;
    const domaine = domaineDe(adresse);
    if (interdits.has(domaine)) continue;
    const nom = agence.nom?.trim() === '' ? undefined : (agence.nom ?? undefined);
    if (domaineSuivable(domaine, portails)) {
      if (!domaines.has(domaine)) domaines.set(domaine, nom);
      continue;
    }
    // Messagerie grand public ou domaine déjà couvert : l'adresse entière, et
    // rien de plus large.
    if (portails.some((fragment) => adresse.includes(fragment))) continue;
    if (!adresses.has(adresse)) adresses.set(adresse, nom);
  }

  const suivis: ExpediteurSuivi[] = ALERT_SENDERS.filter(
    (sender) => !interdits.has(sender.match.toLowerCase()),
  ).map((sender) => ({
    match: sender.match.toLowerCase(),
    origine: 'portail' as const,
    label: sender.label,
  }));

  for (const [domaine, nom] of [...domaines].sort(([a], [b]) => a.localeCompare(b))) {
    suivis.push({
      match: domaine,
      origine: 'agence-domaine',
      ...(nom === undefined ? {} : { label: nom }),
    });
  }
  for (const [adresse, nom] of [...adresses].sort(([a], [b]) => a.localeCompare(b))) {
    // Inutile si le domaine entier est déjà suivi.
    if (domaines.has(domaineDe(adresse))) continue;
    suivis.push({
      match: adresse,
      origine: 'agence-adresse',
      ...(nom === undefined ? {} : { label: nom }),
    });
  }
  return suivis;
}

/** Les fragments seuls, dans l'ordre, pour la recherche IMAP. */
export function fragmentsDeRecherche(suivis: readonly ExpediteurSuivi[]): readonly string[] {
  return suivis.map((suivi) => suivi.match);
}

/** `true` si ce `From` vient d'un des portails suivis. */
export function vientDUnPortail(from: string | null | undefined): boolean {
  const adresse = adresseNormalisee(from);
  if (adresse === null) return false;
  return ALERT_SENDERS.some((sender) => adresse.includes(sender.match.toLowerCase()));
}
