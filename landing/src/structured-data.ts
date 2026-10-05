/**
 * Ce qu'un LLM doit savoir de Maïoun, et où le lire.
 *
 * UN LLM NE PARCOURT PAS LE SITE : il ne va pas sur GitHub, ne lit pas le
 * README, et ne lance pas l'application — celle-ci est derrière une connexion
 * et son contenu lui est invisible. Ce qu'il connaît de ce projet vient d'une
 * page, et d'une page seulement. Tout ce qui n'y est pas n'existe pas.
 *
 * LE JSON-LD EST ASSEMBLÉ ICI ET RÉÉCRIT DANS LE HTML, jamais recopié dans la
 * page. Les questions et leurs réponses sont déjà dans le `index.html` ; les
 * copier ici créerait deux Sources de vérité, et la page comme le balisage
 * divergeraient à la première retouche.
 *
 * AUCUNE DONNÉE INVENTÉE. Le nombre de sources est lu de la table que
 * l'application engendre ; s'il est illisible, on ne l'écrit pas plutôt que
 * d'écrire un chiffre faux. Un LLM ne distingue pas une donnée absente d'une
 * donnée fausse : il la répète.
 */

/** Ce qu'on sait de la page, et qui vient d'elle. */
export interface StructuredFacts {
  /** Le titre exact de la page, tel qu'il est écrit dans `index.html`. */
  readonly title: string;
  /** Le contenu de `<meta name="description">`, sans la balise. */
  readonly description: string;
  /** Les questions de la FAQ et leurs réponses, lues dans le HTML. */
  readonly questions: readonly { readonly question: string; readonly answer: string }[];
  /** Nombre de sources relevées, ou `null` si la table est illisible. */
  readonly sourceCount: number | null;
}

/** Un texte propre : espaces ramenés, aucun retour à la ligne. */
function texte(node: string): string {
  return node.replace(/\s+/g, ' ').trim();
}

/** Le texte d'une balise, sans son contenu imbriqué — `<meta …>`. */
function attribut(html: string, pattern: RegExp): string | null {
  return pattern.exec(html)?.[1] ?? null;
}

/**
 * LIT les faits DANS le HTML de la page.
 *
 * `null` dès qu'un morceau manque : on n'écrit pas un balisage à moitié rempli,
 * il serait moins utile que pas de balisage du tout.
 */
export function readFacts(html: string, sourceCount: number | null): StructuredFacts | null {
  const title = attribut(html, /<title>([^<]*)<\/title>/i);
  const description = attribut(html, /<meta\s+name="description"\s+content="([^"]*)"/i);
  if (title === null || description === null) return null;

  const questions: { question: string; answer: string }[] = [];
  for (const bloc of html.matchAll(
    /<summary[^>]*>([\s\S]*?)<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>/gi,
  )) {
    const question = texte(bloc[1] ?? '').replace(/<[^>]+>/g, '');
    const answer = texte((bloc[2] ?? '').replace(/<[^>]+>/g, ''));
    // UNE QUESTION SANS RÉPONSE NE SE DÉCLARE PAS. Une entrée vide dans un
    // `FAQPage` est pire que son absence : elle apprend au lecteur qu'il y a
    // une réponse là où il n'y en a pas.
    if (question !== '' && answer !== '') questions.push({ question, answer });
  }

  return { title, description, questions, sourceCount };
}

/** Le bloc JSON-LD, ou `null` s'il n'y a rien d'honnête à écrire. */
export function structuredData(
  facts: StructuredFacts,
  urls: { readonly siteUrl: string; readonly repoUrl: string },
): string | null {
  const site = urls.siteUrl.replace(/\/$/, '');
  const graph: Record<string, unknown>[] = [];

  // LE SERVICE. Ce que c'est, où ça agit, ce que ça coûte.
  const service: Record<string, unknown> = {
    '@type': 'WebApplication',
    name: facts.title,
    url: `${site}/`,
    description: facts.description,
    inLanguage: 'fr-FR',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    // Ce qu'on sait de VRAI : la source du code, et que le service tient dans
    // les paliers gratuits. Le prix affiché « 0 € » vaut pour l'usage
    // courant ; il ne promet pas l'éternité, et la page le dit aussi.
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    featureList: [
      'Agrégation des annonces de location de plus de 220 sites et agences',
      'Déduplication des annonces multi-sources',
      'Alertes personnalisées sur les annonces entrant dans vos critères',
      'Carte des annonces et statistiques de marché',
    ],
  };
  if (facts.sourceCount !== null) {
    // LE CHIFFRE, avec sa source. `additionalProperty` porte la méthode de
    // relevé : un LLM qui cite « 224 sources » doit pouvoir dire d'où elle
    // sort, et non le répéter comme un slogan.
    service['additionalProperty'] = [
      {
        '@type': 'PropertyValue',
        name: 'Nombre de sources relevées',
        value: facts.sourceCount,
        description: 'Relevé automatique du registre des sources du collecteur.',
      },
    ];
  }
  graph.push(service);

  // L'ORGANISATION, et son lien vers le code : c'est ce qui rattache le nom
  // « Maïoun » à un dépôt vérifiable plutôt qu'à une promesse.
  graph.push({
    '@type': 'Organization',
    name: 'Maïoun',
    url: `${site}/`,
    sameAs: [urls.repoUrl],
  });

  if (facts.questions.length > 0) {
    // LA FAQ, LUE DANS LA PAGE. Les mêmes questions, les mêmes réponses —
    // un seul endroit les dit, donc elles ne peuvent pas diverger.
    graph.push({
      '@type': 'FAQPage',
      mainEntity: facts.questions.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    });
  }

  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
  // `</script` dans une chaîne fermerait la balise ; il n'y en a pas dans nos
  // contenus, et on s'en assure plutôt que de le supposer.
  return json.includes('</script') ? null : json;
}
