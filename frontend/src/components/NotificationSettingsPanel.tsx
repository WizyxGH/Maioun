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
 * L'E-MAIL EST DÉSORMAIS BRANCHÉ. Il est resté longtemps montré éteint et
 * inerte, parce qu'afficher un réglage qui ne produit rien promet des messages
 * qui n'arriveront jamais (§17). La collecte l'envoie maintenant pour de bon —
 * un récapitulatif par passage, en plus du push.
 *
 * IL EXIGE UNE ADRESSE VÉRIFIÉE, et l'intitulé le dit : sans elle la collecte
 * se tait, et une case cochée qui ne délivre rien est exactement ce que le
 * paragraphe précédent cherchait à éviter.
 */

import { NEAR_MATCH_MARGIN } from '@maioun/shared';
import type { NotificationFrequency } from '@maioun/shared';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Clock, Heart, Mail, TriangleAlert } from './icons.js';
import type { IconComponent } from './icons.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationKind,
  type NotificationPreferences,
} from '@maioun/shared';
import { fetchNotificationPreferences, saveNotificationPreferences } from '../api/client.js';
import { disablePush, enablePush, pushEnabled, pushSupported, restorePush } from '../push.js';
import { readOptIn, requestNotificationPermission, writeOptIn } from '../notifications.js';
import { Button } from '@/components/ui/button.js';
import { Switch } from '@/components/ui/switch.js';
import { SettingsGroup, SettingsRow } from './SettingsRow.js';
import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Radio } from '@/components/ui/checkbox.js';

interface KindInfo {
  readonly key: NotificationKind;
  readonly label: string;
  readonly hint: string;
  readonly Icon: IconComponent;
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
/**
 * L'intitulé se suffit : « Dès que possible », « Une fois par heure », « Une
 * fois par jour » disent déjà tout. La phrase qui les accompagnait ne faisait
 * que les paraphraser, et trois paragraphes sous trois boutons radio donnaient
 * à un choix évident l'air d'une décision à peser.
 */
const FREQUENCIES: readonly {
  readonly value: NotificationFrequency;
  readonly label: string;
}[] = [
  { value: 'each-run', label: 'Dès que possible' },
  { value: 'hourly', label: 'Une fois par heure' },
  { value: 'daily', label: 'Une fois par jour' },
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
    // CE QUE LE CANAL FAIT ET CE QU'IL EXIGE, en une ligne. « Vérifiée » n'est
    // pas un détail administratif : sans elle, rien ne part, et l'utilisateur
    // qui a coché la case attendrait des messages qui ne viendront jamais.
    hint: 'Un récapitulatif dans votre boîte, en plus du téléphone. Demande une adresse vérifiée.',
    Icon: Mail,
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
    /**
     * ON REMET L'ABONNEMENT EN PLACE, SANS RIEN DEMANDER, puis on affiche CE QUI
     * EST. Le service de push révoque parfois un abonnement (`410 Gone`), et un
     * changement d'adresse du site le supprime tout à fait. L'écran affichait
     * « activé » d'après une préférence locale, l'utilisateur se croyait
     * abonné, et plus rien n'arrivait — deux appareils perdus ainsi le
     * 2026-09-07, le dernier le 2026-09-10.
     *
     * `restorePush` redépose un abonnement présent, en recrée un perdu si
     * l'autorisation est déjà accordée, et dit le résultat. Sans abonnement à
     * la sortie, l'interrupteur s'éteint : il dit la vérité, et un geste suffit
     * à tout rétablir.
     */
    if (pushSupported()) {
      const optedIn = readOptIn();
      void restorePush(optedIn).then((subscribed) => {
        // AUTORISATION REFUSÉE : l'interrupteur reste allumé, c'est voulu — les
        // alertes s'affichent alors en bandeau dans la page. On ne l'éteint que
        // si le navigateur PERMET le push et qu'aucun abonnement n'existe.
        const bandeauSeul =
          optedIn && typeof Notification !== 'undefined' && Notification.permission !== 'granted';
        setOn(subscribed || bandeauSeul);
      });
    } else {
      void pushEnabled().then((subscribed) => {
        if (subscribed) setOn(true);
      });
    }
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

  /**
   * L'interrupteur principal : le canal de cet appareil ET le sujet.
   *
   * Les deux allaient toujours ensemble — on n'ouvre pas le canal pour ne rien
   * y recevoir — mais il fallait deux gestes, dont l'un ressemblait à l'autre.
   */
  const toggleNewListings = async (value: boolean): Promise<void> => {
    if (!preferences.newListings && value) toggleKind('newListings', true);
    await toggleMaster();
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

      {error !== null && (
        <Alert variant="warning" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* « NOUVELLES ANNONCES » EST L'INTERRUPTEUR PRINCIPAL.

        Il y en avait deux, l'un au-dessus de l'autre : « Alertes sur cet
        appareil » ouvrait le canal, « Nouvelles annonces » choisissait le
        sujet. Deux interrupteurs pour un seul geste — personne n'active le
        canal sans vouloir les nouvelles annonces —, et le premier passait pour
        un doublon du second, qu'il commandait pourtant.

        Il n'en reste qu'un. L'allumer abonne CET appareil et retient le sujet ;
        l'éteindre coupe les deux. Les autres réglages attendent qu'il le soit :
        ils ne veulent rien dire sans canal, et les montrer actifs promettrait
        des alertes qui ne partiraient pas (§17). */}
      <SettingsGroup title="Ce dont vous voulez être prévenu, sur tous vos appareils">
        {KINDS.map(({ key, label, hint, Icon }) => {
          const master = key === 'newListings';
          return (
            <SettingsRow
              key={key}
              Icon={Icon}
              tone={(master ? on : preferences[key] && on) ? 'done' : 'muted'}
              label={label}
              hint={master && !on ? 'Active les alertes sur cet appareil.' : hint}
              trailing={
                <Switch
                  checked={master ? on : preferences[key] && on}
                  disabled={master ? busy : !on}
                  onCheckedChange={(value) => {
                    if (master) void toggleNewListings(value);
                    else toggleKind(key, value);
                  }}
                  aria-label={label}
                />
              }
            />
          );
        })}
      </SettingsGroup>

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
                className="flex min-h-11 cursor-pointer items-center gap-3 py-2 first:pt-0 last:pb-0"
              >
                <Radio
                  name="notification-frequency"
                  checked={preferences.frequency === option.value}
                  onChange={() => setFrequency(option.value)}
                />
                <span className="min-w-0 flex-1 font-medium">{option.label}</span>
              </label>
            ))}
          </fieldset>
        </SettingsGroup>
      )}
    </div>
  );
}
