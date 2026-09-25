/**
 * LE SCORE DE LA FICHE, ET LE DÉTAIL DE CE QUI LE COMPOSE (§37).
 *
 * UN SEUL CHIFFRE SUR LA FICHE, et les raisons dessous. Les quatre mesures qui
 * le composent s'affichaient encore chacune avec SA note sur cent : cinq
 * chiffres pour une annonce, dont quatre qu'on ne savait pas quoi faire — et
 * « Urgence 10/100 » se lisait comme un verdict alors que ce n'est qu'un
 * ingrédient, pesé à 35 %. Elles restent là pour ce qu'elles apportent : le
 * POURQUOI, en clair, sans note.
 *
 * Deux exigences du cahier des charges se rejoignent ici :
 *   - §19 : afficher les RAISONS, pas seulement le chiffre ;
 *   - §17/§18 : signaler ce que le score ignore, pour ne pas laisser croire à
 *     une précision inexistante.
 */

import type { ExplainedScore } from '@maioun/shared';
import { SCORE_EXPLANATION, scoreBand } from '@maioun/shared';
import { Card } from '@/components/ui/card.js';
import { Check, Dot, TriangleAlert } from './icons.js';

/**
 * LE SCORE, UNE FOIS — et les mesures qui le composent en dessous.
 *
 * La fiche montrait QUATRE scores côte à côte, à égalité de taille et de
 * traitement : « Correspondance 71 », « Urgence 48 », « Facilité de contact
 * 60 », « Signaux d'alerte 12 ». Rien ne disait lequel regarder d'abord, ni ce
 * qu'il fallait en conclure — et la liste, elle, triait déjà sur un cinquième
 * chiffre qui ne s'affichait nulle part.
 *
 * C'est ce cinquième chiffre qui est ici, avec sa recette et son échelle
 * écrites à côté, et CE QUI L'A FAIT dans la même carte : le score dit quoi
 * faire, le détail dit pourquoi, et les séparer en deux cartes donnait deux
 * objets là où il n'y a qu'un sujet.
 */
export function OverallScore({
  value,
  children,
}: {
  readonly value: number;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { label, rank } = scoreBand(value);
  const tone = toneFor(value);

  return (
    <section className="mb-3">
      <Card className="p-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">Score Maïoun</h2>
          <span className={`text-2xl font-bold ${TONE_TEXT[tone]}`}>{value}/100</span>
        </div>
        {/* LE RANG PLUTÔT QUE LA NOTE : la meilleure annonce du moment est à 74
          et la moyenne à 53. « 53 sur 100 » se lit « médiocre » alors qu'il
          veut dire « au milieu de ce qui existe à Nice aujourd'hui ». */}
        <p className="mt-0.5 text-sm font-medium">
          {label} — {rank}.
        </p>
        {/* UN SEUL DÉPLIANT, et non deux. « Comment il est calculé » et « Ce qui
          a fait ce score » se suivaient sous la même note, chacun avec sa
          flèche : deux gestes pour une seule question — d'où vient ce chiffre.
          La règle du barème ouvre désormais le détail, juste avant les raisons
          qui l'appliquent. */}
        {children}
      </Card>
    </section>
  );
}

/** Palette par plage : vert au-dessus de 75, orange au-dessus de 50, rouge sinon. */
function toneFor(value: number): 'good' | 'medium' | 'bad' {
  if (value >= 75) return 'good';
  if (value >= 50) return 'medium';
  return 'bad';
}

/**
 * Classes complètes par ton — jamais de `text-${tone}` dynamique : le scanner
 * Tailwind ne détecte que les littéraux.
 */
const TONE_TEXT: Record<'good' | 'medium' | 'bad', string> = {
  good: 'text-good',
  medium: 'text-medium',
  bad: 'text-bad',
};

interface ScoreGroup {
  readonly title: string;
  readonly score: ExplainedScore;
  /** Le score de risque se lit à l'envers : y monter est une mauvaise nouvelle. */
  readonly invert?: boolean;
  /** Note méthodologique affichée sous le groupe, quand elle s'impose (§18). */
  readonly caveat?: string;
}

/**
 * CE QUI A FAIT LE SCORE, en un seul dépliant.
 *
 * Quatre cartes portaient quatre notes sur cent, à égalité de taille avec le
 * score lui-même. Les raisons restent — §19 demande d'afficher les RAISONS, et
 * §17 de dire ce qui manque plutôt que de le taire — mais les notes partent :
 * c'est le chiffre du haut qu'on regarde, et lui seul a une échelle écrite.
 *
 * Les groupes demeurent visibles, parce qu'une raison se comprend par ce
 * qu'elle sert : « Agence identifiable » sous « Signaux d'alerte » ne dit pas
 * la même chose que sous « Facilité de contact ».
 */
export function ScoreBreakdown({
  groups,
}: {
  readonly groups: readonly ScoreGroup[];
}): React.JSX.Element {
  return (
    <div className="border-border mt-2 border-t pt-1">
      <details data-testid="score-detail" className="group">
        <summary className="flex cursor-pointer list-none items-baseline justify-between py-2">
          <h3 className="text-base font-semibold">
            Ce qui a fait ce score
            <span
              aria-hidden="true"
              className="ml-1.5 inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90"
            >
              ▸
            </span>
          </h3>
        </summary>

        <div className="pb-2">
          {/* LE BARÈME D'ABORD, LES RAISONS ENSUITE : on ne comprend « 590 € ≤
            700 € de budget » qu'en sachant que la correspondance pèse 30 %. */}
          <p className="mb-3 text-[0.82rem] text-muted-foreground">{SCORE_EXPLANATION}</p>
          {groups.map((groupe) => (
            <section key={groupe.title} className="mt-2 first:mt-0">
              <h4 className="text-[0.82rem] font-semibold text-muted-foreground uppercase">
                {groupe.title}
              </h4>
              {groupe.caveat !== undefined && (
                <p className="text-[0.82rem] text-muted-foreground italic">{groupe.caveat}</p>
              )}
              <ul className="mt-1 text-sm">
                {/* `?? []` : une annonce venue de la LISTE n'a pas le détail des
                  raisons — il est retiré en SQL, avec la description. La fiche
                  redemande la version complète, mais le rendu ne doit pas tomber
                  en attendant. */}
                {(groupe.score.reasons ?? []).map((reason, index) => (
                  <li key={`${reason.code}-${index}`} className="flex gap-2 py-0.5">
                    <span aria-hidden="true" className="flex w-4 shrink-0 justify-center pt-0.5">
                      <ReasonIcon delta={reason.delta} invert={groupe.invert ?? false} />
                    </span>
                    <span>{reason.label}</span>
                  </li>
                ))}
              </ul>

              {/* §17 : dire explicitement ce qui manquait plutôt que de le taire. */}
              {groupe.score.unknownSignals.length > 0 && (
                <p className="mt-1.5 text-[0.82rem] text-muted-foreground italic">
                  Information non fournie par les sources : {groupe.score.unknownSignals.join(', ')}
                  .
                </p>
              )}
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}

/**
 * Pictogramme d'une raison de score : un point quand elle est neutre, une
 * coche quand elle joue en faveur, un avertissement quand elle pèse contre.
 * Le score de RISQUE s'inverse — un delta positif y est une mauvaise nouvelle.
 */
function ReasonIcon({
  delta,
  invert,
}: {
  readonly delta: number;
  readonly invert: boolean;
}): React.JSX.Element {
  if (delta === 0) return <Dot className="size-4" />;
  const bad = delta < 0 || invert;
  return bad ? <TriangleAlert className="size-3.5" /> : <Check className="size-3.5" />;
}
