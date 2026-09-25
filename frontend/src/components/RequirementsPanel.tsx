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
  formatMultiplier,
  guaranteeLabel,
  hasRequirements,
  situationLabel,
  type TenancyRequirements,
  type TenantProfile,
} from '@maioun/shared';
import { Card } from '@/components/ui/card.js';
import { ShieldCheck, TriangleAlert } from './icons.js';
import { Alert, AlertDescription } from './ui/alert.js';

/**
 * Le revenu exigé, dans les termes de l'annonce.
 *
 * Un multiple du loyer se convertit en euros — mais on le dit, et l'on dit
 * « environ » : l'annonce ne précise presque jamais si le loyer compté est
 * celui des charges comprises. Sans loyer connu, le multiple reste nu.
 */
function incomeLine(requirements: TenancyRequirements, rent: number | null): string | null {
  if (requirements.minIncome !== null) {
    return `${Math.round(requirements.minIncome)} € net / mois`;
  }
  const multiple = requirements.incomeMultiplier;
  if (multiple === null) return null;
  const facteur = `${formatMultiplier(multiple)} × le loyer`;
  return rent !== null && rent > 0
    ? `${facteur}, soit environ ${Math.round(multiple * rent)} € net / mois`
    : facteur;
}

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

  const rent = listing.price.value;
  const { verdict, reason } = checkEligibility(requirements, profile, rent);
  const bloque = verdict === 'income' || verdict === 'situation' || verdict === 'guarantee';
  const revenu = incomeLine(requirements, rent);

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
        {revenu !== null && (
          <>
            <dt className="text-muted-foreground">Revenu minimum</dt>
            <dd>{revenu}</dd>
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
        {requirements.refusedGuarantees.length > 0 && (
          <>
            <dt className="text-muted-foreground">Garanties refusées</dt>
            <dd>{requirements.refusedGuarantees.map(guaranteeLabel).join(', ')}</dd>
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

      {/* UN GARANT NE REMPLACE PAS LE DOSSIER sous assurance : l'assureur
        compare son seuil aux revenus du locataire, et demande au garant de
        couvrir le sien à part. C'est ce que personne ne sait avant le refus. */}
      {requirements.insuredRent === true && (
        <p className="text-muted-foreground mt-3 text-[0.9rem]">
          Sous assurance loyers impayés, un garant ne remplace pas vos revenus : l’assureur compare
          son seuil aux vôtres, puis demande au garant les siens.
        </p>
      )}

      {verdict === 'unknown' && profile === null && (
        <p className="text-muted-foreground mt-3 text-[0.9rem]">
          Renseignez votre profil locataire pour savoir si votre dossier passe.
        </p>
      )}
    </Card>
  );
}
