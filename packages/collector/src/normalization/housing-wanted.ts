/**
 * Les annonces de DEMANDE : quelqu'un qui CHERCHE un logement, pas qui en
 * propose un. « RETRAITEE DU CORPS MEDICAL CHERCHE STUDIO T1 », déposée dans la
 * rubrique des locations niçoises de ParuVendu, y prend l'apparence d'une offre
 * — même gabarit de carte, même adresse de fiche, un « loyer » qui est en
 * réalité un budget et une surface qui est un souhait.
 *
 * AUCUN SIGNE STRUCTUREL, MESURÉ LE 2026-09-16. ParuVendu a bien une rubrique
 * dédiée (`/immobilier/demande-de-location/`, rubrique `IDELO000`, « avis de
 * recherche »), mais elle est un espace de dépôt SÉPARÉ : ses 159 annonces ne
 * partagent aucun identifiant avec les 221 offres que nous collectons, et
 * aucune des cinq demandes retrouvées en base n'y figurait. Celles-là avaient
 * été déposées par leur auteur dans la rubrique des OFFRES, et leur fiche est
 * alors celle d'une offre jusqu'au dernier octet : `codeRubrique=ILHAP000`,
 * même fil d'Ariane, photos, référence de particulier. Le texte est le seul
 * juge — d'où la prudence de ce qui suit.
 *
 * LA RÈGLE, ET SA PRIORITÉ : écarter une VRAIE offre est bien plus grave que
 * laisser passer une demande. On ne reconnaît donc qu'un VERBE DE RECHERCHE
 * conjugué dont l'objet immédiat est un logement — « cherche studio », « je
 * recherche un appartement », « recherche 3 pièces » — et, en tête de l'annonce
 * seulement, un demandeur qui se présente (« Couple recherche », « Retraité
 * recherche »). Tout le reste passe.
 *
 * CE QUI N'EN EST PAS UNE, et qu'il a fallu apprendre à laisser passer :
 *
 *   - « Je cherche un locataire pour un studio de 22 m² » — LocService écrit
 *     ainsi la moitié de ses descriptions : c'est une OFFRE, à la première
 *     personne. L'objet du verbe tranche, et lui seul.
 *   - « secteur très recherché », « quartier recherché pour la colocation » :
 *     l'adjectif, que l'absence d'accent rend identique au verbe.
 *   - « vous êtes à la recherche d'un appartement », « idéal pour un étudiant
 *     à la recherche d'un logement » : le nom précédé d'un déterminant.
 *   - « votre demande de location », « PROFIL RECHERCHÉ : colocation calme ».
 *   - « notre agence recherche des appartements pour sa clientèle » : la
 *     prospection d'une agence, qui vise des bailleurs et signe de vraies
 *     offres.
 *
 * ON NE LIT QUE LE DÉBUT DU TEXTE. Une demande se déclare dès sa première
 * phrase ; passé les premières lignes, un verbe de recherche appartient à la
 * prose commerciale.
 *
 * MESURE DU 2026-09-16, sur deux corpus étiquetés : 164 demandes réelles (les
 * 159 de la rubrique dédiée, plus les 5 retrouvées en base) et les 4 997
 * occupations en base. 90 demandes reconnues sur 164, et ZÉRO offre écartée.
 * Le rappel plafonne parce que la moitié des demandes ne dit rien qu'une offre
 * ne dirait : « Maison », « T 2 vide », « Urgent », « Appartement 3 pièces ».
 * Les reconnaître coûterait des offres — on s'en abstient.
 */

import { comparable } from './text.js';

/** Ce qu'on peut chercher : un logement, jamais un locataire ni un colocataire. */
const LOGEMENT =
  'appartements?|appart|studios?|logements?|location|colocation|coloc|chambres?|maison|villa|duplex|loft|habitation|toit|[tf]\\s?[1-6]|pieces?|flat|apartment|room|accommodation|housing';

/** Ce qui peut s'intercaler entre le verbe et son objet : un déterminant, une taille, une hâte. */
const DETERMINANT =
  'un|une|des|de|du|d|le|la|les|mon|ma|notre|petite?|grande?|jolie?|beau|bel|belle|urgent|urgemment|activement|rapidement|actuellement|serieusement|meublee?|[1-6]';

/** Les formes conjuguées ; jamais le participe ni la deuxième personne. */
const VERBE = 'recherche|recherchons|cherche|cherchons';

/**
 * Ce qui, placé juste avant, fait de « recherche » autre chose qu'un verbe de
 * demandeur — un nom, un adjectif, ou la prospection d'un professionnel. La
 * forme `comparable` ayant perdu les accents, « recherché » et « recherche »
 * s'écrivent pareil : c'est le mot d'avant qui les sépare.
 */
const PAS_UN_VERBE_DE_DEMANDEUR =
  '(?<!la )(?<!ma )(?<!sa )(?<!votre )(?<!notre )(?<!leur )(?<!une )(?<!cette )(?<!de )(?<!mes )(?<!vos )' +
  '(?<!tres )(?<!secteur )(?<!quartier )(?<!adresse )(?<!residence )(?<!immeuble )(?<!endroit )' +
  '(?<!emplacement )(?<!coin )(?<!profil )(?<!critere )(?<!criteres )' +
  '(?<!agence )(?<!cabinet )(?<!societe )(?<!groupe )(?<!regie )(?<!equipe )(?<!service )(?<!etude )';

/** Le lecteur à qui l'on s'adresse n'est pas l'annonceur. */
const PAS_LE_LECTEUR = '(?<!you are )(?<!are you )(?<!youre )(?<!if you )';

/** Les déterminants qui font de « demande » un nom ordinaire de la prose d'agence. */
const PAS_UNE_DEMANDE_RECUE =
  '(?<!votre )(?<!ma )(?<!sa )(?<!une )(?<!la )(?<!toute )(?<!cette )(?<!de )';

const DEMANDE = new RegExp(
  [
    `${PAS_UN_VERBE_DE_DEMANDEUR}\\b(?:${VERBE})\\s+(?:(?:${DETERMINANT})\\s+){0,3}(?:${LOGEMENT})\\b`,
    `\\b(?:je suis|nous sommes|suis) a la recherche d\\s+(?:(?:${DETERMINANT})\\s+){0,2}(?:${LOGEMENT})\\b`,
    `${PAS_UNE_DEMANDE_RECUE}\\bdemande d(?:e|un|une) (?:location|logement|${LOGEMENT})\\b`,
    `${PAS_LE_LECTEUR}\\b(?:looking|searching) for (?:a |an |the |my |our )?(?:${LOGEMENT})\\b`,
    `\\b(?:flat|apartment|room|studio|housing|accommodation) wanted\\b`,
    // « Je cherches un appartement » : la faute de frappe ne trompe personne.
    `\\bje (?:recherches|cherches)\\b`,
  ].join('|'),
);

/**
 * Qui se présente avant de chercher. Reconnu SEULEMENT en tête de l'intitulé,
 * sans quoi « le propriétaire, un couple retraité, recherche un locataire
 * sérieux » — une offre — tomberait avec.
 */
const DEMANDEUR =
  'jeune (?:homme|femme|couple)|couple|retraite|retraitee|etudiant|etudiante|famille|dame|monsieur|' +
  'madame|infirmiere|infirmier|fonctionnaire|salarie|salariee|apprenti|apprentie|stagiaire|senior|' +
  'celibataire|veuve|veuf';
const DEMANDEUR_EN_TETE = new RegExp(`^(?:${DEMANDEUR})\\s+(?:${VERBE})\\b`);

/** Caractères de description lus : la déclaration d'une demande tient dedans. */
const TETE = 400;

/** Caractères de l'intitulé : ce que le déposant a écrit lui-même, avant le corps. */
const INTITULE = 120;

/**
 * L'intitulé du déposant. ParuVendu le pose en tête de la description, capitale
 * en tête et point final, avant le corps de l'annonce : « Studio meublé. studio
 * meublé au sein du quartier des fleurs… ».
 */
function intitule(description: string): string {
  const premiere = description.split('\n')[0] ?? '';
  return (/^[^.!?]{0,120}/.exec(premiere)?.[0] ?? '').slice(0, INTITULE);
}

/**
 * La formulation qui fait de cette annonce une demande, ou `null`.
 *
 * On rend la phrase reconnue, et pas un simple oui : une annonce écartée doit
 * pouvoir être vérifiée après coup, motif en main.
 *
 * @param title titre de l'annonce, souvent composé par le site et donc muet
 * @param description son texte, dont seul le début est lu
 */
export function wantedAdEvidence(
  title: string | null | undefined,
  description?: string | null,
): string | null {
  const texte = comparable(`${title ?? ''} ${(description ?? '').slice(0, TETE)}`);
  const trouve = DEMANDE.exec(texte)?.[0];
  if (trouve !== undefined) return trouve;
  return DEMANDEUR_EN_TETE.exec(comparable(intitule(description ?? '')))?.[0] ?? null;
}

/** `true` si le texte est celui de quelqu'un qui CHERCHE un logement. */
export function isHousingWanted(
  title: string | null | undefined,
  description?: string | null,
): boolean {
  return wantedAdEvidence(title, description) !== null;
}
