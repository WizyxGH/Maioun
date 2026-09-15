/**
 * L'écran qu'on rencontre en voulant AGIR sans compte.
 *
 * Consulter est libre : personne ne s'inscrit pour savoir ce qu'il y a à
 * louer. Mais un favori, une candidature, un dossier appartiennent à quelqu'un.
 *
 * Le gabarit est celui qu'on connaît ailleurs : un titre qui nomme le geste
 * tenté, une ligne de bénéfice, « Se connecter » en principal, la création de
 * compte en second, et une sortie discrète.
 */

import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { UserCircle } from './icons.js';

export function AccountRequired({
  action,
  onLogin,
  onSignup,
  onBack,
}: {
  /**
   * Ce qu'on essayait de faire, sans majuscule — « garder une annonce en
   * favori ». Absent quand on arrive simplement sur un écran personnel.
   */
  readonly action?: string;
  readonly onLogin: () => void;
  readonly onSignup: () => void;
  readonly onBack?: () => void;
}): React.JSX.Element {
  return (
    <Card
      role="region"
      aria-labelledby="account-required-title"
      className="mx-auto mt-6 w-full max-w-[400px] p-6 text-center"
      data-testid="account-required"
    >
      <UserCircle aria-hidden="true" className="mx-auto mb-3 size-10 text-primary" />
      <h2 id="account-required-title" className="mb-2 text-xl font-semibold text-balance">
        {action === undefined ? 'Connectez-vous pour continuer' : `Connectez-vous pour ${action}`}
      </h2>
      <p className="mb-5 text-[0.92rem] text-muted-foreground">
        Retrouvez vos favoris, votre dossier et vos alertes sur tous vos appareils.
      </p>
      <div className="flex flex-col gap-2">
        <Button className="w-full" onClick={onLogin}>
          Se connecter
        </Button>
        <Button variant="outline" className="w-full" onClick={onSignup}>
          Créer un compte
        </Button>
      </div>
      {onBack !== undefined && (
        <Button
          variant="link"
          size="inline"
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          Continuer sans compte
        </Button>
      )}
    </Card>
  );
}
