/**
 * RÉVEILLER LA COLLECTE, PARCE QUE LE CRON DE GITHUB NE LE FAIT PLUS (§30).
 *
 * Le workflow demande `7,37 * * * *`, soit quarante-huit passages par jour ; le
 * 2026-09-07 il en a exécuté TROIS. GitHub met les déclenchements `schedule` en
 * file et les écarte quand elle est chargée, sans le dire. Sans collecte, rien
 * n'entre et aucune alerte ne part — alors que la dernière collecte a réussi.
 *
 * Les Cron Triggers de Cloudflare, eux, tiennent l'heure. Le Worker demande à
 * GitHub d'exécuter le workflow : un déclenchement MANUEL, que la file ne
 * dégrade pas. Le `schedule` reste en place comme filet.
 *
 * Il ne collecte pas lui-même — soixante sites et une boîte IMAP demandent
 * plusieurs minutes et Node. Il n'appuie que sur le bouton, et se tait en le
 * disant si le jeton manque (§17).
 */

export interface CollectTriggerEnv {
  /**
   * Jeton GitHub à portée minimale : `actions: write` sur CE dépôt, et rien
   * d'autre. Un jeton fin (« fine-grained ») convient, et c'est ce qu'il faut —
   * un jeton classique donnerait au Worker bien plus que le droit d'appuyer sur
   * un bouton.
   */
  readonly GITHUB_DISPATCH_TOKEN?: string;
  /**
   * IDENTIFIANT NUMÉRIQUE du dépôt — celui que GitHub attribue à sa création.
   *
   * PAS SON NOM. Le nom était écrit en dur ici, et le renommage du 2026-09-10
   * ne l'a pas cassé par pure chance : GitHub redirige encore l'ancien nom par
   * un 307, qu'il supprime dès qu'un autre dépôt le reprend. L'identifiant, lui,
   * ne change ni au renommage ni au transfert ; c'est d'ailleurs vers lui que
   * GitHub redirigeait. `gh api repos/<propriétaire>/<nom> --jq .id` le donne.
   */
  readonly GITHUB_REPOSITORY_ID?: string;
  /** `propriétaire/nom`, à défaut d'identifiant. Fragile : suit mal un renommage. */
  readonly GITHUB_REPOSITORY?: string;
}

const WORKFLOW = 'collect.yml';

/**
 * Le chemin d'API du dépôt, par son identifiant de préférence.
 *
 * AUCUN DÉPÔT PAR DÉFAUT. Il y en avait un, en dur ; sans configuration, le
 * réveil appuyait sur le bouton d'un dépôt que personne n'avait désigné.
 */
function repositoryPath(env: CollectTriggerEnv): string | null {
  const id = env.GITHUB_REPOSITORY_ID?.trim() ?? '';
  if (/^\d+$/.test(id)) return `repositories/${id}`;
  const name = env.GITHUB_REPOSITORY?.trim() ?? '';
  if (/^[\w.-]+\/[\w.-]+$/.test(name)) return `repos/${name}`;
  return null;
}

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

  const repository = repositoryPath(env);
  if (repository === null) {
    return { triggered: false, reason: 'ni GITHUB_REPOSITORY_ID ni GITHUB_REPOSITORY configuré' };
  }
  const url = `https://api.github.com/${repository}/actions/workflows/${WORKFLOW}/dispatches`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub refuse une requête d'API sans User-Agent.
        'User-Agent': 'Maioun-Worker',
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
