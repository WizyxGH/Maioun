/**
 * L'offre : ce qui est gratuit, ce qui se paie, et où l'on en est.
 *
 * TROIS MARCHES, ET UNE SEULE SE PAIE. Consulter les annonces est libre et le
 * restera ; agir — favori, dossier, suivi, alertes — demande un compte gratuit ;
 * candidater à votre place se paie. Cet écran doit rendre cette frontière
 * ÉVIDENTE, parce qu'une frontière floue passe pour un piège.
 *
 * ON N'AFFICHE PAS DE BOUTON QUI ÉCHOUERAIT. Tant qu'aucune clé de paiement
 * n'est branchée, l'écran le dit et ne propose rien : c'est l'état actuel du
 * projet, et le cacher derrière un bouton mort ne servirait personne.
 */

import { useEffect, useState } from 'react';
import { fetchPlan, startCheckout, type PlanView } from '../api/client.js';
import { Button } from './ui/button.js';
import { ArrowLeft } from './icons.js';
import { Alert, AlertDescription } from './ui/alert.js';

/** Ce que chaque marche donne. La liste est la promesse : elle doit être vraie. */
const MARCHES: readonly { readonly titre: string; readonly lignes: readonly string[] }[] = [
  {
    titre: 'Sans compte',
    lignes: [
      'Toutes les annonces, avec photos, scores et repères de prix',
      'La carte, les quartiers, les statistiques du marché',
    ],
  },
  {
    titre: 'Compte gratuit',
    lignes: [
      'Favoris, annonces archivées, suivi de vos échanges',
      'Alertes par notification et par e-mail',
      'Dossier de candidature et profil locataire',
    ],
  },
  {
    titre: 'Offre payante',
    lignes: [
      'Candidature envoyée à votre place, dès la parution',
      'Vos pièces jointes automatiquement',
      'Les garde-fous restent les vôtres : seuils, quotas, interrupteur',
    ],
  },
];

/** La date de fin, écrite comme on la lit. */
function jusquau(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
}

export function PlanPanel({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [ouverture, setOuverture] = useState(false);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    let vivant = true;
    void fetchPlan()
      .then((view) => {
        if (vivant) setPlan(view);
      })
      // Une offre qu'on ne sait pas lire n'est pas une offre à vendre : on
      // retombe sur « pas configuré » plutôt que de proposer au hasard.
      .catch(() => {
        if (vivant) setPlan({ plan: 'unconfigured', until: null });
      });
    return () => {
      vivant = false;
    };
  }, []);

  const payer = async (): Promise<void> => {
    setOuverture(true);
    setEchec(false);
    const url = await startCheckout();
    if (url === null) {
      setEchec(true);
      setOuverture(false);
      return;
    }
    // On QUITTE le site : le paiement se fait chez Stripe, sur sa page, et le
    // numéro de carte ne traverse jamais ce code.
    window.location.href = url;
  };

  return (
    <div>
      <header className="mb-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Retour
        </Button>
      </header>
      <h1 className="mb-1 text-xl font-bold">Votre offre</h1>
      <p className="text-muted-foreground mb-5 text-sm">
        Consulter est libre. Un compte gratuit sert à agir. Seule la candidature envoyée à votre
        place se paie.
      </p>

      {plan !== null && (
        <div className="border-border mb-5 rounded-xl border p-4">
          {plan.plan === 'paid' && (
            <p className="text-sm">
              <span className="font-medium">Offre payante active.</span>{' '}
              {plan.until === null ? 'N/A' : `Jusqu’au ${jusquau(plan.until)}.`}
            </p>
          )}
          {plan.plan === 'expired' && (
            <p className="text-sm">
              <span className="font-medium">Votre abonnement a pris fin.</span> Vos favoris, votre
              dossier et vos alertes restent en place — seule la candidature automatique s’arrête.
            </p>
          )}
          {plan.plan === 'free' && (
            <p className="text-sm">
              <span className="font-medium">Compte gratuit.</span> Tout fonctionne, sauf la
              candidature envoyée à votre place.
            </p>
          )}
          {plan.plan === 'unconfigured' && (
            <p className="text-sm">
              {/* §17 : on ne fait pas croire à un chemin qui n'existe pas. */}
              <span className="font-medium">L’offre payante n’est pas encore ouverte.</span> Le
              paiement n’est pas branché sur cette installation : rien n’est encaissé, et la
              candidature automatique reste fermée pour tout le monde.
            </p>
          )}
        </div>
      )}

      <ul className="mb-5 flex flex-col gap-3">
        {MARCHES.map((marche) => (
          <li key={marche.titre} className="border-border rounded-xl border p-4">
            <h2 className="mb-2 font-medium">{marche.titre}</h2>
            <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
              {marche.lignes.map((ligne) => (
                <li key={ligne}>· {ligne}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {(plan?.plan === 'free' || plan?.plan === 'expired') && (
        <Button type="button" onClick={() => void payer()} disabled={ouverture} className="w-full">
          {ouverture ? 'Ouverture…' : 'Passer à l’offre payante'}
        </Button>
      )}
      {echec && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            La page de paiement n’a pas pu s’ouvrir. Réessayez plus tard.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
