/**
 * CE QUI PASSE AVANT L'APPLICATION.
 *
 * Plusieurs écrans se succèdent avant qu'il y ait quoi que ce soit à naviguer :
 * on ne sait pas encore qui regarde, personne n'est connecté, ou le compte
 * vient d'être créé. Aucun ne porte de coquille ni d'onglets — proposer d'aller
 * ailleurs pendant qu'on demande un mot de passe reviendrait à ne rien demander
 * du tout.
 *
 * Réunis dans un seul composant plutôt qu'en autant de sorties anticipées dans
 * `App` : ils forment une seule question — « peut-on afficher l'application ? »
 * —, et leur ORDRE est le sujet. Deux de ces écrans passent délibérément AVANT
 * la session, parce qu'on y arrive précisément quand on ne peut pas se
 * connecter.
 *
 * `null` veut dire « rien ne barre la route » : l'application s'affiche.
 */

import { lazy, useEffect, useState } from 'react';
import type { TenantProfile } from '@maioun/shared';
import { isUnconfigured } from '../api/client.js';
import { LoginScreen } from '../components/LoginScreen.js';
import type { SavedSearch } from '../saved-searches.js';
import type { Route, View } from '../router.js';
import type { RouteTarget } from '../use-route.js';
import { readPendingSharedToken, writePendingSharedToken } from '../visitor-search.js';

const ForgotPassword = lazy(() =>
  import('../components/ForgotPassword.js').then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import('../components/ResetPassword.js').then((m) => ({ default: m.ResetPassword })),
);
const SignupScreen = lazy(() =>
  import('../components/SignupScreen.js').then((m) => ({ default: m.SignupScreen })),
);
const ConfirmEmail = lazy(() =>
  import('../components/ConfirmEmail.js').then((m) => ({ default: m.ConfirmEmail })),
);
const SharedSearch = lazy(() =>
  import('../components/SharedSearch.js').then((m) => ({ default: m.SharedSearch })),
);
const UnconfiguredScreen = lazy(() =>
  import('../components/UnconfiguredScreen.js').then((m) => ({ default: m.UnconfiguredScreen })),
);
const OnboardingPanel = lazy(() =>
  import('../components/OnboardingPanel.js').then((m) => ({ default: m.OnboardingPanel })),
);

/**
 * LES ÉCRANS QUI PARLENT DE QUELQU'UN, et qu'un visiteur ne peut donc pas voir.
 *
 * Le partage est net : le CATALOGUE décrit le marché — les annonces, les
 * quartiers, les sources, les agences — et s'ouvre à tous. Ceux-ci décrivent
 * une personne : son dossier, ses alertes, ses recherches, ses statistiques.
 * L'API applique la même coupure de son côté, et c'est elle qui fait foi ;
 * cette liste ne fait qu'éviter d'envoyer quelqu'un vers un écran qui
 * répondrait « connexion requise » sans expliquer pourquoi.
 */
export const PERSONAL_VIEWS: ReadonlySet<View> = new Set<View>([
  'stats',
  'profile',
  'tenant',
  'reference',
  'saved',
  'notifications',
  'access',
  'plan',
  'alerts',
  'onboarding',
]);

/**
 * L'attente de la vérification de session.
 *
 * RIEN PENDANT UNE SECONDE, puis un mot. Le cas courant se règle en deux cents
 * millisecondes : y afficher un indicateur le ferait clignoter à chaque
 * ouverture, ce qui est pire que le silence. Passé une seconde, le silence
 * devient une page blanche, et une page blanche ne dit pas si l'on attend, si
 * l'on est déconnecté, ou si tout est cassé.
 */
export function SessionPending(): React.JSX.Element {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 1000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!slow) return <></>;
  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4">
      <p className="text-muted-foreground text-center text-sm">Connexion en cours…</p>
    </main>
  );
}

export interface EntranceScreenProps {
  readonly view: View;
  /** L'identifiant porté par l'adresse : un jeton, ici. */
  readonly routeId: string | undefined;
  /** `undefined` tant qu'on ne sait pas encore qui regarde, `null` si personne. */
  readonly currentUser: string | null | undefined;
  /** Le geste tenté sans compte, dit à la première personne, ou `null`. */
  readonly pendingAction: string | null;
  readonly onboardingDone: boolean | undefined;
  readonly profile: TenantProfile | null;
  readonly go: (target: RouteTarget) => void;
  readonly replace: (target: Route) => void;
  /** Une session vient de s'ouvrir, quel qu'en soit le chemin. */
  readonly onSessionOpened: () => void;
  readonly onClearPendingAction: () => void;
  readonly onApplySharedSearch: (shared: SavedSearch) => void;
  readonly onSaveSharedSearch: (shared: SavedSearch) => void;
  readonly onBrowseSharedSearch: (shared: SavedSearch) => void;
  readonly onSaveProfile: (profile: TenantProfile) => void;
  readonly onFinishOnboarding: () => void;
}

/**
 * UNE FONCTION, ET NON UN COMPOSANT : elle rend `null` quand rien ne barre la
 * route, et c'est CE `null` qui décide. Un `<EntranceScreen />` aurait obligé
 * `App` à redemander ailleurs « et donc, affiche-t-on l'application ? », soit
 * la même règle écrite deux fois — celle des deux qu'on oublierait de corriger
 * déciderait un jour toute seule.
 */
export function ecranDEntree({
  view,
  routeId,
  currentUser,
  pendingAction,
  onboardingDone,
  profile,
  go,
  replace,
  onSessionOpened,
  onClearPendingAction,
  onApplySharedSearch,
  onSaveSharedSearch,
  onBrowseSharedSearch,
  onSaveProfile,
  onFinishOnboarding,
}: EntranceScreenProps): React.JSX.Element | null {
  const token = routeId ?? '';

  // AVANT TOUT LE RESTE : sans adresse d'API, il n'y a rien à charger et rien à
  // connecter. L'application se croyait connectée et affichait une liste vide,
  // ce qui se lit « aucune annonce ne correspond » au lieu de « rien n'est
  // branché ».
  if (isUnconfigured()) return <UnconfiguredScreen />;

  // LE LIEN DE RÉINITIALISATION PASSE AVANT LA SESSION, et il le faut : on
  // arrive dessus précisément parce qu'on ne peut pas se connecter. Attendre la
  // réponse de `/api/me` pour l'afficher renverrait vers l'écran de connexion,
  // c'est-à-dire vers le mur qu'on essaie de contourner.
  if (view === 'reset') {
    return <ResetPassword token={token} onDone={() => replace({ view: 'home' })} />;
  }

  // MÊME RAISON POUR LA CONFIRMATION D'ADRESSE : on suit ce lien depuis sa
  // boîte, souvent sur un autre appareil que celui de l'inscription. Exiger une
  // session ici bloquerait la moitié des gens sur l'écran de connexion, pour un
  // geste qui n'en a pas besoin — le jeton suffit à dire quelle adresse est
  // confirmée.
  if (view === 'confirm') {
    return <ConfirmEmail token={token} onDone={() => replace({ view: 'home' })} />;
  }

  /**
   * UNE RECHERCHE PARTAGÉE PASSE APRÈS LA SESSION, contrairement aux deux
   * écrans ci-dessus. Ceux-là existent précisément pour qui ne peut pas se
   * connecter ; celle-ci, au contraire, ÉCRIT dans un compte — il faut donc
   * savoir lequel. Un visiteur en reçoit une version sans écriture, plus bas.
   */
  if (view === 'shared' && currentUser !== null && currentUser !== undefined) {
    return (
      <SharedSearch
        token={token}
        onApply={(shared) => {
          replace({ view: 'list' });
          onApplySharedSearch(shared);
        }}
        onSave={(shared) => {
          replace({ view: 'saved' });
          onSaveSharedSearch(shared);
        }}
        onCancel={() => replace({ view: 'home' })}
      />
    );
  }

  // Un instant blanc vaut mieux qu'un écran de connexion qui clignote chez
  // quelqu'un déjà connecté. Passé une seconde, en revanche, le blanc n'est plus
  // une transition : il faut dire qu'il se passe quelque chose.
  if (currentUser === undefined) return <SessionPending />;

  if (currentUser === null) {
    if (view === 'shared') {
      return (
        <SharedSearch
          token={token}
          onApply={() => undefined}
          onSave={() => undefined}
          onCancel={() => replace({ view: 'home' })}
          visitor={{
            onBrowse: (shared) => {
              onBrowseSharedSearch(shared);
              replace({ view: 'list' });
            },
            onSignup: () => {
              writePendingSharedToken(token);
              go({ view: 'signup' });
            },
          }}
        />
      );
    }
    if (view === 'forgot') {
      return <ForgotPassword onBack={() => replace({ view: 'home' })} />;
    }
    // L'INSCRIPTION OUVRE DÉJÀ LA SESSION : le serveur pose le cookie avec le
    // compte. On relit donc `/api/me` exactement comme après une connexion,
    // plutôt que de renvoyer vers l'écran de connexion pour y retaper ce qu'on
    // vient de saisir.
    if (view === 'signup') {
      return (
        <SignupScreen
          onBack={() => replace({ view: 'home' })}
          onSignedIn={() => {
            replace({ view: 'home' });
            onSessionOpened();
          }}
        />
      );
    }
    /**
     * UN SEUL ÉCRAN DE CONNEXION, et non deux.
     *
     * Il y en avait un premier — « Connectez-vous pour continuer », un bouton
     * « Se connecter » — devant celui qui porte le formulaire. Deux écrans pour
     * le même geste, et le premier n'apportait qu'une phrase : le nom de ce
     * qu'on venait faire. Cette phrase tient dans le second.
     *
     * CONSULTER RESTE LIBRE : l'écran ne s'impose pas à l'arrivée, il vient
     * quand on le demande ou quand on tente un geste qui appartient à quelqu'un
     * — un favori, un dossier. Le catalogue, lui, s'affiche sans rien demander
     * (§26), et « Revenir aux annonces » y ramène.
     */
    if (pendingAction !== null || PERSONAL_VIEWS.has(view) || view === 'login') {
      return (
        <LoginScreen
          {...(pendingAction !== null ? { raison: pendingAction } : {})}
          onForgot={() => {
            onClearPendingAction();
            go({ view: 'forgot' });
          }}
          onSignup={() => {
            onClearPendingAction();
            go({ view: 'signup' });
          }}
          onSignedIn={() => {
            onClearPendingAction();
            onSessionOpened();
          }}
          onBack={() => {
            onClearPendingAction();
            replace({ view: 'list' });
          }}
        />
      );
    }
    // Tout le reste est du catalogue : on laisse l'application s'afficher.
    return null;
  }

  /**
   * L'ACCUEIL NE S'IMPOSE QU'À QUI A UN COMPTE. Il demande des critères et un
   * dossier — des choses qui n'ont de sens qu'attachées à quelqu'un. Un visiteur
   * y arriverait avant même d'avoir vu une annonce.
   */
  if (onboardingDone === false) {
    return (
      <OnboardingPanel
        profile={profile}
        onSaveProfile={onSaveProfile}
        onFinish={onFinishOnboarding}
      />
    );
  }

  return null;
}

/**
 * Le jeton d'une recherche partagée suivie AVANT l'inscription, s'il y en a un.
 *
 * Le relever le consomme : sans cela il resurgirait à la prochaine ouverture de
 * session, pour un lien oublié depuis longtemps.
 */
export function consumePendingSharedToken(): string | null {
  const token = readPendingSharedToken();
  if (token !== null) writePendingSharedToken(null);
  return token;
}
