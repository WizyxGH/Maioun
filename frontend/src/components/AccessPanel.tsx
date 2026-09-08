/**
 * Les accès supplémentaires (§6) — écran Paramètres.
 *
 * C'ÉTAIENT DEUX ÉCRANS, et ils disaient la même chose. « Alertes des
 * portails » et « Accès abonnés » répondaient l'un et l'autre à la question
 * « que puis-je apporter pour que la collecte trouve plus ? » : une adresse
 * vers laquelle faire suivre ses alertes, un abonnement payant à déclarer.
 * Deux portes voisines dans la liste des réglages, pour un seul sujet.
 *
 * Ce qu'ils ont en commun n'est pas anecdotique : dans les deux cas, la
 * collecte ne peut pas atteindre ces annonces seule, et c'est le compte qui
 * ouvre le passage — sans jamais confier de mot de passe de messagerie (§26).
 */

import { ForwardingSection } from './ForwardingPanel.js';
import { PaidSourcesSection } from './PaidSourcesPanel.js';

export function AccessPanel(): React.JSX.Element {
  return (
    <div>
      <h1 className="text-xl font-bold">Accès supplémentaires</h1>
      <p className="text-muted-foreground mt-1 text-[0.88rem]">
        Certaines annonces n’arrivent que si vous ouvrez le passage.
      </p>

      <section aria-labelledby="forwarding-title" className="mt-6">
        <h2 id="forwarding-title" className="text-lg font-semibold">
          Alertes des portails
        </h2>
        <ForwardingSection />
      </section>

      <section aria-labelledby="paid-title" className="mt-8">
        <h2 id="paid-title" className="text-lg font-semibold">
          Abonnements payants
        </h2>
        <PaidSourcesSection />
      </section>
    </div>
  );
}
