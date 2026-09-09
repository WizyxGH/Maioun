/**
 * L'écran qu'on rencontre en voulant AGIR sans compte.
 *
 * CONSULTER EST LIBRE — c'est le principe : personne ne s'inscrit pour savoir
 * ce qu'il y a à louer. Mais un favori, une candidature, un dossier
 * appartiennent à quelqu'un, et il faut donc savoir à qui.
 *
 * ON DIT CE QUE LE COMPTE APPORTE, pas qu'il est obligatoire. « Connexion
 * requise » est un mur ; la même phrase tournée vers ce qu'on y gagne est une
 * proposition. Et on nomme le geste qui a mené ici, sinon l'écran paraît
 * surgir de nulle part.
 */

import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';

export function AccountRequired({
  action,
  onLogin,
  onSignup,
  onBack,
}: {
  /**
   * Ce qu'on essayait de faire, à la première personne et sans majuscule —
   * « garder cette annonce en favori ». Absent quand on arrive simplement sur
   * un écran personnel.
   */
  readonly action?: string;
  readonly onLogin: () => void;
  readonly onSignup: () => void;
  readonly onBack?: () => void;
}): React.JSX.Element {
  return (
    <Card className="mx-auto mt-6 max-w-[480px] p-5" data-testid="account-required">
      <h2 className="mb-2 text-lg font-semibold">
        {action === undefined ? 'Cet écran est le vôtre' : 'Un compte est nécessaire'}
      </h2>
      <p className="text-muted-foreground mb-4 text-[0.92rem]">
        {action === undefined
          ? 'Vos favoris, votre dossier et vos alertes vous suivent d’un appareil à l’autre. Il faut un compte pour qu’ils soient les vôtres.'
          : `Pour ${action}, il faut un compte — c’est ce qui permet de le retrouver ensuite, ici ou ailleurs.`}
      </p>
      <p className="text-muted-foreground mb-5 text-[0.82rem]">
        Consulter les annonces reste libre : vous pouvez fermer cette page et continuer à chercher.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onSignup}>Créer un compte</Button>
        <Button variant="outline" onClick={onLogin}>
          J’ai déjà un compte
        </Button>
        {onBack !== undefined && (
          <Button variant="ghost" onClick={onBack}>
            Continuer sans compte
          </Button>
        )}
      </div>
    </Card>
  );
}
