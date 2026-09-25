/**
 * Engendre la table des sources lue par l'interface.
 *
 * POURQUOI L'ENGENDRER. Cette table existait à la main dans `format.ts` : un
 * identifiant, un nom lisible. Elle a dérivé — huit sources ajoutées le
 * 2026-09-05 n'y figuraient pas, et l'écran les nommait par un repli qui
 * capitalise l'identifiant : « Akorimmo » pour AKOR Immo, « Immo Jbf » pour
 * Immo JBF. Rien ne cassait, ce qui est précisément le problème : une table
 * tenue à la main ne signale jamais qu'elle est incomplète.
 *
 * ELLE APPORTE AUSSI LE DOMAINE, que la table manuelle n'avait pas. C'est ce
 * qui permet d'afficher le vrai logo d'une agence plutôt qu'une icône commune —
 * uniquement pour celles dont nous connaissons le site, c'est-à-dire celles que
 * nous collectons directement.
 *
 * Le fichier produit est VERSIONNÉ : l'interface se compile sans avoir à
 * construire le collecteur d'abord.
 *
 * Usage : pnpm --filter @maioun/frontend run sources
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

// Le collecteur est une dépendance de DÉVELOPPEMENT : ce script ne tourne
// qu'ici, et rien de son code n'entre dans le bundle publié.
const { ALL_SCRAPERS } = await import('@maioun/collector');

const OUT = fileURLToPath(new URL('../src/sources.generated.ts', import.meta.url));

const entries = [...ALL_SCRAPERS]
  .map((scraper) => scraper.descriptor)
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((descriptor) => {
    const domain = descriptor.domain ?? '';
    // Le domaine n'est celui de L'AGENCE que pour une agence locale. Pour un
    // portail — fnaim, studapart — c'est celui du portail, et l'afficher comme
    // logo d'agence donnerait le logo du portail à des dizaines d'agences
    // différentes (§17).
    const ownSite = descriptor.kind === 'localAgency' && domain !== '';
    // Le logo n'est transporté que pour une agence : il n'a de sens qu'avec le
    // domaine qui l'accompagne.
    const logo = ownSite ? (descriptor.logo ?? null) : null;
    // Une source qui FAIT PAYER la mise en relation doit le dire à l'écran,
    // avant le clic. C'est un fait sur la source, il vient donc d'elle.
    const paidContact = descriptor.paidContact === true;
    // L'adresse de vitrine n'a de sens que pour une agence qui a son site : celle
    // d'un portail ne dirait rien des agences qu'il relaie.
    const address = ownSite ? (descriptor.agencyContact?.address ?? null) : null;
    // Le domaine est transporté POUR TOUT LE MONDE, portails compris : il sert
    // à reconnaître une agence sous ses graphies (« COT'OUEST IMMOBILIER » ne
    // rejoint « Cot'Ouest » que par `cot-ouest.fr`). C'est `kind` qui dit s'il
    // est affichable comme logo, et lui seul.
    // Les noms DÉCLARÉS suivent pour tout le monde : ils servent à reconnaître
    // l'agence sous la graphie d'un portail, avant même de savoir si son logo
    // est affichable.
    const alsoKnownAs = descriptor.alsoKnownAs ?? [];
    return `  '${descriptor.id}': { name: ${JSON.stringify(descriptor.name)}, domain: ${JSON.stringify(
      domain === '' ? null : domain,
    )}, kind: ${JSON.stringify(descriptor.kind)}, logo: ${JSON.stringify(logo)}, paidContact: ${String(paidContact)}, address: ${JSON.stringify(address)}, alsoKnownAs: ${JSON.stringify(alsoKnownAs)} },`;
  });

const file = `/**
 * ENGENDRÉ — ne pas modifier à la main.
 * Reconstruire avec \`pnpm --filter @maioun/frontend run sources\`.
 *
 * La table des sources, telle que le collecteur les déclare : un nom lisible,
 * un domaine, et de quoi savoir ce qu'on a le droit d'en faire.
 *
 * \`kind\` distingue le site PROPRE d'une agence (\`localAgency\`) du domaine d'un
 * portail. Seul le premier peut servir de logo : celui d'un portail donnerait
 * la même image à des dizaines d'agences distinctes.
 *
 * \`domain\` est renseigné pour tous, portails compris, parce qu'il sert aussi à
 * RECONNAÎTRE une agence sous ses graphies, et pas seulement à l'illustrer.
 *
 * \`logo\` n'est renseigné que pour les agences dont l'icône N'EST PAS à
 * \`/favicon.ico\` — c'est l'adresse que leur site déclare lui-même.
 *
 * \`paidContact\` marque les sources qui FONT PAYER la mise en relation :
 * l'écran le dit avant le clic, plutôt que de laisser découvrir le péage.
 *
 * \`address\` est l'adresse de vitrine que l'agence publie, quand on la connaît.
 *
 * \`alsoKnownAs\` porte les noms sous lesquels les PORTAILS la publient, quand la
 * règle de rapprochement ne peut pas les deviner — « BEP NICE » pour BEP
 * Logement. Relevés sur les annonces, jamais inventés.
 */

export interface SourceInfo {
  readonly name: string;
  readonly domain: string | null;
  /** Famille de la source : seule une \`localAgency\` a un site bien à elle. */
  readonly kind: 'portal' | 'agencyNetwork' | 'localAgency' | 'aggregator';
  readonly logo: string | null;
  /** La source vend la mise en relation : ses coordonnées ne sont pas libres. */
  readonly paidContact: boolean;
  /** Adresse de la vitrine de l'agence, telle qu'elle la publie. */
  readonly address: {
    readonly street: string;
    readonly postalCode: string;
    readonly city: string;
  } | null;
  /** Les autres noms sous lesquels les portails la publient. */
  readonly alsoKnownAs: readonly string[];
}

export const SOURCES: Readonly<Record<string, SourceInfo>> = {
${entries.join('\n')}
};
`;

// FORMATÉ AVANT D'ÊTRE ÉCRIT. Sans cela, chaque régénération produisait un
// fichier que `pnpm verify` refusait aussitôt — guillemets doubles, clés
// inutilement citées — et il fallait repasser Prettier à la main. Un fichier
// engendré doit sortir conforme du premier coup.
const formatted = await prettier.format(file, {
  ...(await prettier.resolveConfig(OUT)),
  filepath: OUT,
});

writeFileSync(OUT, formatted, 'utf8');
console.log(`${entries.length} sources écrites dans src/sources.generated.ts`);
