/**
 * Créer un compte (§26).
 *
 * IL N'Y AVAIT PAS D'INSCRIPTION, et l'écran de connexion l'assumait : « les
 * comptes se créent en ligne de commande, depuis la machine qui a accès à la
 * base ». Tenable pour un utilisateur, absurde dès qu'on vend le service —
 * personne ne peut entrer.
 *
 * TROIS CHAMPS, PAS QUATRE. Pas de confirmation du mot de passe : elle attrape
 * la faute de frappe d'un cas sur cent et fait retaper les quatre-vingt-dix-neuf
 * autres. Le bouton qui montre ce qu'on a saisi rend le même service, tout de
 * suite, et sans rien retaper — et « mot de passe oublié » existe pour le
 * reste.
 *
 * L'ADRESSE EST OBLIGATOIRE, et l'écran dit POURQUOI plutôt que de l'imposer :
 * c'est la seule chose qui permette de récupérer un compte dont on a perdu le
 * mot de passe. Sans elle, un oubli est définitif.
 *
 * LES REFUS VIENNENT DU SERVEUR, mot pour mot. Rejouer ses règles ici les
 * ferait diverger au premier changement — l'écran accepterait ce que l'API
 * refuse, et l'utilisateur ne saurait pas lequel des deux croire.
 */

import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Mail, UserPlus } from './icons.js';
import { signup } from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Card } from '@/components/ui/card.js';

export function SignupScreen({
  onSignedIn,
  onBack,
}: {
  /** Le compte est créé ET la session ouverte : on entre directement. */
  readonly onSignedIn: () => void;
  readonly onBack: () => void;
}): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ confirmationSent: boolean } | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const outcome = await signup({ email, password });
    setBusy(false);
    if (outcome.ok) {
      setCreated({ confirmationSent: outcome.confirmationSent });
      return;
    }
    setError(outcome.error);
  };

  // COMPTE CRÉÉ : on ne renvoie pas vers la connexion, on est déjà connecté.
  // Cet écran ne sert qu'à dire ce qu'il reste à faire — confirmer l'adresse —
  // et il est honnête sur le fait qu'un message soit parti ou non.
  if (created !== null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Compte créé</h1>
        <Card>
          <div className="flex flex-col gap-3">
            {created.confirmationSent ? (
              <p className="flex items-start gap-2 text-sm">
                <Mail aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
                <span>
                  Un message vient de partir vers <strong>{email}</strong>. Suivez le lien qu’il
                  contient pour confirmer votre adresse : sans cela, vous ne pourrez pas
                  réinitialiser votre mot de passe si vous l’oubliez.
                </span>
              </p>
            ) : (
              <p className="border-border rounded-lg border px-3 py-2 text-sm">
                Votre compte est prêt. L’envoi d’e-mails n’est pas configuré sur cette installation
                : votre adresse ne peut pas être confirmée pour l’instant, et « mot de passe oublié
                » restera indisponible tant qu’elle ne l’est pas.
              </p>
            )}
            <Button onClick={onSignedIn}>Commencer</Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Créer un compte</h1>
      <p className="text-muted-foreground mb-5 text-sm">
        Les annonces sont communes à tous les comptes ; vos favoris, votre suivi et vos recherches
        n’appartiennent qu’à vous.
      </p>

      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[0.85rem] font-medium">Adresse e-mail</span>
            <Input
              type="email"
              value={email}
              autoComplete="email"
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              className="w-full text-base"
            />
            <span className="text-muted-foreground text-[0.78rem]">
              C’est elle qui vous connectera, et le seul moyen de récupérer votre compte si vous
              oubliez votre mot de passe.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[0.85rem] font-medium">Mot de passe</span>
            <div className="flex items-center gap-2">
              <Input
                type={visible ? 'text' : 'password'}
                value={password}
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                className="w-full text-base"
              />
              {/* MONTRER PLUTÔT QUE FAIRE RETAPER : c'est ce qui remplace le
                champ de confirmation, et cela rend service tout de suite. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setVisible((current) => !current)}
                aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {visible ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </Button>
            </div>
            <span className="text-muted-foreground text-[0.78rem]">8 caractères au minimum.</span>
          </label>

          {error !== null && (
            <p role="alert" className="border-bad/40 bg-bad/10 rounded-lg border px-3 py-2 text-sm">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy || email.trim() === '' || password === ''}>
            <UserPlus aria-hidden="true" className="size-4" />
            {busy ? 'Création…' : 'Créer mon compte'}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft aria-hidden="true" className="size-4" /> J’ai déjà un compte
          </Button>
        </form>
      </Card>
    </main>
  );
}
