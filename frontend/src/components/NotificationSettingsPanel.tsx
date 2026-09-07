/**
 * Réglage des alertes (§29) — écran Paramètres → Notifications.
 *
 * IL N'Y AVAIT QU'UN INTERRUPTEUR, posé au milieu des paramètres : tout ou
 * rien, pour la seule famille d'alertes qui existait. Or une recherche de
 * logement a plusieurs moments qui méritent qu'on lève les yeux, et ils n'ont
 * pas la même valeur selon les jours.
 *
 * L'ORDRE DE L'ÉCRAN EST CELUI DE LA DÉCISION. D'abord un seul geste — être
 * prévenu, ou non —, qui allume tout : c'est ce que veut quelqu'un qui arrive
 * ici. Le détail vient ensuite, pour éteindre ce qui gêne ; il n'apparaît que
 * si les alertes sont allumées, faute de quoi on réglerait finement quelque
 * chose de muet.
 *
 * L'E-MAIL EST MONTRÉ ÉTEINT ET INERTE. Il n'est pas branché : l'afficher
 * réglable promettrait des messages qui n'arriveraient jamais (§17). Le montrer
 * annoncé vaut mieux que le laisser deviner absent.
 */

import { NEAR_MATCH_MARGIN } from '@rentfinder/shared';
import type { NotificationFrequency } from '@rentfinder/shared';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Clock, Heart, Mail, TriangleAlert } from './icons.js';
import type { IconComponent } from './icons.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationKind,
  type NotificationPreferences,
} from '@rentfinder/shared';
import { fetchNotificationPreferences, saveNotificationPreferences } from '../api/client.js';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../push.js';
import { readOptIn, requestNotificationPermission, writeOptIn } from '../notifications.js';
import { Button } from '@/components/ui/button.js';
import { Switch } from '@/components/ui/switch.js';
import { SettingsGroup, SettingsRow } from './SettingsRow.js';

interface KindInfo {
  readonly key: NotificationKind;
  readonly label: string;
  readonly hint: string;
  readonly Icon: IconComponent;
  /** `true` quand le canal n'est pas encore en service : montré, non réglable. */
  readonly comingSoon?: boolean;
}

/**
 * Les rythmes proposés.
 *
 * « EN TEMPS RÉEL » AURAIT ÉTÉ UN MENSONGE. La collecte tourne deux fois par
 * heure : une annonce parue à 10 h 10 est signalée à 10 h 37. C'est bien le
 * réglage le plus rapide possible, et il reste celui par défaut — sur ce
 * marché, une heure d'avance décide d'une visite —, mais l'intitulé dit ce
 * qu'il fait plutôt que ce qui sonnerait bien (§17).
 *
 * CHAQUE LIGNE DIT CE QU'ON Y GAGNE ET CE QU'ON Y PERD, parce que c'est un
 * arbitrage et non une préférence : plus vite prévenu, plus souvent dérangé.
 */
const FREQUENCIES: readonly {
  readonly value: NotificationFrequency;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    value: 'each-run',
    label: 'Dès que possible',
    hint: 'À chaque collecte, soit environ toutes les 30 minutes. Le plus rapide.',
  },
  {
    value: 'hourly',
    label: 'Une fois par heure',
    hint: 'Les annonces de l’heure écoulée arrivent groupées.',
  },
  {
    value: 'daily',
    label: 'Une fois par jour',
    hint: 'Une seule salve par 24 heures. Rien n’est perdu, tout est regroupé.',
  },
];

const KINDS: readonly KindInfo[] = [
  {
    key: 'newListings',
    label: 'Nouvelles annonces',
    hint: 'Dès qu’un logement entre dans vos critères.',
    Icon: Bell,
  },
  {
    key: 'nearMatches',
    label: 'Proche de vos critères',
    // Le chiffre vient de NEAR_MATCH_MARGIN, seule définition de la marge : le
    // réécrire ici en toutes lettres aurait fini par mentir.
    hint: `${Math.round(NEAR_MATCH_MARGIN * 100)} % de budget en plus, ou autant de surface en moins. La notification dit lequel.`,
    Icon: TriangleAlert,
  },
  {
    key: 'applicationReminders',
    label: 'Rappel de candidature',
    hint: 'Un favori mis de côté et jamais contacté : le marché ne patiente pas.',
    Icon: Clock,
  },
  {
    key: 'favoriteGone',
    label: 'Favori qui disparaît',
    hint: 'L’annonce a quitté sa source — elle est probablement louée.',
    Icon: Heart,
  },
  {
    key: 'email',
    label: 'Doubler par e-mail',
    hint: 'Bientôt : les mêmes alertes dans votre boîte, en plus du téléphone.',
    Icon: Mail,
    comingSoon: true,
  },
];

export function NotificationSettingsPanel({
  onBack,
}: {
  readonly onBack: () => void;
}): React.JSX.Element {
  const [on, setOn] = useState(readOptIn());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );

  // L'abonnement push fait foi au chargement : il survit à un vidage du
  // stockage local, là où la préférence de bandeau, non.
  useEffect(() => {
    void pushEnabled().then((subscribed) => {
      if (subscribed) setOn(true);
    });
    void fetchNotificationPreferences().then(setPreferences);
  }, []);

  const toggleMaster = async (): Promise<void> => {
    setError(null);
    if (on) {
      writeOptIn(false);
      setOn(false);
      setBusy(true);
      await disablePush();
      setBusy(false);
      return;
    }

    writeOptIn(true);
    setOn(true);
    setBusy(true);
    const granted = await requestNotificationPermission();
    if (granted !== 'granted') {
      // Le réglage TIENT malgré le refus : les alertes s'afficheront en
      // bandeau. Auparavant un refus ne produisait rien du tout, et
      // l'interrupteur semblait ne pas se retenir.
      setError(
        'Le navigateur refuse les notifications : les alertes s’afficheront en ' +
          'bandeau dans la page. Pour les recevoir hors du site, réautorisez-les ' +
          'dans ses réglages.',
      );
      setBusy(false);
      return;
    }
    if (pushSupported()) setError(await enablePush());
    setBusy(false);
  };

  /**
   * Le rythme s'enregistre comme les bascules : tout de suite, sans bouton.
   *
   * Il part vers la BASE et non vers ce navigateur : c'est la collecte qui
   * décide d'envoyer, et elle ne voit que la base.
   */
  const setFrequency = (frequency: NotificationFrequency): void => {
    const next = { ...preferences, frequency };
    setPreferences(next);
    void saveNotificationPreferences(next).catch(() =>
      setError('Le rythme n’a pas pu être enregistré.'),
    );
  };

  const toggleKind = (key: NotificationKind, value: boolean): void => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    // Écriture immédiate, sans bouton : un interrupteur qui demanderait ensuite
    // de valider ne serait plus un interrupteur.
    void saveNotificationPreferences(next).catch(() =>
      setError('Le réglage n’a pas pu être enregistré.'),
    );
  };

  return (
    <div>
      <header className="mb-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Retour
        </Button>
      </header>

      <h1 className="mb-4 text-xl font-bold">Notifications</h1>

      {/* LE GESTE UNIQUE D'ABORD. Sous le capot il y a deux mécanismes — la
        préférence de ce navigateur pour le bandeau, et l'abonnement que le
        navigateur conserve pour le site fermé. Ils s'allumaient séparément, ce
        qui demandait de comprendre la plomberie pour être prévenu.

        IL S'APPELAIT « RECEVOIR DES ALERTES », et on le prenait pour un doublon
        de « Nouvelles annonces », juste en dessous. Les deux ne règlent pourtant
        pas la même chose : celui-ci décide du CANAL sur cet appareil-ci — il
        n'existe que dans ce navigateur —, ceux d'en dessous décident des SUJETS,
        et suivent le compte partout. Deux intitulés qui commençaient pareil
        cachaient cette différence : le titre dit maintenant de quoi il parle. */}
      <div className="border-border flex items-center gap-3 rounded-xl border p-3">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Alertes sur cet appareil</span>
          <span className="text-muted-foreground block text-sm">
            {busy
              ? 'Un instant…'
              : on
                ? 'Bandeau dans la page, et notification même site fermé.'
                : 'Aucune alerte ne vous parviendra sur cet appareil.'}
          </span>
        </span>
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={() => void toggleMaster()}
          aria-label="Alertes sur cet appareil"
        />
      </div>

      {error !== null && (
        <p
          className="border-border mt-3 rounded-xl border px-3 py-2 text-[0.88rem] text-muted-foreground"
          role="alert"
        >
          {error}
        </p>
      )}

      {on && (
        <SettingsGroup title="À quel rythme">
          {/* UN CHOIX EXCLUSIF, donc des boutons radio et non des bascules : on
            ne peut pas être prévenu à deux rythmes à la fois, et trois
            interrupteurs dont deux s'éteignent tout seuls se lisent mal. */}
          <fieldset className="border-border rounded-xl border p-3">
            <legend className="sr-only">Fréquence des notifications</legend>
            {FREQUENCIES.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 py-2 first:pt-0 last:pb-0"
              >
                <input
                  type="radio"
                  name="notification-frequency"
                  className="mt-1 size-4 shrink-0"
                  checked={preferences.frequency === option.value}
                  onChange={() => setFrequency(option.value)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{option.label}</span>
                  <span className="text-muted-foreground block text-[0.82rem]">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </SettingsGroup>
      )}

      {on && (
        <SettingsGroup title="Ce dont vous voulez être prévenu, sur tous vos appareils">
          {KINDS.map(({ key, label, hint, Icon, comingSoon }) => (
            <SettingsRow
              key={key}
              Icon={Icon}
              tone={comingSoon !== true && preferences[key] ? 'done' : 'muted'}
              label={label}
              hint={hint}
              {...(comingSoon === true ? { badge: 'Bientôt' } : {})}
              trailing={
                <Switch
                  checked={comingSoon === true ? false : preferences[key]}
                  disabled={comingSoon === true}
                  onCheckedChange={(value) => toggleKind(key, value)}
                  aria-label={label}
                />
              }
            />
          ))}
        </SettingsGroup>
      )}
    </div>
  );
}
