/**
 * Les alertes des portails, par transfert d'e-mail (§6, §26) — écran Paramètres.
 *
 * POURQUOI CET ÉCRAN EXISTE. Leboncoin, SeLoger et Bien'ici interdisent qu'on
 * visite leurs pages (§10). Leur seule voie conforme est celle qu'ils offrent
 * eux-mêmes : l'alerte par e-mail. Encore faut-il que ces e-mails nous
 * parviennent.
 *
 * ILS N'ARRIVAIENT QU'À UN SEUL COMPTE, et pour une raison de fond : le
 * collecteur lisait UNE boîte, celle dont le mot de passe d'application est
 * dans son environnement. Ouvrir cela à chaque compte aurait voulu dire ranger
 * en base le mot de passe de la boîte personnelle de chacun (§26 l'interdit).
 *
 * Le transfert renverse la charge : chaque compte reçoit une adresse qui n'est
 * qu'à lui, et pose lui-même une règle dans SA boîte. Il ne nous confie aucun
 * identifiant, et retire la règle quand il veut. C'est aussi la seule voie qui
 * marche partout — laposte.net, Orange et Free n'offrent aucun OAuth.
 *
 * L'ÉCRAN NE PROMET RIEN QU'IL NE PUISSE TENIR. Sans adresse configurée, il le
 * dit au lieu d'en inventer une : une règle de transfert vers le vide
 * n'échouerait jamais bruyamment, et l'utilisateur attendrait pour rien (§17).
 *
 * IL DIT AUSSI CE QUI EST ARRIVÉ. Une règle mal filtrée ne produit aucune
 * erreur, seulement du silence — le même silence qu'une journée sans nouvelle
 * annonce. Le compte pouvait attendre des semaines sans savoir lequel des deux
 * il vivait. « Dernière alerte reçue » tranche.
 */

import { useEffect, useState } from 'react';
import { ALERT_SENDER_LABELS } from '@rentfinder/shared';
import { fetchAlertAddress, rotateAlertAddress, type AlertForwarding } from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { ConfirmDialog } from '@/components/ui/dialog.js';
import { Check, Copy, Mail } from './icons.js';

/** Les trois gestes à faire, dans l'ordre où on les fait. */
function Steps(): React.JSX.Element {
  return (
    <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 text-[0.9rem]">
      <li>
        <strong>Créez vos alertes sur les portails</strong> ({ALERT_SENDER_LABELS.join(', ')}) avec
        vos critères. Ce sont eux qui vous enverront les nouvelles annonces.
      </li>
      <li>
        <strong>Dans votre boîte mail, ajoutez une règle de transfert</strong> vers l’adresse
        ci-dessus, pour les messages venant de ces portails. Tous les fournisseurs le proposent —
        cherchez « filtres » ou « règles » dans les réglages.
      </li>
      <li>
        <strong>C’est tout.</strong> Les annonces apparaîtront ici au passage suivant du collecteur.
        Nous ne vous demandons jamais le mot de passe de votre boîte, et nous ne lisons que ce que
        vous nous faites suivre.
      </li>
    </ol>
  );
}

/**
 * Ce que le transfert a apporté, ou l'aveu qu'il n'a rien apporté.
 *
 * Le compte a posé une règle dans sa boîte et n'avait aucun retour. Le nombre
 * compte autant que la date : « 12 annonces » dit que la règle attrape la
 * bonne chose, là où une date seule pourrait n'être qu'un message isolé.
 */
function Reception({ state }: { state: AlertForwarding }): React.JSX.Element {
  if (state.lastReceivedAt === null) {
    return (
      <p className="text-muted-foreground mt-2 text-[0.82rem]">
        Aucune alerte reçue à ce jour sur cette adresse. Si vous venez de poser la règle, elle
        apparaîtra ici dès le premier message transféré.
      </p>
    );
  }
  const when = new Date(state.lastReceivedAt);
  return (
    <p className="mt-2 text-[0.82rem]">
      <Check aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" />
      Dernière alerte reçue le {when.toLocaleDateString('fr-FR')} — {state.receivedCount} annonce
      {state.receivedCount > 1 ? 's' : ''} apportée{state.receivedCount > 1 ? 's' : ''} en tout.
    </p>
  );
}

export function ForwardingPanel(): React.JSX.Element {
  const [state, setState] = useState<AlertForwarding | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const address = state?.address ?? null;

  useEffect(() => {
    void fetchAlertAddress()
      .then(setState)
      .catch(() => setState(null));
  }, []);

  const rotate = (): void => {
    setRotating(true);
    void rotateAlertAddress()
      .then(setState)
      .catch(() => {
        /* L'ancienne adresse reste affichée : elle est encore la bonne. */
      })
      .finally(() => {
        setRotating(false);
        setConfirming(false);
      });
  };

  const copy = (): void => {
    if (address === null) return;
    void navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* Presse-papiers refusé : l'adresse reste sélectionnable à la main. */
      });
  };

  return (
    <section aria-labelledby="forwarding-title">
      <h1 id="forwarding-title" className="text-xl font-bold">
        Alertes des portails
      </h1>
      <p className="text-muted-foreground mt-1 text-[0.88rem]">
        Leboncoin, SeLoger et Bien’ici interdisent qu’on visite leurs pages. Leur alerte par e-mail
        est la seule voie qu’ils autorisent — faites-la suivre ici.
      </p>

      {state === undefined && (
        <p className="text-muted-foreground mt-4 text-[0.9rem]">Chargement…</p>
      )}

      {state !== undefined && address === null && (
        <p className="border-border mt-4 rounded-xl border p-3 text-[0.9rem]">
          Cette fonctionnalité n’est pas encore configurée sur cette installation. Aucune adresse ne
          vous est attribuée pour l’instant : mieux vaut ne rien vous donner qu’une adresse vers
          laquelle vos alertes se perdraient en silence.
        </p>
      )}

      {state !== undefined && state !== null && address !== null && (
        <>
          <div className="border-border bg-card mt-4 flex items-center gap-2 rounded-xl border p-3">
            <Mail aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
            {/* `select-all` : l'adresse se recopie d'un geste même quand le
              presse-papiers est refusé par le navigateur. */}
            <code className="min-w-0 flex-1 select-all font-mono text-[0.85rem] break-all">
              {address}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
              {copied ? 'Copiée' : 'Copier'}
            </Button>
          </div>
          <Reception state={state} />

          <p className="text-muted-foreground mt-2 text-[0.82rem]">
            Cette adresse n’est qu’à vous. Ne la publiez pas : n’importe qui pourrait alors y
            déverser ce qu’il veut — et si cela arrive, changez-en ci-dessous.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setConfirming(true)}
          >
            Changer d’adresse
          </Button>

          <Steps />

          <ConfirmDialog
            open={confirming}
            title="Changer d’adresse de transfert ?"
            description={
              <>
                L’adresse actuelle cessera <strong>immédiatement</strong> de fonctionner. Les
                alertes qui y arriveront ensuite seront perdues : pensez à mettre à jour la règle de
                transfert dans votre boîte mail avec la nouvelle adresse.
              </>
            }
            confirmLabel="Changer d’adresse"
            confirmDisabled={rotating}
            onConfirm={rotate}
            onCancel={() => setConfirming(false)}
          />
        </>
      )}
    </section>
  );
}
