/**
 * La pastille de la cloche, la même sur tous les appareils d'un compte.
 *
 * La dernière visite de la page Notifications ne vivait que dans le navigateur :
 * lire ses alertes sur l'ordinateur laissait la pastille pleine sur le téléphone.
 * Elle est désormais rangée dans le compte. La copie locale reste, pour un
 * affichage immédiat et hors ligne ; la plus récente des deux l'emporte.
 *
 * On relit le compte à l'ouverture et à chaque RETOUR sur l'application (onglet
 * repris, téléphone déverrouillé) : c'est là qu'un autre appareil a pu lire.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAlertsSeenAt, saveAlertsSeenAt } from './api/client.js';
import { markAlertsSeen, readAlertsSeenAt } from './notifications.js';

export function useAlertsSeen(options: {
  /** Faux tant qu'on ne sait pas qui est connecté : rien à lire côté compte. */
  readonly enabled: boolean;
  /** Au retour sur l'application : de quoi recharger ce qu'un autre appareil a changé. */
  readonly onReturn?: () => void;
}): { readonly seenAt: number; readonly markSeen: (atMs: number) => void } {
  const [seenAt, setSeenAt] = useState(() => readAlertsSeenAt(Date.now()));
  const onReturn = useRef(options.onReturn);
  onReturn.current = options.onReturn;

  const adopt = useCallback((atMs: number): void => {
    setSeenAt((current) => {
      if (atMs <= current) return current;
      markAlertsSeen(atMs);
      return atMs;
    });
  }, []);

  const markSeen = useCallback((atMs: number): void => {
    markAlertsSeen(atMs);
    setSeenAt(atMs);
    void saveAlertsSeenAt(atMs).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!options.enabled) return undefined;
    const sync = (): void => {
      void fetchAlertsSeenAt()
        .then((remote) => {
          if (remote !== null) adopt(remote);
        })
        .catch(() => undefined);
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      sync();
      onReturn.current?.();
    };
    sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [options.enabled, adopt]);

  return { seenAt, markSeen };
}
