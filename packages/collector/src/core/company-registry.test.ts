/**
 * Relecture du registre des entreprises.
 *
 * Les réponses utilisées ici sont celles de l'API de l'État, relevées le
 * 2026-09-22 sur des agences que nous collectons — réduites aux champs que le
 * module lit.
 */

import { describe, expect, it } from 'vitest';
import {
  lookupAgency,
  parseRegistrySearch,
  registrySearchUrl,
  NAF_REAL_ESTATE_AGENCY,
} from './company-registry.js';

const WINTER = {
  results: [
    {
      siren: '394227128',
      nom_complet: 'AGENCE WINTER IMMOBILIER',
      siege: {
        activite_principale: '68.31Z',
        etat_administratif: 'A',
        adresse: '10 RUE FICTIVE 06000 NICE',
        libelle_commune: 'NICE',
      },
    },
  ],
};

describe('registre des entreprises', () => {
  it('relit un enregistrement complet', () => {
    const record = parseRegistrySearch(WINTER);
    expect(record?.siren).toBe('394227128');
    expect(record?.name).toBe('AGENCE WINTER IMMOBILIER');
    expect(record?.active).toBe(true);
    expect(record?.naf).toBe(NAF_REAL_ESTATE_AGENCY);
    expect(record?.commune).toBe('NICE');
  });

  it('rend null sur une recherche sans résultat', () => {
    expect(parseRegistrySearch({ results: [] })).toBeNull();
    expect(parseRegistrySearch({})).toBeNull();
    expect(parseRegistrySearch(null)).toBeNull();
  });

  /**
   * « C » comme cessé : la seule information CERTAINE que ce module produise,
   * puisqu'elle vient du registre et non d'un rapprochement de noms.
   */
  it('reconnaît un établissement cessé', () => {
    const record = parseRegistrySearch({
      results: [
        { siren: '111222333', nom_complet: 'AGENCE DISPARUE', siege: { etat_administratif: 'C' } },
      ],
    });
    expect(record?.active).toBe(false);
  });

  /**
   * UN ÉTAT NON PUBLIÉ N'EST PAS UNE CESSATION : le doute ne condamne pas une
   * agence, conformément à la règle « un trait inconnu n'écarte jamais ».
   */
  it('tient pour active une entreprise dont l’état n’est pas publié', () => {
    const record = parseRegistrySearch({
      results: [{ siren: '111222333', nom_complet: 'AGENCE MUETTE', siege: {} }],
    });
    expect(record?.active).toBe(true);
  });

  it('resserre la recherche sur le département et sur le code NAF', () => {
    const url = new URL(registrySearchUrl("L'Agence du Port", '06'));
    expect(url.searchParams.get('q')).toBe("L'Agence du Port");
    expect(url.searchParams.get('departement')).toBe('06');
    expect(url.searchParams.get('activite_principale')).toBe(NAF_REAL_ESTATE_AGENCY);
  });

  it('interroge le registre et relit sa réponse', async () => {
    let vue = '';
    const record = await lookupAgency('Agence Winter', '06', {
      userAgent: 'MaiounBot/0.1',
      fetchImpl: (async (url: string | URL | Request) => {
        vue = String(url);
        return new Response(JSON.stringify(WINTER), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(vue).toContain('recherche-entreprises.api.gouv.fr');
    expect(record?.siren).toBe('394227128');
  });

  /**
   * UNE PANNE N'EST PAS UNE ABSENCE. Sans cette garde, une API en maintenance
   * aurait fait passer deux cents agences réelles pour introuvables.
   */
  it('ne conclut rien d’une erreur réseau ni d’un statut d’erreur', async () => {
    const enPanne = await lookupAgency('Agence Winter', '06', {
      userAgent: 'MaiounBot/0.1',
      fetchImpl: (() => Promise.reject(new Error('réseau'))) as unknown as typeof fetch,
    });
    expect(enPanne).toBeNull();

    const refus = await lookupAgency('Agence Winter', '06', {
      userAgent: 'MaiounBot/0.1',
      fetchImpl: (async () => new Response('', { status: 503 })) as unknown as typeof fetch,
    });
    expect(refus).toBeNull();
  });
});
