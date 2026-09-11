/**
 * Les conditions d'accès de l'annonce, et ce que votre dossier en dit.
 *
 * CE QUI FAIT ÉCHOUER UNE CANDIDATURE N'EST PRESQUE JAMAIS LE LOGEMENT. C'est
 * un revenu minimum qu'on découvre après coup, un CDI qu'on n'a pas, une
 * garantie que le bailleur n'accepte pas. L'information est écrite dans
 * l'annonce — perdue au milieu de neuf cents caractères de prose — et personne
 * ne la lit avant d'avoir appelé, attendu, envoyé son dossier et reçu un refus.
 *
 * C'EST UN AVERTISSEMENT, PAS UN VERDICT. Le bailleur peut faire une exception,
 * l'annonce peut être mal rédigée, et une candidature qu'on n'envoie pas est
 * perdue à coup sûr. On dit donc ce qui coince, on ne cache rien, et l'on
 * laisse décider.
 */

import type { ListingView } from '../types.js';
import {
  checkEligibility,
  guaranteeLabel,
  hasRequirements,
  situationLabel,
  type TenantProfile,
} from '@maioun/shared';
import { Card } from '@/components/ui/card.js';
import { ShieldCheck, TriangleAlert } from './icons.js';
import { Alert, AlertDescription } from './ui/alert.js';

export function RequirementsPanel({
  listing,
  profile,
}: {
  readonly listing: ListingView;
  readonly profile: TenantProfile | null;
}): React.JSX.Element | null {
  const requirements = listing.requirements;
  // Rien d'énoncé : on n'affiche pas un encart pour dire qu'il n'y a rien à
  // dire. C'est le cas de la grande majorité des annonces.
  if (requirements === undefined || !hasRequirements(requirements)) return null;

  const { verdict, reason } = checkEligibility(requirements, profile);
  const bloque = verdict === 'income' || verdict === 'situation';

  return (
    <Card className="my-4" aria-labelledby="conditions-title" role="region">
      <h3 id="conditions-title" className="mb-2.5 flex items-center gap-2 text-base font-semibold">
        {bloque ? (
          <TriangleAlert aria-hidden="true" className="text-medium size-4.5" />
        ) : (
          <ShieldCheck aria-hidden="true" className="text-muted-foreground size-4.5" />
        )}
        Conditions du bailleur
      </h3>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[0.92rem]">
        {requirements.minIncome !== null && (
          <>
            <dt className="text-muted-foreground">Revenu minimum</dt>
            <dd>{Math.round(requirements.minIncome)} € net / mois</dd>
          </>
        )}
        {requirements.insuredRent === true && (
          <>
            <dt className="text-muted-foreground">Assurance</dt>
            {/* CE N'EST PAS UN DÉTAIL ADMINISTRATIF : quand elle est là, c'est
              l'assureur qui fixe les critères, et il n'accorde pas
              d'exception. */}
            <dd>Loyers impayés — critères fixés par l’assureur</dd>
          </>
        )}
        {requirements.situations.length > 0 && (
          <>
            <dt className="text-muted-foreground">Situations acceptées</dt>
            <dd>{requirements.situations.map(situationLabel).join(', ')}</dd>
          </>
        )}
        {requirements.guarantees.length > 0 && (
          <>
            <dt className="text-muted-foreground">Garanties</dt>
            <dd>{requirements.guarantees.map(guaranteeLabel).join(', ')}</dd>
          </>
        )}
      </dl>

      {verdict === 'eligible' && (
        <p className="text-good mt-3 text-[0.9rem]">
          Votre profil remplit les conditions annoncées.
        </p>
      )}

      {bloque && reason !== null && (
        <Alert variant="warning" className="mt-3">
          <AlertDescription>
            Votre profil ne remplit pas cette condition : {reason}. Cela n’empêche pas de candidater
            — le bailleur peut faire une exception, et une candidature qu’on n’envoie pas est perdue
            à coup sûr.
          </AlertDescription>
        </Alert>
      )}

      {verdict === 'unknown' && profile === null && (
        <p className="text-muted-foreground mt-3 text-[0.9rem]">
          Renseignez votre profil locataire pour savoir si votre dossier passe.
        </p>
      )}

      <p className="text-muted-foreground mt-3 text-[0.82rem]">
        Lu dans le texte de l’annonce, sans interprétation. En cas de doute, la source fait foi.
      </p>
    </Card>
  );
}
