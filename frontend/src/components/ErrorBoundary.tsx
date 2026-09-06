/**
 * Le dernier filet : une erreur d'affichage ne doit pas vider l'écran.
 *
 * POURQUOI IL EXISTE. Une annonce dont la description manquait — un champ
 * retiré en SQL pour alléger la liste — a suffi à faire tomber TOUT le rendu.
 * React démonte l'arbre entier dès qu'un composant lève, et il ne restait rien
 * à l'écran : pas un message, pas un bord de page, pas un bouton de retour.
 * Du point de vue de l'utilisateur, l'application était morte, et recharger n'y
 * changeait rien puisque l'annonce était toujours la même.
 *
 * Le défaut de fond est corrigé. Ce filet est là pour le PROCHAIN, car il y en
 * aura un : un champ absent ne lève pas à la compilation, ne se voit pas dans
 * un test qui n'a pas exactement cette donnée, et ne se remarque qu'en
 * production, sur une annonce particulière.
 *
 * IL NE MASQUE RIEN. L'erreur reste écrite dans la console — c'est elle qu'on
 * lit pour corriger — et l'écran dit franchement que quelque chose a échoué au
 * lieu de faire semblant. Il offre surtout DEUX SORTIES, parce qu'une page
 * cassée sans issue oblige à taper une adresse à la main : revenir à l'accueil,
 * ou recharger.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button.js';
import { TriangleAlert } from './icons.js';

interface Props {
  readonly children: ReactNode;
  /** Où retourner. Sans cela, seul le rechargement resterait. */
  readonly onHome: () => void;
}

interface State {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // La console reste la source de vérité pour corriger : on n'avale rien.
    console.error('Rendu interrompu :', error, info.componentStack);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
    this.props.onHome();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center gap-4 px-4">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <TriangleAlert aria-hidden="true" className="text-bad size-5 shrink-0" />
          Cet écran n’a pas pu s’afficher
        </h1>
        <p className="text-muted-foreground text-[0.9rem]">
          Le reste de l’application fonctionne. Revenez à l’accueil, ou rechargez la page.
        </p>
        {/* Le message technique est GARDÉ, replié : c'est ce qu'on recopie pour
          faire corriger, et il ne veut rien dire à qui ne le cherche pas. */}
        <details className="text-muted-foreground text-[0.8rem]">
          <summary className="cursor-pointer">Détail technique</summary>
          <code className="mt-1 block break-all">{error.message}</code>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button onClick={this.retry}>Revenir à l’accueil</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recharger
          </Button>
        </div>
      </main>
    );
  }
}
