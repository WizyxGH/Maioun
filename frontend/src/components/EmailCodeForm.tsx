/**
 * Confirmer son adresse avec le code reçu, sans quitter le site.
 *
 * Suivre le lien depuis sa messagerie ouvre souvent un autre navigateur, où
 * l'on n'est pas connecté. Le code se recopie ici, dans l'onglet ouvert.
 *
 * LE MOINS DE GESTES POSSIBLE : clavier numérique, code proposé par le téléphone
 * quand il le lit dans le message (`one-time-code`), collage accepté tel quel,
 * et envoi dès le sixième chiffre — pas de bouton à aller chercher.
 */

import { useState } from 'react';
import { confirmAccountEmailCode } from '../api/client.js';
import { Input } from '@/components/ui/input.js';

const LENGTH = 6;

export function EmailCodeForm({
  onVerified,
}: {
  readonly onVerified: () => void;
}): React.JSX.Element {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (digits: string): Promise<void> => {
    setBusy(true);
    setError(null);
    const outcome = await confirmAccountEmailCode(digits);
    setBusy(false);
    if (outcome.ok) {
      onVerified();
      return;
    }
    setError(outcome.error);
    setCode('');
  };

  const change = (value: string): void => {
    // « 123 456 », « 123-456 » ou le code collé avec son texte : on garde les chiffres.
    const digits = value.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    if (digits.length === LENGTH && !busy) void submit(digits);
  };

  return (
    <div className="mt-2">
      <label htmlFor="email-code" className="text-[0.85rem] font-medium">
        Code reçu par e-mail
      </label>
      <Input
        id="email-code"
        value={code}
        onChange={(event) => change(event.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={LENGTH + 2}
        placeholder="123456"
        disabled={busy}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? 'email-code-error' : undefined}
        className="mt-1 w-40 text-center font-mono text-lg tracking-[0.3em]"
      />
      {error !== null && (
        <p id="email-code-error" role="alert" className="text-bad mt-1 text-[0.8rem]">
          {error}
        </p>
      )}
    </div>
  );
}
