/**
 * RÉVEILLER LA COLLECTE, PARCE QUE LE CRON DE GITHUB NE LE FAIT PLUS (§30).
 *
 * CE QU'ON A CONSTATÉ. Le workflow est réglé sur `7,37 * * * *`, soit quarante-
 * huit passages par jour. Le 2026-09-07, il en a fait TROIS : 00:55, 06:00,
 * 12:20 — cinq à six heures d'écart. GitHub met les déclenchements `schedule`
 * en file d'attente et les écarte quand la file est chargée, sans aucune
 * garantie ni le moindre signalement. Le workflow le savait déjà à moitié : ses
 * minutes avaient été décalées des demi-heures rondes vers `7,37` pour fuir
 * les minutes encombrées. Cela n'a pas suffi.
 *
 * Sans collecte, rien n'entre : ni les annonces des sites, ni les alertes des
 * portails qui attendent dans la boîte. L'utilisateur ne reçoit alors aucune
 * notification, et RIEN NE LUI DIT POURQUOI — la dernière collecte réussie
 * date, mais elle a réussi.
 *
 * CE QU'ON FAIT. Les Cron Triggers de Cloudflare, eux, sont fiables et compris
 * dans le plan gratuit. Le Worker se réveille et demande à GitHub d'exécuter le
 * workflow par `workflow_dispatch` — un déclenchement MANUEL, que la file ne
 * dégrade pas comme un `schedule`. Le `schedule` du workflow reste en place :
 * il ne coûte rien et sert de filet si le Worker se tait.
 *
 * IL NE COLLECTE PAS LUI-MÊME, et ne le pourra jamais : la collecte lit une
 * soixantaine de sites, ouvre une boîte IMAP et écrit en base pendant plusieurs
 * minutes. Un Worker a quelques dizaines de secondes et pas de Node. Il
 * n'appuie que sur le bouton.
 *
 * SANS JETON, IL SE TAIT ET LE DIT. Le jeton `GITHUB_DISPATCH_TOKEN` est un
 * secret à déposer à part ; absent, on ne prétend pas avoir déclenché quoi que
 * ce soit (§17).
 */

export interface CollectTriggerEnv {
  /**
   * Jeton GitHub à portée minimale : `actions: write` sur CE dépôt, et rien
   * d'autre. Un jeton fin (« fine-grained ») convient, et c'est ce qu'il faut —
   * un jeton classique donnerait au Worker bien plus que le droit d'appuyer sur
   * un bouton.
   */
  readonly GITHUB_DISPATCH_TOKEN?: string;
  /** `proprietaire/depot`. Absent : on retombe sur le dépôt du projet. */
  readonly GITHUB_REPOSITORY?: string;
}

const DEFAULT_REPOSITORY = 'WizyxGH/RentFinder';
const WORKFLOW = 'collect.yml';

/** Ce que le réveil a produit, pour le journal du Worker. */
export interface TriggerResult {
  readonly triggered: boolean;
  readonly reason: string;
}

/**
 * Demande à GitHub d'exécuter la collecte.
 *
 * NE LÈVE JAMAIS : un réveil raté ne doit pas faire échouer le Worker, qui sert
 * par ailleurs l'API. Le prochain réveil réessaiera de toute façon.
 */
export async function triggerCollect(env: CollectTriggerEnv): Promise<TriggerResult> {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim() ?? '';
  if (token === '') {
    return { triggered: false, reason: 'GITHUB_DISPATCH_TOKEN absent' };
  }

  const repository = env.GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const url = `https://api.github.com/repos/${repository}/actions/workflows/${WORKFLOW}/dispatches`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub refuse une requête d'API sans User-Agent.
        'User-Agent': 'RentFinder-Worker',
        'Content-Type': 'application/json',
      },
      // `ref` est OBLIGATOIRE : c'est la branche sur laquelle exécuter.
      body: JSON.stringify({ ref: 'main' }),
    });

    // 204 sans corps est la réponse normale d'un dispatch accepté.
    if (response.status === 204) return { triggered: true, reason: 'accepté' };
    return { triggered: false, reason: `GitHub a répondu ${response.status}` };
  } catch (error) {
    return {
      triggered: false,
      reason: error instanceof Error ? error.message : 'appel impossible',
    };
  }
}
