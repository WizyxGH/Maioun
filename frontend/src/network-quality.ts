/**
 * « La connexion est-elle assez maigre pour qu'on économise les images ? »
 *
 * S'appuie sur la Network Information API : absente de Safari et de Firefox,
 * elle répond alors « non » — on garde le comportement normal plutôt que de
 * dégrader tout le monde faute d'information.
 */

import { useEffect, useState } from 'react';

/** Le sous-ensemble de `navigator.connection` qui nous sert. */
export interface ConnectionLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

/** Débits que le navigateur classe comme lents. */
const SLOW_TYPES: ReadonlySet<string> = new Set(['slow-2g', '2g', '3g']);

export function currentConnection(): ConnectionLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { connection?: ConnectionLike }).connection ?? null;
}

/** Vrai si l'utilisateur a demandé l'économie de données ou si le débit est lent. */
export function isConstrained(connection: ConnectionLike | null): boolean {
  if (connection === null) return false;
  if (connection.saveData === true) return true;
  return connection.effectiveType !== undefined && SLOW_TYPES.has(connection.effectiveType);
}

/** Suit la qualité du réseau : passer du wifi à la 3G en marchant se voit. */
export function useConstrainedNetwork(): boolean {
  const [constrained, setConstrained] = useState(() => isConstrained(currentConnection()));

  useEffect(() => {
    const connection = currentConnection();
    if (connection === null) return;
    const update = (): void => setConstrained(isConstrained(connection));
    update();
    connection.addEventListener?.('change', update);
    return () => connection.removeEventListener?.('change', update);
  }, []);

  return constrained;
}
