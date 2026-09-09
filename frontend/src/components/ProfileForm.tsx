/**
 * Formulaire du profil locataire (§25).
 *
 * Le texte d'avertissement n'est pas décoratif : l'utilisateur doit savoir
 * précisément où vont ces données. Elles ne quittent jamais l'appareil (§26).
 */

import { useState } from 'react';
import type { Guarantor, GuarantorKind, TenantProfile } from '@maioun/shared';
import { MAX_GUARANTORS, MOVE_IN_ASAP, TENANT_SITUATIONS } from '@maioun/shared';
import { EMPTY_PROFILE, GUARANTOR_OPTIONS } from '../profile.js';
import { Plus, Trash2 } from './icons.js';
import { Button } from '@/components/ui/button.js';
import { Select } from '@/components/ui/select.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { PhoneField } from './PhoneField.js';

interface ProfileFormProps {
  readonly initial: TenantProfile | null;
  readonly onSave: (profile: TenantProfile) => void;
  readonly onCancel: () => void;
  /**
   * Absent pendant le PREMIER PARCOURS : « Effacer de cet appareil » n'a pas
   * de sens devant un profil qu'on est en train de créer, et proposer d'effacer
   * ce qui n'existe pas encore n'inspire rien de bon.
   */
  readonly onClear?: () => void;
}

const FIELD = 'flex flex-col gap-1 text-[0.88rem] text-muted-foreground';

/** Le jour même, au format du champ `date`. Sert de plancher au calendrier. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `true` si la valeur est une date déjà écoulée. */
export function isPastMoveIn(value: string | null): boolean {
  if (value === null || value === '' || value === MOVE_IN_ASAP) return false;
  return value < today();
}

/**
 * L'entrée souhaitée : une intention d'abord, une date seulement si besoin.
 *
 * TROIS RÉPONSES, ET DEUX N'ONT PAS DE DATE. « Non précisé » ne dit rien —
 * le message n'écrit alors aucune disponibilité. « Dès que possible » est le
 * cas le plus fréquent, et il reste vrai indéfiniment. La date n'apparaît que
 * pour qui en a une, et le calendrier refuse alors le passé.
 */
function MoveInField({
  value,
  onChange,
}: {
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
}): React.JSX.Element {
  const mode = value === null || value === '' ? 'none' : value === MOVE_IN_ASAP ? 'asap' : 'date';
  return (
    <label className={FIELD}>
      Entrée souhaitée
      <Select
        value={mode}
        onChange={(event) => {
          const next = event.target.value;
          if (next === 'none') onChange(null);
          else if (next === 'asap') onChange(MOVE_IN_ASAP);
          // On propose le jour même : une date à remplacer vaut mieux qu'un
          // champ vide qui n'enregistre rien.
          else onChange(today());
        }}
      >
        <option value="none">à préciser</option>
        <option value="asap">dès que possible</option>
        <option value="date">à partir d’une date</option>
      </Select>
      {mode === 'date' && (
        <Input
          type="date"
          className="mt-1"
          // `min` empêche d'en choisir une nouvelle dans le passé. Il ne corrige
          // pas celles déjà enregistrées — l'avertissement s'en charge.
          min={today()}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        />
      )}
    </label>
  );
}

export function ProfileForm({
  initial,
  onSave,
  onCancel,
  onClear,
}: ProfileFormProps): React.JSX.Element {
  const [profile, setProfile] = useState<TenantProfile>(initial ?? EMPTY_PROFILE);

  const update = <K extends keyof TenantProfile>(key: K, value: TenantProfile[K]): void => {
    setProfile((previous) => ({ ...previous, [key]: value }));
  };

  /** `false` quand la situation est un texte libre : le champ « Autre » s'ouvre. */
  const knownSituation = TENANT_SITUATIONS.some(
    (one) => one.value === profile.situation && one.value !== 'other',
  );

  const setGuarantors = (guarantors: readonly Guarantor[]): void =>
    setProfile((previous) => ({ ...previous, guarantors }));

  const setGuarantor = (index: number, guarantor: Guarantor): void => {
    // Un nom vide est RETIRÉ plutôt que stocké : le profil ne garde pas de
    // chaîne vide qui se retrouverait ensuite dans un message (§17).
    const name = guarantor.name?.trim() ?? '';
    const cleaned: Guarantor = { kind: guarantor.kind, ...(name === '' ? {} : { name }) };
    setGuarantors(profile.guarantors.map((one, i) => (i === index ? cleaned : one)));
  };

  const removeGuarantor = (index: number): void =>
    setGuarantors(profile.guarantors.filter((_one, i) => i !== index));

  const addGuarantor = (): void => setGuarantors([...profile.guarantors, { kind: 'physical' }]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(profile);
      }}
    >
      <h2 className="mb-2 text-lg font-bold">Profil locataire</h2>

      <p className="border-l-3 border-primary pl-2.5 text-[0.85rem] text-muted-foreground">
        Ces informations servent uniquement à composer vos messages de contact. Elles sont
        enregistrées <strong>dans ce navigateur uniquement</strong> : elles ne sont envoyées ni à
        l’API, ni à la base de données, ni à GitHub.
      </p>

      <div className="my-4 grid gap-2.5 sm:grid-cols-2">
        <label className={FIELD}>
          Prénom
          <Input
            type="text"
            value={profile.firstName}
            onChange={(event) => update('firstName', event.target.value)}
            required
          />
        </label>

        <label className={FIELD}>
          Nom
          <Input
            type="text"
            value={profile.lastName}
            onChange={(event) => update('lastName', event.target.value)}
            required
          />
        </label>

        <label className={FIELD}>
          E-mail
          <Input
            type="email"
            value={profile.email}
            onChange={(event) => update('email', event.target.value)}
          />
        </label>

        {/* L'INDICATIF DU PAYS MANQUAIT. Le champ était un `type="tel"` nu : on
            y tapait « 06 00 00 00 12 », ce qui convient tant qu'on écrit à une
            agence niçoise depuis la France — et ne dit plus rien dès qu'on
            candidate depuis l'étranger, ce qui est le cas de beaucoup de gens
            qui cherchent à Nice. Le numéro partait tel quel dans le message. */}
        <label className={FIELD}>
          Téléphone
          <PhoneField value={profile.phone} onChange={(next) => update('phone', next)} />
        </label>

        {/* UN MENU, ET NON UN CHAMP LIBRE. Le message dit « Je suis {situation} » :
            le texte libre produisait « Je suis en fonctionnaire », et
            « fonctionnaire » était justement l'exemple donné à l'utilisateur.
            Chaque entrée de la liste porte sa propre tournure. La liste reprend
            les situations que bailleurs et organismes de caution distinguent. */}
        <label className={FIELD}>
          Situation professionnelle
          <Select
            value={knownSituation ? profile.situation : 'other'}
            onChange={(event) =>
              update('situation', event.target.value === 'other' ? '' : event.target.value)
            }
          >
            {TENANT_SITUATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        {!knownSituation && (
          <label className={FIELD}>
            Précisez votre situation
            <Input
              type="text"
              placeholder="Intermittent, pensionné…"
              value={profile.situation}
              onChange={(event) => update('situation', event.target.value)}
            />
          </label>
        )}

        {/* NET OU BRUT, ET LE CHAMP NE LE DEMANDAIT PAS. Un bailleur compte en
          net — la règle des trois fois le loyer s'y applique — et l'écart entre
          les deux dépasse vingt pour cent : un brut pris pour un net fait
          écarter le dossier au premier calcul. */}
        <label className={FIELD}>
          Revenus mensuels (€)
          <span className="flex gap-2">
            <Input
              type="number"
              min="0"
              className="min-w-0 flex-1"
              value={profile.monthlyIncome ?? ''}
              onChange={(event) =>
                update(
                  'monthlyIncome',
                  event.target.value === '' ? null : Number.parseInt(event.target.value, 10),
                )
              }
            />
            <Select
              aria-label="Revenus nets ou bruts"
              className="w-28 shrink-0"
              value={profile.incomeKind ?? ''}
              onChange={(event) => {
                const chosen = event.target.value;
                update('incomeKind', chosen === 'net' || chosen === 'gross' ? chosen : undefined);
              }}
            >
              {/* L'option vide reste tant qu'on n'a pas choisi : le message
                n'écrit alors aucune mention plutôt qu'une fausse (§17). */}
              <option value="">à préciser</option>
              <option value="net">net</option>
              <option value="gross">brut</option>
            </Select>
          </span>
        </label>

        {/* UNE DATE VIEILLIT, PAS UNE INTENTION. Le champ n'acceptait qu'une
            date : posée en mars, elle annonçait en juin une disponibilité
            passée — un dossier qui a l'air abandonné. « Dès que possible » est
            le cas le plus fréquent, et il reste vrai indéfiniment. */}
        <MoveInField value={profile.moveInDate} onChange={(v) => update('moveInDate', v)} />

        {/* Une date déjà écoulée : on le dit, plutôt que de la laisser partir
            dans un message. Le bouton fait le geste dont il est question. */}
        {isPastMoveIn(profile.moveInDate) && (
          <p className="text-warning sm:col-span-2 -mt-2 text-[0.82rem]">
            Cette date est passée : vos messages annonceront une disponibilité immédiate.{' '}
            <button
              type="button"
              className="cursor-pointer underline"
              onClick={() => update('moveInDate', MOVE_IN_ASAP)}
            >
              Passer à « dès que possible »
            </button>
          </p>
        )}

        {/* PLUSIEURS GARANTIES, et non plus une seule. Deux parents se portent
            souvent caution ensemble, et l'on cumule volontiers un garant
            physique avec une garantie Visale — c'est même ce qui fait la force
            d'un dossier. Un champ unique obligeait à taire la moitié de ce
            qu'on a. */}
        <fieldset className="sm:col-span-2">
          <legend className="text-muted-foreground mb-1 text-[0.88rem]">Garanties de loyer</legend>

          {profile.guarantors.length === 0 && (
            <p className="text-muted-foreground mb-2 text-[0.82rem]">
              Aucune pour l’instant. Le dossier reposera sur vos seuls revenus.
            </p>
          )}

          <ul className="mb-2 flex flex-col gap-2">
            {profile.guarantors.map((guarantor, index) => {
              const option = GUARANTOR_OPTIONS.find((one) => one.kind === guarantor.kind);
              return (
                <li key={index} className="border-border rounded-xl border p-2.5">
                  <div className="flex items-start gap-2">
                    <Select
                      aria-label={`Garantie ${index + 1}`}
                      value={guarantor.kind}
                      onChange={(event) =>
                        setGuarantor(index, { kind: event.target.value as GuarantorKind })
                      }
                      className="min-w-0 flex-1"
                    >
                      {GUARANTOR_OPTIONS.map((one) => (
                        <option key={one.kind} value={one.kind}>
                          {one.label}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Retirer la garantie ${index + 1}`}
                      onClick={() => removeGuarantor(index)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </div>

                  {option?.namePlaceholder !== undefined && (
                    <Input
                      type="text"
                      aria-label={`Nom de la garantie ${index + 1}`}
                      placeholder={option.namePlaceholder}
                      value={guarantor.name ?? ''}
                      onChange={(event) =>
                        setGuarantor(index, { kind: guarantor.kind, name: event.target.value })
                      }
                      className="mt-2 w-full"
                    />
                  )}

                  <p className="text-muted-foreground mt-1.5 text-[0.8rem]">{option?.hint}</p>
                </li>
              );
            })}
          </ul>

          {profile.guarantors.length < MAX_GUARANTORS && (
            <Button type="button" variant="outline" size="sm" onClick={addGuarantor}>
              <Plus aria-hidden="true" className="size-4" /> Ajouter une garantie
            </Button>
          )}
        </fieldset>
      </div>

      {/* §24 : message de candidature UNIQUE, envoyé tel quel pour toutes les
          annonces. C'est TOUJOURS vous qui l'envoyez (bouton « Ouvrir »). */}
      <label className={`${FIELD} my-4`}>
        Message de candidature (identique pour toutes les annonces)
        <Textarea
          rows={8}
          value={profile.applicationMessage ?? ''}
          onChange={(event) => update('applicationMessage', event.target.value)}
          placeholder={`Bonjour,\n\nVotre annonce m'intéresse. Je suis en CDI, revenus 3× le loyer, garant possible. Serait-il possible de convenir d'une visite ?\n\nCordialement,\n${profile.firstName} ${profile.lastName}\n${profile.phone}`.trim()}
          className="font-sans text-[0.9rem]"
        />
        <span className="text-[0.8rem]">
          Laissé vide, un message personnalisé par annonce est généré à la place. L’objet de
          l’e-mail reprend la référence du bien pour que l’agence l’identifie.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        {onClear !== undefined && (
          <Button type="button" variant="outline" onClick={onClear}>
            Effacer de cet appareil
          </Button>
        )}
        <Button type="submit">Enregistrer</Button>
      </div>
    </form>
  );
}
