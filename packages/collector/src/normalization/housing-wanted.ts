/**
 * Les annonces de DEMANDE : quelqu'un qui CHERCHE un logement, pas qui en
 * propose un. « RETRAITEE DU CORPS MEDICAL CHERCHE STUDIO T1 », déposée dans la
 * rubrique des locations niçoises de ParuVendu, y prend l'apparence d'une offre
 * — même gabarit de carte, même adresse de fiche, un « loyer » qui est en
 * réalité un budget et une surface qui est un souhait. Rien dans la page ne la
 * distingue : son texte seul la dit.
 *
 * LA RÈGLE. Une demande est reconnue à un VERBE DE RECHERCHE conjugué dont
 * l'objet immédiat est un logement : « cherche studio », « je recherche un
 * appartement », « recherche 3 pièces ». Tout le reste est écarté, car tout le
 * reste est de la prose commerciale.
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
 *
 * ON NE LIT QUE LE DÉBUT DU TEXTE. Une demande se déclare dès sa première
 * phrase ; passé les premières lignes, « nous recherchons des appartements pour
 * notre clientèle » est une signature d'agence collée en fin d'annonce, et
 * l'annonce, elle, est bien une offre.
 *
 * Vérifiée sur les 4 993 occurrences en base le 2026-09-16 : cinq détections,
 * les cinq vraies, toutes de ParuVendu, aucune fausse.
 */

import { comparable } from './text.js';

/** Ce qu'on peut chercher : un logement, jamais un locataire ni un colocataire. */
const LOGEMENT =
  'appartements?|appart|studios?|logements?|location|colocation|coloc|chambres?|maison|villa|duplex|loft|habitation|toit|[tf][1-6]|pieces?|flat|apartment|room|accommodation|housing';

/** Ce qui peut s'intercaler entre le verbe et son objet : un déterminant, une taille, une hâte. */
const DETERMINANT =
  'un|une|des|de|du|d|le|la|les|mon|ma|notre|petite?|grande?|jolie?|beau|bel|belle|urgent|urgemment|activement|rapidement|actuellement|serieusement|meublee?|[1-6]';

/**
 * Ce qui, placé juste avant, fait de « recherche » un nom ou un adjectif — donc
 * plus un verbe. La forme `comparable` ayant perdu les accents, « recherché »
 * et « recherche » s'écrivent pareil : c'est le mot d'avant qui les sépare.
 */
const PAS_UN_VERBE =
  '(?<!la )(?<!ma )(?<!sa )(?<!votre )(?<!notre )(?<!leur )(?<!une )(?<!cette )(?<!de )(?<!mes )(?<!vos )' +
  '(?<!tres )(?<!secteur )(?<!quartier )(?<!adresse )(?<!residence )(?<!immeuble )(?<!endroit )' +
  '(?<!emplacement )(?<!coin )(?<!profil )(?<!critere )(?<!criteres )';

/** Le lecteur à qui l'on s'adresse n'est pas l'annonceur. */
const PAS_LE_LECTEUR = '(?<!you are )(?<!are you )(?<!youre )(?<!if you )';

const DEMANDE = new RegExp(
  [
    `${PAS_UN_VERBE}\\b(?:recherche|recherchons|cherche|cherchons)\\s+(?:(?:${DETERMINANT})\\s+){0,3}(?:${LOGEMENT})\\b`,
    `\\b(?:je suis|nous sommes|suis) a la recherche d\\s+(?:(?:${DETERMINANT})\\s+){0,2}(?:${LOGEMENT})\\b`,
    `(?<!votre )(?<!ma )(?<!sa )(?<!une )(?<!la )(?<!toute )(?<!cette )(?<!de )\\bdemande de (?:location|logement)\\b`,
    `${PAS_LE_LECTEUR}\\b(?:looking|searching) for (?:a |an |the |my |our )?(?:${LOGEMENT})\\b`,
    `\\b(?:flat|apartment|room|studio|housing|accommodation) wanted\\b`,
  ].join('|'),
);

/** Caractères de description lus : la déclaration d'une demande tient dedans. */
const TETE = 400;

/**
 * `true` si le texte est celui de quelqu'un qui CHERCHE un logement.
 *
 * @param title titre de l'annonce, souvent composé par le site et donc muet
 * @param description son texte, dont seul le début est lu
 */
export function isHousingWanted(
  title: string | null | undefined,
  description?: string | null,
): boolean {
  return DEMANDE.test(comparable(`${title ?? ''} ${(description ?? '').slice(0, TETE)}`));
}
