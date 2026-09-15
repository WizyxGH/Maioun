/**
 * « Envoyer via le formulaire de l’agence » : le message préparé, posté par le
 * Worker dans le formulaire du site de l'agence.
 *
 * Rien ne part sans deux gestes : le bouton ouvre une confirmation qui montre
 * exactement ce qui sera transmis — destinataire, chaque champ, le message,
 * l'état de chaque case à cocher lu sur la page —, et seul « Envoyer » poste.
 * Les boutons « Copier » et « Ouvrir le formulaire » restent en place : c'est
 * le recours si l'envoi échoue.
 */

import { useState } from 'react';
import type { TenantProfile } from '@maioun/shared';
import type { ListingView } from '../types.js';
import {
  agencyFormAvailable,
  submitAgencyForm,
  type AgencyFormConsent,
  type AgencyFormResult,
} from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { ConfirmDialog } from '@/components/ui/dialog.js';
import { cn } from '@/lib/utils.js';

interface Preview {
  readonly sourceName: string;
  readonly host: string;
  readonly consents: readonly AgencyFormConsent[];
}

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'confirming'; readonly preview: Preview }
  | { readonly kind: 'sending'; readonly preview: Preview }
  | { readonly kind: 'done'; readonly result: AgencyFormResult };

/** Ce qu'on dit après coup, et sur quel ton. */
function resultNote(result: AgencyFormResult): { text: string; tone: string } {
  switch (result.status) {
    case 'sent':
      return { text: `Message envoyé. ${result.message}`, tone: 'text-good' };
    case 'uncertain':
      return {
        text: `${result.message} Vérifiez vos e-mails avant de renvoyer.`,
        tone: 'text-medium',
      };
    case 'rejected':
      return {
        text: `Échec : ${[result.message, ...result.errors].join(' ')} Utilisez le formulaire du site.`,
        tone: 'text-bad',
      };
    case 'preview':
      return { text: '', tone: '' };
    default:
      return {
        text: `${result.message} Utilisez le formulaire du site.`,
        tone: 'text-bad',
      };
  }
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </>
  );
}

export function AgencyFormSend({
  listing,
  profile,
  message,
  onSent,
}: {
  readonly listing: ListingView;
  readonly profile: TenantProfile;
  readonly message: string;
  /** Appelé une fois l'envoi accepté : consigne le contact. */
  readonly onSent: () => void;
}): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const occurrence = listing.occurrences.find((o) => agencyFormAvailable(o.sourceId));
  if (occurrence === undefined) return null;

  const fields = {
    firstName: profile.firstName.trim(),
    lastName: profile.lastName.trim(),
    email: profile.email.trim(),
    phone: profile.phone.trim(),
    message: message.trim(),
  };
  const base = { listingId: listing.id, sourceUrl: occurrence.sourceUrl, fields };

  const open = async (): Promise<void> => {
    setPhase({ kind: 'reading' });
    const result = await submitAgencyForm({ ...base, confirm: false, acceptedConsents: [] });
    setPhase(
      result.status === 'preview'
        ? { kind: 'confirming', preview: result.preview }
        : { kind: 'done', result },
    );
  };

  const send = async (preview: Preview): Promise<void> => {
    setPhase({ kind: 'sending', preview });
    const result = await submitAgencyForm({
      ...base,
      confirm: true,
      // Seules les cases obligatoires montrées dans la confirmation.
      acceptedConsents: preview.consents.filter((c) => c.required).map((c) => c.name),
    });
    setPhase({ kind: 'done', result });
    if (result.status === 'sent') onSent();
  };

  const preview = phase.kind === 'confirming' || phase.kind === 'sending' ? phase.preview : null;
  const note = phase.kind === 'done' ? resultNote(phase.result) : null;
  const recipient = listing.contact.agencyName ?? preview?.sourceName ?? '';

  return (
    <div className="mt-2.5">
      <Button
        variant="outline"
        onClick={() => void open()}
        disabled={phase.kind === 'reading' || phase.kind === 'sending'}
      >
        {phase.kind === 'reading'
          ? 'Lecture du formulaire…'
          : 'Envoyer via le formulaire de l’agence'}
      </Button>

      {note !== null && note.text !== '' && (
        <p className={cn('mt-2 text-sm', note.tone)} role="status" data-testid="agency-form-result">
          {note.text}
        </p>
      )}

      <ConfirmDialog
        open={preview !== null}
        title="Envoyer via le formulaire de l’agence"
        confirmLabel={phase.kind === 'sending' ? 'Envoi…' : 'Envoyer'}
        confirmDisabled={phase.kind === 'sending'}
        onCancel={() => {
          if (phase.kind !== 'sending') setPhase({ kind: 'idle' });
        }}
        onConfirm={() => {
          if (preview !== null) void send(preview);
        }}
        description={
          <span>
            Ce message sera envoyé maintenant, en votre nom, par le formulaire de {recipient} (
            {preview?.host}).
          </span>
        }
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[0.88rem]">
          <Row label="Destinataire" value={`${recipient} — ${preview?.host ?? ''}`} />
          <Row label="Prénom" value={fields.firstName} />
          <Row label="Nom" value={fields.lastName} />
          <Row label="E-mail" value={fields.email} />
          <Row label="Téléphone" value={fields.phone === '' ? 'non renseigné' : fields.phone} />
        </dl>
        <div>
          <p className="text-[0.85rem] text-muted-foreground">Message</p>
          <p
            className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border px-2 py-1 text-[0.88rem]"
            data-testid="agency-form-message"
          >
            {fields.message}
          </p>
        </div>
        <div className="text-[0.85rem]" data-testid="agency-form-consents">
          <p className="text-muted-foreground">Cases à cocher du formulaire</p>
          {preview === null || preview.consents.length === 0 ? (
            <p>Aucune case sur ce formulaire.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {preview.consents.map((consent) => (
                <li key={consent.name}>
                  <strong>{consent.ticked ? 'Cochée' : 'Non cochée'}</strong>
                  {consent.required ? ' (obligatoire)' : ' (facultative)'} — {consent.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
