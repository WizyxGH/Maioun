/**
 * Écran de connexion (§26).
 *
 * Il n'apparaît QUE dans le mode publié, où un Worker garde le jeton de la
 * base et tient les sessions. En local il n'a pas lieu d'être : le serveur
 * n'écoute que sur 127.0.0.1, il n'y a personne d'autre devant la machine.
 *
 * L'INSCRIPTION EST OUVERTE DEPUIS ICI. Elle ne l'était pas : les comptes se
 * créaient en ligne de commande, depuis la machine ayant accès à la base — ce
 * qui se tenait tant qu'il n'y avait qu'un utilisateur, et interdisait à
 * quiconque d'entrer dès lors qu'on vend le service. Ce qui protège réellement
 * n'est pas l'absence de formulaire, mais ce qui l'entoure : quotas par
 * origine, adresses jetables refusées, adresse confirmée par lien.
 *
 * LE MESSAGE D'ERREUR NE DISTINGUE PAS identifiant inconnu et mot de passe
 * faux. C'est délibéré : la différence n'apprendrait rien à qui possède un
 * compte, et dirait à un inconnu lesquels existent.
 */

import { useState } from 'react';
import { LogIn, UserPlus } from './icons.js';
import { login } from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Card } from '@/components/ui/card.js';

export function LoginScreen({
  onSignedIn,
  onForgot,
  onSignup,
}: {
  readonly onSignedIn: () => void;
  /** Ouvre la demande de lien. Absent : le lien ne s'affiche pas. */
  readonly onForgot?: () => void;
  /** Ouvre la création de compte. Absent : le bouton ne s'affiche pas. */
  readonly onSignup?: () => void;
}): React.JSX.Element {
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const failure = await login(identifiant, password);
    setBusy(false);
    if (failure === null) {
      onSignedIn();
      return;
    }
    setError(failure);
    // Le mot de passe est effacé, l'identifiant non : c'est presque toujours le
    // premier qu'on a raté, et retaper les deux agace pour rien.
    setPassword('');
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Maïoun</h1>
      <p className="text-muted-foreground mb-5 text-sm">Connectez-vous pour voir vos annonces.</p>

      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[0.85rem] font-medium">Adresse e-mail ou identifiant</span>
            <Input
              type="text"
              value={identifiant}
              autoComplete="username"
              autoFocus
              onChange={(event) => setIdentifiant(event.target.value)}
              // 16 px sur mobile : en dessous, iOS zoome à la mise au point.
              className="w-full text-base"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[0.85rem] font-medium">Mot de passe</span>
            <Input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              className="w-full text-base"
            />
          </label>

          {error !== null && (
            <p role="alert" className="border-bad/40 bg-bad/10 rounded-lg border px-3 py-2 text-sm">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy || identifiant === '' || password === ''}>
            <LogIn aria-hidden="true" className="size-4" />
            {busy ? 'Connexion…' : 'Se connecter'}
          </Button>

          {/* UN MOT DE PASSE PERDU ÉTAIT UN COMPTE PERDU : ses favoris, son
            suivi, ses pièces déposées. Le lien est discret — on le cherche
            rarement, mais quand on le cherche il faut le trouver du premier
            coup, et sur cet écran-là. */}
          {onForgot !== undefined && (
            <button
              type="button"
              onClick={onForgot}
              className="text-muted-foreground hover:text-foreground cursor-pointer text-center text-[0.82rem] underline"
            >
              Mot de passe oublié ?
            </button>
          )}
        </form>
      </Card>

      {/* L'INSCRIPTION EST UNE PORTE, PAS UN LIEN DISCRET. « Mot de passe
        oublié » se cherche une fois tous les deux ans ; « créer un compte » est
        la première chose que voit quelqu'un qui n'en a pas encore, et le seul
        geste qu'il puisse faire sur cet écran. */}
      {onSignup !== undefined && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-muted-foreground text-[0.85rem]">Pas encore de compte ?</p>
          <Button variant="outline" onClick={onSignup} className="w-full">
            <UserPlus aria-hidden="true" className="size-4" /> Créer un compte
          </Button>
        </div>
      )}

      <p className="text-muted-foreground mt-4 text-[0.82rem]">
        Les annonces sont communes à tous les comptes ; vos favoris, votre suivi et vos recherches
        enregistrées n’appartiennent qu’à vous.
      </p>
    </main>
  );
}
