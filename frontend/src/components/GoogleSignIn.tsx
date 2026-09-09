/**
 * « Continuer avec Google » (§26).
 *
 * POURQUOI CE CHEMIN EXISTE. Consulter est libre : le moment où l'on demande
 * un compte n'est plus l'arrivée sur le site mais le premier geste — un
 * favori. À cet instant précis, réclamer un mot de passe à choisir puis une
 * confirmation par courriel à attendre fait renoncer. Google rend une adresse
 * DÉJÀ vérifiée : un seul geste, rien à recevoir.
 *
 * AUCUNE REDIRECTION. Google Identity Services dépose son bibliothèque dans la
 * page et rend un jeton d'identité sur place ; on le POSTe à l'API, qui en
 * vérifie la signature. Le détour classique — partir chez Google, revenir avec
 * un code — ferait traverser deux fois de plus une frontière de domaine, alors
 * que le site et l'API sont déjà sur deux domaines distincts et que le cookie
 * de session y survit tout juste.
 *
 * LE BOUTON N'EXISTE PAS S'IL NE PEUT PAS MARCHER. Sans identifiant
 * d'application, sans réseau pour charger la bibliothèque, en mode
 * démonstration : on n'affiche rien plutôt qu'un bouton qui échouerait au clic
 * (§17). Le mot de passe reste le chemin toujours disponible.
 */

import { useEffect, useRef, useState } from 'react';
import { loginWithGoogle } from '../api/client.js';

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';

const CLIENT_ID: string = (import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) ?? '';

/** Ce que la bibliothèque de Google expose une fois chargée. */
interface GoogleAccounts {
  readonly accounts: {
    readonly id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

/** Charge la bibliothèque une seule fois, quel que soit le nombre d'écrans. */
let loading: Promise<GoogleAccounts | null> | null = null;

async function loadGoogle(): Promise<GoogleAccounts | null> {
  if (CLIENT_ID === '') return null;
  const existing = (globalThis as { google?: GoogleAccounts }).google;
  if (existing?.accounts?.id !== undefined) return existing;

  loading ??= new Promise<GoogleAccounts | null>((resolve) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve((globalThis as { google?: GoogleAccounts }).google ?? null);
    // Réseau coupé, bibliothèque bloquée par une extension : on rend `null` et
    // l'écran n'affiche pas de bouton. Une promesse qui ne se résout jamais
    // laisserait un emplacement vide sans que rien ne l'explique.
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
  return await loading;
}

export function GoogleSignIn({
  onSignedIn,
  onError,
}: {
  readonly onSignedIn: () => void;
  /** Dit ce qui a échoué. Le silence ferait passer un refus pour un clic perdu. */
  readonly onError: (message: string) => void;
}): React.JSX.Element | null {
  const slot = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(CLIENT_ID !== '');

  // Les rappels changent à chaque rendu ; la bibliothèque, elle, ne s'installe
  // qu'une fois. On les lit à travers une référence pour que le bouton ne soit
  // pas reconstruit à chaque frappe de l'écran qui l'entoure.
  const handlers = useRef({ onSignedIn, onError });
  handlers.current = { onSignedIn, onError };

  useEffect(() => {
    if (CLIENT_ID === '') return;
    let cancelled = false;

    void loadGoogle().then((google) => {
      if (cancelled) return;
      const parent = slot.current;
      if (google === null || parent === null) {
        setAvailable(false);
        return;
      }

      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => {
          const credential = response.credential ?? '';
          if (credential === '') {
            handlers.current.onError('La connexion Google a été interrompue.');
            return;
          }
          void loginWithGoogle(credential).then((problem) => {
            if (problem === null) handlers.current.onSignedIn();
            else handlers.current.onError(problem);
          });
        },
      });
      google.accounts.id.renderButton(parent, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        locale: 'fr',
        width: 280,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;
  return <div ref={slot} data-testid="google-signin" className="flex justify-center" />;
}
