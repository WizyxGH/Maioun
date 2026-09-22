/**
 * Vérifier qu'une agence EXISTE au registre des entreprises (§6).
 *
 * `recherche-entreprises.api.gouv.fr` est l'API officielle et gratuite de
 * l'État, explicitement prévue pour l'automatisation : aucune clé, aucun
 * quota déclaré. On la préfère donc à tout scraping, comme la BAN pour les
 * adresses et l'ADEME pour les DPE.
 *
 * POURQUOI. Jinka conseille à ses lecteurs de vérifier qu'une agence a bien une
 * carte professionnelle et figure au RCS — mais ne le fait pas pour eux, et
 * nous non plus : notre seul signal d'identité disait si une agence était
 * NOMMÉE, jamais si elle existait. Une enseigne inventée passait donc pour
 * identifiable. « Confiance Immobilière » a montré l'autre face du problème :
 * l'agence était bien au registre, c'est son site qui avait disparu.
 *
 * CE MODULE NE CONCLUT RIEN, il rapporte. Ne pas trouver une agence ne prouve
 * rien : les enseignes commerciales ne sont pas les raisons sociales, et le
 * rapprochement de noms est déjà ce qu'il y a de plus fragile dans ce projet.
 * Seul un état administratif CESSÉ est une information certaine, parce qu'elle
 * vient du registre lui-même et non d'un appariement.
 */

/** Code NAF des agences immobilières — celui qu'on s'attend à trouver. */
export const NAF_REAL_ESTATE_AGENCY = '68.31Z';

/** Ce que le registre dit d'une entreprise, réduit à ce qui nous sert. */
export interface RegistryRecord {
  readonly siren: string;
  readonly name: string;
  /** `false` quand l'établissement principal est administrativement CESSÉ. */
  readonly active: boolean;
  /** Code d'activité principale du siège, ou `null` s'il n'est pas publié. */
  readonly naf: string | null;
  readonly address: string | null;
  readonly commune: string | null;
}

interface SearchPayload {
  readonly results?: readonly {
    readonly siren?: unknown;
    readonly nom_complet?: unknown;
    readonly nom_raison_sociale?: unknown;
    readonly siege?: {
      readonly activite_principale?: unknown;
      readonly etat_administratif?: unknown;
      readonly adresse?: unknown;
      readonly libelle_commune?: unknown;
    };
  }[];
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/**
 * Relit une réponse du registre, ou `null` si elle ne porte aucun résultat.
 *
 * SÉPARÉ DE L'APPEL RÉSEAU, pour que la relecture s'éprouve sur des réponses
 * réelles enregistrées plutôt que sur une API jointe depuis un test.
 */
export function parseRegistrySearch(body: unknown): RegistryRecord | null {
  if (body === null || typeof body !== 'object') return null;
  const first = (body as SearchPayload).results?.[0];
  if (first === undefined) return null;
  const siren = text(first.siren);
  const name = text(first.nom_complet) ?? text(first.nom_raison_sociale);
  if (siren === null || name === null) return null;
  return {
    siren,
    name,
    // « A » pour actif, « C » pour cessé. Un état non publié n'est pas une
    // cessation : dans le doute, l'entreprise est réputée active (§17).
    active: text(first.siege?.etat_administratif) !== 'C',
    naf: text(first.siege?.activite_principale),
    address: text(first.siege?.adresse),
    commune: text(first.siege?.libelle_commune),
  };
}

const ENDPOINT = 'https://recherche-entreprises.api.gouv.fr/search';

/**
 * L'adresse interrogée pour une agence, département compris.
 *
 * LE DÉPARTEMENT RESSERRE BEAUCOUP : « Agence du Port » existe dans vingt
 * villes, et le premier résultat national n'aurait aucune raison d'être le
 * bon. Sans lui, ce module rapprocherait des entreprises au hasard.
 */
export function registrySearchUrl(name: string, departement: string): string {
  const params = new URLSearchParams({
    q: name,
    departement,
    limite: '1',
    // Les agences immobilières, et rien d'autre : un cabinet comptable
    // homonyme ne répond pas à la question posée.
    activite_principale: NAF_REAL_ESTATE_AGENCY,
  });
  return `${ENDPOINT}?${params.toString()}`;
}

export interface RegistryLookupOptions {
  /** Injection de `fetch` : aucun accès réseau en test (§59). */
  readonly fetchImpl?: typeof fetch;
  readonly userAgent: string;
}

/**
 * Interroge le registre pour une enseigne, ou `null` si rien ne lui répond.
 *
 * UNE PANNE N'EST PAS UNE ABSENCE : une erreur réseau ou un statut non-200
 * rendent `null` comme une recherche vide, et c'est voulu — l'appelant ne doit
 * rien conclure d'un `null`, jamais. Seul un enregistrement rendu porte une
 * information, et la seule qui soit certaine est `active: false`.
 */
export async function lookupAgency(
  name: string,
  departement: string,
  options: RegistryLookupOptions,
): Promise<RegistryRecord | null> {
  const call = options.fetchImpl ?? fetch;
  try {
    const response = await call(registrySearchUrl(name, departement), {
      headers: { 'User-Agent': options.userAgent },
    });
    if (!response.ok) return null;
    return parseRegistrySearch(await response.json());
  } catch {
    return null;
  }
}
