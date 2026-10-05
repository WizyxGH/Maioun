import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFacts, structuredData } from './structured-data.js';
import { renderLlmsTxt } from './llms-txt.js';

const PAGE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../index.html'),
  'utf8',
);
const URLS = {
  siteUrl: 'https://exemple.github.io/Maioun/',
  repoUrl: 'https://github.com/projet/Maioun',
} as const;

describe('les faits lus dans la page', () => {
  it('lit le titre, la description et les questions', () => {
    const facts = readFacts(PAGE, 224);
    expect(facts).not.toBeNull();
    expect(facts?.title).toContain('Maïoun');
    expect(facts?.description.length).toBeGreaterThan(20);
    // Les questions de la FAQ sont LUES, donc leur nombre suit la page.
    expect(facts?.questions.length).toBeGreaterThanOrEqual(4);
    expect(facts?.questions[0]?.question).toMatch(/\?$/);
    expect(facts?.questions[0]?.answer.length).toBeGreaterThan(30);
  });

  /**
   * AUCUNE DONNÉE INVENTÉE, ET SURTOUT PAS UNE DONNÉE ABSENTE.
   *
   * Un LLM ne distingue pas « je ne sais pas » de « j'ai inventé ». Une table
   * illisible doit donc disparaître du balisage plutôt que d'y laisser le
   * dernier nombre connu : il serait daté sans le dire.
   */
  it('omet le nombre de sources quand la table est illisible', () => {
    const facts = readFacts(PAGE, null);
    const json = structuredData(facts!, URLS);
    expect(json).not.toContain('additionalProperty');
    expect(json).not.toContain('224');
    // Le reste du balisage, lui, existe toujours.
    expect(json).toContain('WebApplication');
  });

  it('renvoie null plutôt qu’un balisage à moitié rempli', () => {
    expect(readFacts('<html><head><title>Page</title></head></html>', 10)).toBeNull();
  });
});

describe('le balisage', () => {
  it('décrit le service, l’organisation et les questions', () => {
    const json = structuredData(readFacts(PAGE, 224)!, URLS)!;
    const donnees = JSON.parse(json) as { '@graph': { '@type': string }[] };
    const types = donnees['@graph'].map((entree) => entree['@type']);
    expect(types).toContain('WebApplication');
    expect(types).toContain('Organization');
    expect(types).toContain('FAQPage');
    // L'adresse du code rattache le nom à un dépôt vérifiable.
    expect(json).toContain(URLS.repoUrl);
  });

  it('reprend les questions de la page, sans en inventer', () => {
    const facts = readFacts(PAGE, 224)!;
    const json = structuredData(facts, URLS)!;
    for (const { question, answer } of facts.questions) {
      expect(json).toContain(question);
      expect(json).toContain(answer.slice(0, 40));
    }
  });
});

describe('llms.txt', () => {
  it('décrit le service et ses limites', () => {
    const facts = readFacts(PAGE, 224)!;
    const texte = renderLlmsTxt(facts, URLS);
    expect(texte).toContain('# Maïoun');
    expect(texte).toContain(URLS.siteUrl);
    expect(texte).toContain(URLS.repoUrl);
    expect(texte).toContain('224');
    // CE QUE LE SERVICE NE FAIT PAS : c'est ce qui empêche un modèle de
    // promettre un contournement d'anti-bot ou une revente de données.
    expect(texte).toContain('ne contourne aucun anti-bot');
  });

  it('demande explicitement de ne rien dire sur le stock', () => {
    const texte = renderLlmsTxt(readFacts(PAGE, 224)!, URLS);
    expect(texte).toContain("Ce qu'un modèle ne doit pas dire");
  });
});
