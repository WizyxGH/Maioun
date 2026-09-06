import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { initTheme } from './theme.js';
import { basePath } from './router.js';
import './styles.css';

// AVANT le premier rendu : sinon la page s'affiche une fraction de seconde
// dans le thème de l'appareil avant de basculer — un éclair blanc dans une
// chambre sombre, ce qu'on cherchait précisément à éviter.
initTheme();

const container = document.getElementById('root');
if (container === null) throw new Error('Élément #root introuvable');

createRoot(container).render(
  <StrictMode>
    {/* AUTOUR DE TOUT. Une erreur d'affichage démontait l'arbre entier et ne
      laissait RIEN à l'écran — ni message, ni bouton de retour. Recharger n'y
      changeait rien : la même donnée relançait la même erreur.
      Le retour à l'accueil passe par l'adresse plutôt que par le routeur : à ce
      niveau, il n'y a plus de composant React vivant pour naviguer. */}
    <ErrorBoundary onHome={() => window.location.assign(`${basePath()}/`)}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
