/**
 * Une recherche reçue par lien (§39).
 *
 * ON DEMANDE AVANT D'APPLIQUER, et ce n'est pas une politesse. Appliquer une
 * recherche REMPLACE les critères du compte — budget, surface, quartiers,
 * exclusions —, c'est-à-dire ce que la prochaine collecte ira chercher et ce
 * qui déclenchera des alertes. Un lien qui referait ces réglages en silence
 * serait une mauvaise surprise pour qui a passé du temps à les poser.
 *
 * L'ÉCRAN DIT CE QU'IL VA FAIRE, en toutes lettres et avant le clic : la
 * phrase de résumé est la même que dans la liste des recherches enregistrées,
 * de sorte qu'on lit exactement ce qu'on va obtenir.
 *
 * DEUX SORTIES, PAS UNE. « Appliquer » remplace les critères ; « Enregistrer
 * seulement » la range parmi les recherches enregistrées, où elle attendra —
 * c'est le bon geste quand on reçoit le lien d'un ami au milieu de sa propre
 * recherche et qu'on ne veut rien perdre.
 */

import { ArrowLeft, Bookmark, Check, TriangleAlert } from './icons.js';
import { describeSearch, type SavedSearch } from '../saved-searches.js';
import { decodeSearch } from '../share-search.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';

export function SharedSearch({
  token,
  onApply,
  onSave,
  onCancel,
}: {
  readonly token: string;
  /** Remplace les critères du compte et ouvre la liste. */
  readonly onApply: (search: SavedSearch) => void;
  /** Range la recherche sans rien changer à l'écran courant. */
  readonly onSave: (search: SavedSearch) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const shared = decodeSearch(token);

  if (shared === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[460px] flex-col justify-center px-4">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Lien illisible</h1>
        <Card>
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-sm">
              <TriangleAlert aria-hidden="true" className="text-bad mt-0.5 size-5 shrink-0" />
              <span>
                Ce lien de recherche n’a pas pu être lu. Il a peut-être été coupé en route — les
                messageries raccourcissent parfois les adresses longues. Demandez qu’on vous le
                renvoie, ou continuez avec vos propres critères.
              </span>
            </p>
            <Button onClick={onCancel}>
              <ArrowLeft aria-hidden="true" className="size-4" /> Continuer
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  // L'identité est fabriquée ICI, à la réception : le lien ne porte aucun
  // identifiant, et deux personnes qui reçoivent le même lien ne doivent pas
  // se retrouver avec la même clé dans leurs réglages.
  const search: SavedSearch = {
    id: `partage-${Date.now().toString(36)}`,
    name: shared.name,
    createdAt: new Date().toISOString(),
    criteria: shared.criteria,
    view: shared.view,
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[460px] flex-col justify-center px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Une recherche vous est partagée</h1>
      <p className="text-muted-foreground mb-5 text-sm">
        Rien n’est appliqué tant que vous ne l’avez pas demandé.
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-semibold">{search.name}</p>
            <p className="text-muted-foreground text-sm">{describeSearch(search)}</p>
          </div>

          <p className="border-border rounded-lg border px-3 py-2 text-[0.85rem]">
            « Appliquer » remplace vos critères de recherche : c’est ce que la prochaine collecte
            ira chercher, et ce qui déclenchera vos alertes. Vos favoris, votre suivi et votre
            profil ne changent pas.
          </p>

          <div className="flex flex-col gap-2">
            <Button onClick={() => onApply(search)}>
              <Check aria-hidden="true" className="size-4" /> Appliquer cette recherche
            </Button>
            <Button variant="outline" onClick={() => onSave(search)}>
              <Bookmark aria-hidden="true" className="size-4" /> Enregistrer seulement
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              <ArrowLeft aria-hidden="true" className="size-4" /> Garder mes critères
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}
