/**
 * Se déconnecter, supprimer son compte — au pied des Paramètres.
 *
 * Ces deux gestes vivaient derrière un écran « Votre compte », qu'il fallait
 * ouvrir pour trouver ce qu'on cherchait. Ce sont deux boutons : ils sont
 * maintenant là où on les cherche, sans texte, à côté l'un de l'autre.
 *
 * CHACUN DEMANDE CONFIRMATION, et pas de la même façon. Se déconnecter est
 * réversible — une simple question suffit. Supprimer ne l'est pas : le MOT DE
 * PASSE reste exigé, comme avant. Ce n'est pas une formalité, c'est ce qui
 * protège un compte d'un téléphone laissé déverrouillé.
 */

import { useState } from 'react';
import { deleteAccount, logout } from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { ConfirmDialog } from '@/components/ui/dialog.js';
import { SignOut, Trash2 } from './icons.js';

export function AccountActions({
  onSignedOut,
}: {
  /** Appelé après une déconnexion COMME après une suppression : dans les deux
   * cas il n'y a plus de session, et l'écran de connexion doit reprendre. */
  readonly onSignedOut: () => void;
}): React.JSX.Element {
  const [asking, setAsking] = useState<'signOut' | 'delete' | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (): void => {
    setAsking(null);
    setPassword('');
    setError(null);
  };

  const signOut = async (): Promise<void> => {
    setBusy(true);
    await logout();
    setBusy(false);
    close();
    onSignedOut();
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const outcome = await deleteAccount(password);
    setBusy(false);
    if (outcome === 'done') {
      close();
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
    <>
      <div className="mt-2 flex justify-end gap-2">
        <Button
          variant="ghost"
          aria-label="Se déconnecter"
          title="Se déconnecter"
          onClick={() => setAsking('signOut')}
        >
          <SignOut aria-hidden="true" className="size-5" />
        </Button>
        <Button
          variant="ghost"
          aria-label="Supprimer mon compte"
          title="Supprimer mon compte"
          className="text-bad"
          onClick={() => setAsking('delete')}
        >
          <Trash2 aria-hidden="true" className="size-5" />
        </Button>
      </div>

      <ConfirmDialog
        open={asking === 'signOut'}
        title="Se déconnecter ?"
        description="La session se ferme sur cet appareil. Vos données restent : vous les retrouverez à la prochaine connexion."
        confirmLabel={busy ? 'Déconnexion…' : 'Se déconnecter'}
        confirmDisabled={busy}
        onConfirm={() => void signOut()}
        onCancel={close}
      />

      <ConfirmDialog
        open={asking === 'delete'}
        variant="destructive"
        title="Supprimer votre compte ?"
        description={
          <>
            <p>
              Effacement immédiat et définitif de votre identifiant, de votre adresse, de votre
              profil locataire, de vos pièces déposées, de vos favoris, de votre suivi et de vos
              recherches enregistrées. Il n’y a ni corbeille ni délai.
            </p>
            <p className="mt-2">
              Les annonces, elles, ne vous appartiennent pas : ce sont des offres publiées par des
              agences, et elles restent visibles pour les autres comptes.
            </p>
          </>
        }
        confirmLabel={busy ? 'Suppression…' : 'Supprimer définitivement'}
        confirmDisabled={busy || password === ''}
        onConfirm={() => void remove()}
        onCancel={close}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[0.85rem] font-medium">
            Saisissez votre mot de passe pour confirmer
          </span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            className="w-full text-base"
          />
        </label>
        {error !== null && (
          <p role="alert" className="text-[0.85rem] text-bad">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
