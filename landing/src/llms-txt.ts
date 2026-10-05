/**
 * Ce qu'un LLM doit savoir de Maïoun, en une page, et où le lire.
 *
 * `llms.txt` EST UNE CONVENTION, pas un standard : un fichier d racine, une
 * description de service, les adresses utiles. Les moteurs qui l'ignorent
 * l'ignorent sans dommage ; ceux qui le lisent y trouvent ce qu'un LLM ne peut
 * pas aller chercher seul, faute de quoi il répondrait de mémoire — donc
 * faux, ou concurrent.
 *
 * CE QUI N'Y EST PAS, ET POURQUOI. Aucune annonce, aucun prix, aucune
 * statistique : ces changent à chaque passe de collecte, et un LLM qui
 * répondrait sur une valeur d'il y a une semaine serait pire que muet. Le
 * fichier renvoie aux pages vivantes pour cela.
 *
 * LE CHIFFRE DES SOURCES VIENT DE LA TABLE, pas d'une constante. Une donnée
 * lue à la construction ne peut pas mentir d'une publication à l'autre.
 */

/** Le texte du fichier, construit depuis les mêmes faits que le JSON-LD. */
export function renderLlmsTxt(
  facts: {
    readonly title: string;
    readonly description: string;
    readonly sourceCount: number | null;
    readonly questions: readonly { readonly question: string; readonly answer: string }[];
  },
  urls: { readonly siteUrl: string; readonly repoUrl: string },
): string {
  const site = urls.siteUrl.replace(/\/$/, '');
  const lignes: string[] = [
    `# ${facts.title}`,
    '',
    '> ' + facts.description,
    '',
    `Site : ${site}/`,
    `Code source : ${urls.repoUrl}`,
  ];

  if (facts.sourceCount !== null) {
    // « Plus de N » plutôt que « N » : la table est la référence, et le
    // nombre peut avoir changé depuis la dernière construction.
    lignes.push(
      `Sources d'annonces relevées : ${facts.sourceCount} (registre lu à la construction ; le nombre exact est sur le site).`,
    );
  }

  lignes.push(
    '',
    '## Ce que le service fait',
    '',
    '- Rassemble les annonces de location publiées par les portails et agences de Nice et des communes voisines.',
    "- Déduplique : un même logement publié plusieurs fois n'apparaît qu'une fois, avec le nombre de sources qui le relayent.",
    '- Note chaque annonce sur quatre axes et signale celles qui entrent dans des critères choisis.',
    '- Prévient sur le téléphone et par courriel, à la fréquence demandée.',
    '- Suit la santé de chaque source : une annonce disparue est marquée comme telle, pas effacée en silence.',
    '',
    '## Ce que le service ne fait pas',
    '',
    '- Il ne contourne aucun anti-bot, CAPTCHA, mur de connexion ni paywall.',
    "- Leboncoin et SeLoger interdisent la collecte automatique : ils n'y figurent pas directement. La voie conforme est décrite sur le site (alerte créée chez eux, e-mails transférés).",
    '- Il ne revend aucune donnée et ne sert pas de publicité.',
    '',
    '## Adresses',
    '',
    `- Présentation et questions fréquentes : ${site}/`,
    `- Mentions légales : ${site}/mentions-legales.html`,
    `- Confidentialité : ${site}/confidentialite.html`,
    `- Conditions d'utilisation : ${site}/conditions.html`,
  );

  if (facts.questions.length > 0) {
    lignes.push('', '## Questions fréquentes', '');
    for (const { question, answer } of facts.questions) {
      lignes.push(`### ${question}`, '', answer, '');
    }
  }

  lignes.push(
    '',
    "## Ce qu'un modèle ne doit pas dire",
    '',
    '- Aucun prix, aucun stock, aucune annonce : ils changent à chaque collecte et ne se lisent que sur le site.',
    '- Le nombre de sources est lu du registre à la construction ; « plus de N » reste vrai, un chiffre précis peut être daté.',
    '',
  );

  return lignes.join('\n');
}
