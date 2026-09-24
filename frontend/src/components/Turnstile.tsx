/**
 * LE CAPTCHA, devant la création de compte et la connexion.
 *
 * Turnstile plutôt que reCAPTCHA : l'API vit déjà chez Cloudflare, le service
 * est gratuit, et il n'envoie rien à Google. La plupart des visiteurs ne voient
 * qu'une case qui se coche seule — la vérification est passive tant que rien
 * n'est suspect.
 *
 * SANS CLÉ PUBLIQUE, RIEN NE S'AFFICHE, et c'est ce qui permet au mode
 * démonstration, aux tests de bout en bout et à une installation qui n'en veut
 * pas de fonctionner sans changement. Le Worker, lui, ne vérifie que s'il a sa
 * clé secrète : les deux moitiés se posent ensemble ou pas du tout.
 *
 * LE JETON NE VAUT RIEN CÔTÉ NAVIGATEUR. Il n'est qu'un laissez-passer à
 * transmettre ; c'est le serveur qui demande à Cloudflare s'il est vrai. Un
 * script qui en fabriquerait un n'irait pas plus loin.
 */

import { useEffect, useRef } from 'react';

/**
 * La clé publique du site, absente tant que l'installation n'en a pas.
 *
 * Cloudflare l'appelle « site key ». Elle porte ici PUBLIC dans son nom parce
 * que c'est ainsi qu'on déclare, dans ce dépôt, qu'une variable `VITE_` a
 * vocation à être publiée : le scanner de secrets refuse les autres, et il a
 * raison — tout `VITE_` finit dans le bundle de GitHub Pages.
 */
const SITE_KEY: string = (import.meta.env['VITE_TURNSTILE_PUBLIC_KEY'] as string | undefined) ?? '';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Charge le script UNE FOIS, même si deux écrans le demandent.
 *
 * La promesse est mémorisée : sans cela, passer de la connexion à
 * l'inscription ajouterait une seconde balise, et Turnstile s'en plaint.
 */
let chargement: Promise<void> | null = null;
function chargerLeScript(): Promise<void> {
  if (window.turnstile !== undefined) return Promise.resolve();
  chargement ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Une prochaine tentative pourra réessayer : sans cela, un réseau
      // momentanément coupé condamnerait le captcha pour toute la session.
      chargement = null;
      reject(new Error('Turnstile injoignable'));
    };
    document.head.appendChild(script);
  });
  return chargement;
}

export function Turnstile({
  onToken,
}: {
  /** Appelé avec le jeton, ou `null` quand il expire ou échoue. */
  readonly onToken: (token: string | null) => void;
}): React.JSX.Element | null {
  const hote = useRef<HTMLDivElement>(null);
  // Une référence, et non l'état : changer le rappel ne doit pas redessiner le
  // widget — il repartirait de zéro à chaque frappe dans le formulaire.
  const rappel = useRef(onToken);
  rappel.current = onToken;

  useEffect(() => {
    if (SITE_KEY === '') return;
    let widgetId: string | null = null;
    let vivant = true;

    void chargerLeScript()
      .then(() => {
        if (!vivant || hote.current === null || window.turnstile === undefined) return;
        widgetId = window.turnstile.render(hote.current, {
          sitekey: SITE_KEY,
          theme: 'auto',
          callback: (token) => rappel.current(token),
          'expired-callback': () => rappel.current(null),
          'error-callback': () => rappel.current(null),
        });
      })
      .catch(() => {
        // Script injoignable : on le dit au formulaire, qui enverra sans jeton.
        // Le serveur tranche — et il laisse passer quand Cloudflare est en
        // panne, parce qu'un captcha protège d'un abus, il ne garde pas un
        // coffre.
        rappel.current(null);
      });

    return () => {
      vivant = false;
      if (widgetId !== null) window.turnstile?.remove(widgetId);
    };
  }, []);

  if (SITE_KEY === '') return null;
  return <div ref={hote} className="mt-3" />;
}
