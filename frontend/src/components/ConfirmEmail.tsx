/**
 * Confirmation d'une adresse e-mail (§26).
 *
 * ON ARRIVE ICI PAR UN LIEN REÇU DANS SA BOÎTE, souvent depuis un autre
 * appareil que celui de l'inscription — le téléphone alors qu'on s'est inscrit
 * sur l'ordinateur. L'écran ne demande donc AUCUNE connexion : le jeton du lien
 * dit à lui seul quelle adresse est confirmée, et exiger un mot de passe à ce
 * moment-là bloquerait la moitié des gens sur le mauvais écran.
 *
 * IL AGIT DÈS L'OUVERTURE, sans bouton à presser. Le clic sur le lien EST le
 * geste ; en redemander un second n'ajoute aucune sécurité et laisse croire
 * qu'il reste quelque chose à comprendre.
 *
 * UN ÉCHEC N'EST PAS UNE IMPASSE. Jeton expiré, déjà servi ou inventé : le
 * serveur ne les distingue pas, et l'écran non plus. Ce qu'il fait, c'est dire
 * ce qui reste possible — se connecter, et redemander un lien.
 */

import { useEffect, useState } from 'react';
import { ArrowRight, Check, TriangleAlert } from './icons.js';
import { confirmEmailAddress } from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';

export function ConfirmEmail({
  token,
  onDone,
}: {
  readonly token: string;
  /** Vers l'application : connecté, on entre ; sinon, l'écran de connexion. */
  readonly onDone: () => void;
}): React.JSX.Element {
  const [state, setState] = useState<'busy' | 'done' | 'invalid' | 'error'>('busy');

  useEffect(() => {
    let cancelled = false;
    void confirmEmailAddress(token).then((outcome) => {
      if (!cancelled) setState(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Confirmation de votre adresse</h1>
      <Card>
        <div className="flex flex-col gap-3">
          {state === 'busy' && <p className="text-sm">Vérification en cours…</p>}

          {state === 'done' && (
            <p className="flex items-start gap-2 text-sm">
              <Check aria-hidden="true" className="text-good mt-0.5 size-5 shrink-0" />
              <span>
                Votre adresse est confirmée. Vous pourrez désormais réinitialiser votre mot de passe
                si vous l’oubliez.
              </span>
            </p>
          )}

          {state === 'invalid' && (
            <p className="flex items-start gap-2 text-sm">
              <TriangleAlert aria-hidden="true" className="text-bad mt-0.5 size-5 shrink-0" />
              <span>
                Ce lien n’est plus valable : il a expiré, ou il a déjà servi. Si votre adresse est
                déjà confirmée, il n’y a rien à faire.
              </span>
            </p>
          )}

          {state === 'error' && (
            <p className="flex items-start gap-2 text-sm">
              <TriangleAlert aria-hidden="true" className="text-bad mt-0.5 size-5 shrink-0" />
              <span>La vérification n’a pas abouti. Réessayez dans un instant.</span>
            </p>
          )}

          {state !== 'busy' && (
            <Button onClick={onDone}>
              Continuer <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </Card>
    </main>
  );
}
