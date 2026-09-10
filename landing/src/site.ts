/**
 * Où la page est publiée, et d'où vient son code — DÉDUIT, JAMAIS ÉCRIT.
 *
 * Le nom du dépôt figurait en dur dans le lien vers le code, les mentions
 * légales, `robots.txt` et le plan du site. Au renommage du 2026-09-10, ces
 * adresses sont toutes devenues fausses d'un coup, et les remplacer par le
 * nouveau nom aurait préparé la même panne pour le suivant.
 *
 * L'environnement le sait toujours : GitHub Actions fournit `GITHUB_REPOSITORY`,
 * à jour après un renommage ; en local, c'est le dépôt distant `origin`.
 *
 * Le collecteur fait la même déduction (`publicSiteUrl`). Elle est recopiée ici
 * et non importée : la page ne dépend d'aucun paquet du dépôt, c'est ce qui lui
 * permet d'être publiée seule.
 */

import { execFileSync } from 'node:child_process';

export interface SiteInfo {
  /** Adresse publique de la page, avec sa barre finale. */
  readonly siteUrl: string;
  /** Adresse du dépôt de code. */
  readonly repoUrl: string;
}

/** `propriétaire/nom` du dépôt, ou `null` si rien ne permet de le savoir. */
function repositorySlug(env: NodeJS.ProcessEnv): string | null {
  const fromActions = env['GITHUB_REPOSITORY']?.trim();
  if (fromActions !== undefined && fromActions !== '') return fromActions;
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Les deux adresses de la page.
 *
 * @throws si le dépôt est introuvable : une page publiée avec des liens vides
 *         vaut moins qu'une construction qui s'arrête en disant pourquoi.
 */
export function siteInfo(env: NodeJS.ProcessEnv = process.env): SiteInfo {
  const slug = repositorySlug(env);
  const [owner, name] = slug?.split('/') ?? [];
  if (owner === undefined || name === undefined) {
    throw new Error(
      'Dépôt introuvable : ni GITHUB_REPOSITORY, ni dépôt git « origin ». ' +
        'Les liens de la page ne peuvent pas être composés.',
    );
  }
  const server = env['GITHUB_SERVER_URL']?.trim() || 'https://github.com';
  return {
    // GitHub Pages publie `<propriétaire>.github.io/<nom>/`, en minuscules :
    // c'est un nom d'hôte.
    siteUrl: `https://${owner.toLowerCase()}.github.io/${name}/`,
    repoUrl: `${server}/${owner}/${name}`,
  };
}

/** Remplace les repères `%SITE_URL%` et `%REPO_URL%` d'un texte. */
export function fillSite(text: string, info: SiteInfo): string {
  return text.replaceAll('%SITE_URL%', info.siteUrl).replaceAll('%REPO_URL%', info.repoUrl);
}
