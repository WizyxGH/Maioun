/**
 * QUAND UN PANNEAU N'A PAS PU LIRE SES DONNÉES.
 *
 * Cinq panneaux, cinq manières de le dire — et trois d'entre elles ne le
 * disaient pas :
 *
 *   — « Chargement… » qui ne partait JAMAIS, l'échec ayant remis l'état à sa
 *     valeur de départ. On attendait devant un écran qui n'attendait plus rien ;
 *   — un bloc simplement absent, laissant un écran à moitié vide sans un mot ;
 *   — un échec déguisé en donnée, « pas d'offre » là où il fallait lire « on
 *     n'a pas pu savoir ».
 *
 * Les trois se ressemblent de l'extérieur : rien ne bouge, et rien n'explique.
 * Le pire est qu'aucune ne propose le seul geste utile — recommencer.
 *
 * TROIS ÉTATS DISTINCTS, JAMAIS DEUX. En cours, chargé, échoué : confondre
 * l'échec avec l'un des deux autres est la faute commune à ces trois cas.
 */

import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';

export function EchecDeChargement({
  /** Ce qu'on n'a pas pu lire, au complément direct : « vos statistiques ». */
  quoi,
  /** Relancer la lecture. Absent, on n'affiche pas de bouton qui ne ferait rien. */
  onReessayer,
}: {
  readonly quoi: string;
  readonly onReessayer?: () => void;
}): React.JSX.Element {
  return (
    // `role="alert"` : l'échec arrive APRÈS le rendu, un lecteur d'écran ne le
    // verrait pas passer autrement — l'attente, elle, est annoncée par les
    // squelettes (`role="status"`).
    <Alert variant="destructive" role="alert" className="mt-4">
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>Impossible de charger {quoi}. Votre connexion, ou le service, n’a pas répondu.</span>
        {onReessayer !== undefined && (
          <Button size="sm" variant="outline" onClick={onReessayer}>
            Réessayer
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
