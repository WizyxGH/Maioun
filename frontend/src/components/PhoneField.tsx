/**
 * Saisie d'un numéro de téléphone, indicatif du pays compris.
 *
 * DEUX CONTRÔLES POUR UNE VALEUR. Le menu porte le pays, le champ le numéro
 * national ; ce qui est enregistré est la forme E.164 recomposée à chaque
 * frappe — `+33600000012`. L'appelant ne voit qu'une chaîne, comme avant.
 *
 * LE MENU MONTRE L'INDICATIF, PAS SEULEMENT LE DRAPEAU. Un drapeau seul se
 * reconnaît mal en petit, et se confond entre voisins ; « +33 » ne se confond
 * avec rien, et c'est ce que l'utilisateur cherche des yeux pour vérifier.
 *
 * LE ZÉRO INITIAL EST RETIRÉ, quand le pays le veut : « 06 00 00 00 12 » saisi
 * sous France devient `+33600000012`. C'est le geste que tout le monde fait de
 * travers, et le seul que ce composant doit garantir.
 */

import { COUNTRIES, DEFAULT_COUNTRY, formatPhone, parsePhone } from '../phone.js';
import { Select } from '@/components/ui/select.js';
import { Input } from '@/components/ui/input.js';

export function PhoneField({
  value,
  onChange,
  id,
}: {
  /** Numéro enregistré, en E.164. */
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly id?: string;
}): React.JSX.Element {
  const parsed = parsePhone(value);

  return (
    <div className="flex gap-2">
      <Select
        aria-label="Indicatif du pays"
        className="w-[7.5rem] shrink-0"
        value={parsed.country}
        onChange={(event) =>
          onChange(formatPhone({ country: event.target.value, national: parsed.national }))
        }
      >
        {COUNTRIES.map((country) => (
          <option key={country.code} value={country.code}>
            {country.flag} +{country.dial}
          </option>
        ))}
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className="min-w-0 flex-1"
        placeholder={parsed.country === DEFAULT_COUNTRY ? '06 00 00 00 12' : ''}
        value={parsed.national}
        onChange={(event) =>
          onChange(formatPhone({ country: parsed.country, national: event.target.value }))
        }
      />
    </div>
  );
}
