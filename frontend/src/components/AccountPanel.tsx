/**
 * Votre compte : s'en aller, et s'effacer (RGPD, articles 15 et 17).
 *
 * IL N'Y AVAIT AUCUNE PORTE DE SORTIE. La fonction `logout` existait dans le
 * client d'API depuis le début — et n'était appelée nulle part : pas un bouton
 * dans toute l'interface. On entrait, on ne sortait plus, et un ordinateur
 * partagé gardait la session ouverte pour le suivant. Quant à supprimer son
 * compte, cela demandait quelqu'un ayant accès à la base.
 *
 * LES DEUX GESTES NE SE RESSEMBLENT PAS, et l'écran doit le montrer. Se
 * déconnecter est anodin et réversible : un bouton ordinaire. Supprimer son
 * compte est immédiat et définitif : il faut le demander, puis le confirmer en
 * saisissant son mot de passe. Rien n'est effacé avant.
 *
 * LE MOT DE PASSE, ALORS QU'ON EST DÉJÀ CONNECTÉ. Ce n'est pas une formalité :
 * c'est la seule chose qui distingue le propriétaire du compte de quiconque a
 * la main sur son écran resté ouvert.
 *
 * ON DIT CE QUI DISPARAÎT, ET CE QUI RESTE. Les annonces ne sont à personne —
 * ce sont des offres publiques, et elles restent visibles pour les autres
 * comptes. Ce qui s'efface, c'est tout ce qui vous relie à elles.
 */

import { useState } from 'react';
import { ArrowLeft, ShieldCheck, SignOut, Trash2, TriangleAlert } from './icons.js';
import { deleteAccount, logout } from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';

export function AccountPanel({
  onBack,
  onSignedOut,
}: {
  readonly onBack: () => void;
  /** Appelé après une déconnexion COMME après une suppression : dans les deux
   * cas il n'y a plus de session, et l'écran de connexion doit reprendre. */
  readonly onSignedOut: () => void;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signOut = async (): Promise<void> => {
    setBusy(true);
    await logout();
    setBusy(false);
    onSignedOut();
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const outcome = await deleteAccount(password);
    setBusy(false);
    if (outcome === 'done') {
      onSignedOut();
      return;
    }
    setError(
      outcome === 'wrong-password'
        ? 'Mot de passe incorrect.'
        : 'La suppression n’a pas abouti. Réessayez dans un instant.',
    );
    setPassword('');
  };

  return (
    <section className="flex flex-col gap-5">
      <div>
        <Button variant="ghost" className="mb-2 -ml-2" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Paramètres
        </Button>
        <h1 className="text-xl font-bold">Votre compte</h1>
      </div>

      <Card>
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Se déconnecter</h2>
          <p className="text-muted-foreground text-sm">
            Ferme la session sur cet appareil. Vos données restent : vous les retrouverez à la
            prochaine connexion.
          </p>
          <Button variant="outline" onClick={() => void signOut()} disabled={busy}>
            <SignOut aria-hidden="true" className="size-4" /> Se déconnecter
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Supprimer mon compte</h2>
          <p className="text-muted-foreground text-sm">
            Effacement immédiat et définitif de votre identifiant, de votre adresse, de votre profil
            locataire, de vos pièces déposées, de vos favoris, de votre suivi et de vos recherches
            enregistrées. Il n’y a ni corbeille ni délai : rien ne pourra être restauré.
          </p>
          <p className="text-muted-foreground text-sm">
            Les annonces, elles, ne vous appartiennent pas : ce sont des offres publiées par des
            agences, et elles restent visibles pour les autres comptes.
          </p>

          {!confirming ? (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden="true" className="size-4" /> Supprimer mon compte…
            </Button>
          ) : (
            <form
              className="border-bad/40 bg-bad/5 flex flex-col gap-3 rounded-lg border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              <p className="flex items-start gap-2 text-sm font-medium">
                <TriangleAlert aria-hidden="true" className="text-bad mt-0.5 size-5 shrink-0" />
                <span>Saisissez votre mot de passe pour confirmer la suppression.</span>
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[0.85rem] font-medium">Mot de passe</span>
                <input
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full text-base"
                />
              </label>

              {error !== null && (
                <p role="alert" className="text-bad text-sm">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="destructive" disabled={busy || password === ''}>
                  <Trash2 aria-hidden="true" className="size-4" />
                  {busy ? 'Suppression…' : 'Supprimer définitivement'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setConfirming(false);
                    setPassword('');
                    setError(null);
                  }}
                >
                  Annuler
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      <p className="text-muted-foreground flex items-start gap-2 text-[0.82rem]">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Vos données ne servent qu’à cet outil : elles ne sont ni revendues, ni transmises à un
          tiers. Votre adresse e-mail ne sert qu’à récupérer votre compte.
        </span>
      </p>
    </section>
  );
}
