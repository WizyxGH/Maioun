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
 *
 * L'ADRESSE E-MAIL LES REJOINT, et elle manquait cruellement : elle ne se
 * posait qu'à l'inscription. Un compte dont l'adresse était fautive, abandonnée
 * ou simplement mal tapée y restait pour toujours — plus de « mot de passe
 * oublié », qui écrit à cette adresse-là, plus d'alertes par e-mail, et aucun
 * écran pour le corriger. L'état de confirmation est montré : une adresse
 * seulement saisie ne récupère aucun compte, et le taire ferait croire à une
 * sécurité qui n'existe pas (§17).
 */

import { useEffect, useState } from 'react';
import {
  changeAccountEmail,
  deleteAccount,
  fetchAccountEmail,
  logout,
  type AccountEmail,
} from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { ConfirmDialog } from '@/components/ui/dialog.js';
import { SignOut, Trash2 } from './icons.js';
import { Input } from '@/components/ui/input.js';

export function AccountActions({
  onSignedOut,
}: {
  /** Appelé après une déconnexion COMME après une suppression : dans les deux
   * cas il n'y a plus de session, et l'écran de connexion doit reprendre. */
  readonly onSignedOut: () => void;
}): React.JSX.Element {
  const [asking, setAsking] = useState<'signOut' | 'delete' | 'email' | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<AccountEmail | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [sent, setSent] = useState<'yes' | 'no' | null>(null);

  useEffect(() => {
    void fetchAccountEmail()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  const close = (): void => {
    setAsking(null);
    setPassword('');
    setError(null);
    setNewEmail('');
  };

  const saveEmail = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const outcome = await changeAccountEmail(newEmail, password);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      setPassword('');
      return;
    }
    // La nouvelle adresse est écrite, mais NON prouvée : c'est le lien qui la
    // prouve, et l'écran doit le dire plutôt que d'afficher un compte en règle.
    setAccount({ email: outcome.email, verified: false });
    setSent(outcome.confirmationSent ? 'yes' : 'no');
    close();
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
      {account !== null && (
        <div className="border-border mt-2 rounded-xl border p-3">
          <p className="text-[0.85rem] font-medium">Adresse e-mail du compte</p>
          <p className="text-muted-foreground mt-0.5 text-[0.85rem] break-all">
            {account.email ?? 'Aucune adresse enregistrée.'}
          </p>
          {account.email !== null && !account.verified && (
            <p className="text-bad mt-1 text-[0.8rem]">
              Non confirmée : tant qu’elle ne l’est pas, « mot de passe oublié » ne peut pas vous
              écrire.
            </p>
          )}
          {sent !== null && (
            <p role="status" className="mt-1 text-[0.8rem]">
              {sent === 'yes'
                ? 'Un lien de confirmation vient de partir vers cette adresse.'
                : 'Adresse enregistrée, mais l’envoi d’e-mails n’est pas configuré : aucun lien de confirmation ne partira.'}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              setSent(null);
              setNewEmail(account.email ?? '');
              setAsking('email');
            }}
          >
            Changer d’adresse
          </Button>
        </div>
      )}

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
        open={asking === 'email'}
        title="Changer l’adresse du compte ?"
        description="C’est à cette adresse que part le lien de réinitialisation. Elle devra être confirmée avant de pouvoir servir à récupérer votre compte."
        confirmLabel={busy ? 'Enregistrement…' : 'Enregistrer'}
        confirmDisabled={busy || newEmail.trim() === '' || password === ''}
        onConfirm={() => void saveEmail()}
        onCancel={close}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[0.85rem] font-medium">Nouvelle adresse</span>
          <Input
            type="email"
            value={newEmail}
            autoComplete="email"
            onChange={(event) => setNewEmail(event.target.value)}
            className="w-full text-base"
          />
        </label>
        <label className="mt-2 flex flex-col gap-1">
          {/* LE MOT DE PASSE N'EST PAS UNE FORMALITÉ : déplacer l'adresse,
              c'est déplacer où part le lien de réinitialisation. Sans lui, une
              session laissée ouverte suffirait à prendre le compte. */}
          <span className="text-[0.85rem] font-medium">Votre mot de passe</span>
          <Input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            className="w-full text-base"
          />
        </label>
        {error !== null && (
          <p role="alert" className="text-bad mt-2 text-[0.85rem]">
            {error}
          </p>
        )}
      </ConfirmDialog>

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
          <Input
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
