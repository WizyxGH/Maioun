/**
 * Les témoignages de la page de présentation.
 *
 * AUCUN N'EST INVENTÉ, ET LE FICHIER LE GARANTIT. Un faux avis est une
 * pratique commerciale trompeuse (Code de la consommation, art. L121-2 et
 * L121-4, depuis la directive « Omnibus ») — et sur une page qui promet
 * qu'« aucune annonce n'est inventée », ce serait se contredire au premier
 * paragraphe. La section ne s'affiche donc que s'il existe au moins un
 * témoignage RÉEL, et chacun doit porter la date à laquelle son auteur a
 * accepté d'être cité.
 *
 * SANS JAVASCRIPT : la section est composée À LA CONSTRUCTION, comme le reste de
 * la page. Un témoignage mal formé fait échouer la construction plutôt que de
 * partir en ligne à moitié.
 */

import { readFileSync } from 'node:fs';

/** Un témoignage, tel qu'il s'écrit dans `temoignages.json`. */
export interface Testimonial {
  /** Prénom, ou initiales — jamais le nom complet sans accord explicite. */
  readonly auteur: string;
  /** Ce que la personne a écrit, sans retouche. */
  readonly texte: string;
  /** Quartier ou commune du logement trouvé. Facultatif. */
  readonly lieu?: string;
  /** Mois où le logement a été trouvé, `AAAA-MM`. */
  readonly trouve: string;
  /**
   * Date à laquelle l'auteur a accepté d'être cité, `AAAA-MM-JJ`.
   *
   * OBLIGATOIRE. C'est la trace qu'on peut produire si on nous la demande, et
   * ce qui distingue une citation d'une appropriation.
   */
  readonly consentement: string;
}

/** Échappe le texte : il vient d'un tiers et part dans du HTML. */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 2026-09 » → « septembre 2026 ». */
function moisEnClair(value: string): string {
  const [annee, mois] = value.split('-');
  return `${MOIS[Number(mois) - 1] ?? ''} ${annee ?? ''}`.trim();
}

/**
 * Lit et VALIDE les témoignages.
 *
 * @throws si une entrée est mal formée — en particulier sans consentement daté.
 */
export function readTestimonials(path: string): readonly Testimonial[] {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${path} : une liste est attendue`);

  return raw.map((entry: unknown, index): Testimonial => {
    const t = entry as Partial<Record<keyof Testimonial, unknown>>;
    const probleme = (quoi: string): Error => new Error(`${path} [${index}] : ${quoi}`);
    if (typeof t.auteur !== 'string' || t.auteur.trim() === '') throw probleme('auteur manquant');
    if (typeof t.texte !== 'string' || t.texte.trim() === '') throw probleme('texte manquant');
    if (typeof t.trouve !== 'string' || !/^\d{4}-\d{2}$/.test(t.trouve)) {
      throw probleme('« trouve » doit être au format AAAA-MM');
    }
    if (typeof t.consentement !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.consentement)) {
      throw probleme('consentement daté obligatoire (AAAA-MM-JJ) — pas de citation sans accord');
    }
    if (t.lieu !== undefined && typeof t.lieu !== 'string') throw probleme('« lieu » invalide');
    return {
      auteur: t.auteur.trim(),
      texte: t.texte.trim(),
      trouve: t.trouve,
      consentement: t.consentement,
      ...(typeof t.lieu === 'string' && t.lieu.trim() !== '' ? { lieu: t.lieu.trim() } : {}),
    };
  });
}

/**
 * La section entière, ou une chaîne VIDE s'il n'y a aucun témoignage.
 *
 * Vide et non « bientôt des témoignages » : un encart qui annonce des avis
 * absents fait plus douter qu'il ne rassure.
 */
export function renderTestimonials(list: readonly Testimonial[]): string {
  if (list.length === 0) return '';
  const cartes = list
    .map(
      (t) => `
          <figure class="card lift reveal flex flex-col p-5">
            <blockquote class="flex-1 text-[0.95rem]">« ${escape(t.texte)} »</blockquote>
            <figcaption class="mt-4 text-[0.85rem] text-muted-foreground">
              <span class="font-semibold text-foreground">${escape(t.auteur)}</span>
              — logement trouvé${t.lieu !== undefined ? ` à ${escape(t.lieu)}` : ''} en ${escape(moisEnClair(t.trouve))}
            </figcaption>
          </figure>`,
    )
    .join('');

  return `
      <!-- ═══ TÉMOIGNAGES ═══════════════════════════════════════════════════ -->
      <section id="temoignages" class="mx-auto max-w-6xl px-5 pb-20">
        <div class="reveal">
          <p class="eyebrow">Ils ont trouvé</p>
          <h2 class="mt-2 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
            Des logements trouvés avec Maïoun
          </h2>
        </div>
        <div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${cartes}
        </div>
        <p class="mt-6 text-[0.8rem] text-muted-foreground">
          Témoignages réels, cités avec l’accord de leurs auteurs, sans retouche.
        </p>
      </section>`;
}
