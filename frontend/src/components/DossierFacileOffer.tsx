/**
 * PROPOSER LE DOSSIER VÉRIFIÉ DE L'ÉTAT — à qui n'en a pas encore.
 *
 * Le lien DossierFacile existait comme un champ facultatif de plus au fond du
 * profil, et l'adresse du service n'apparaissait que dans un message d'ERREUR,
 * quand on collait un lien de travers. Autrement dit : il fallait déjà
 * connaître le service pour qu'on vous en parle.
 *
 * Qui ne le connaît pas voyait, au moment de candidater, une liste de pièces à
 * déposer ici — la voie la plus longue, pour un dossier que le bailleur devra
 * vérifier lui-même. Un dossier déjà contrôlé par l'État est ce qui départage
 * sur ce marché.
 *
 * UN SEUL TEXTE, à deux endroits : au profil, où l'on règle ; et sur l'écran de
 * candidature, où l'on décide. Deux rédactions auraient fini par ne plus dire
 * la même chose du même service.
 */

import { DOSSIER_FACILE_HOME } from '@maioun/shared';
import { ExternalLink } from './icons.js';

export function DossierFacileOffer({
  className = '',
}: {
  readonly className?: string;
}): React.JSX.Element {
  return (
    <section className={`border-primary/30 bg-primary/5 rounded-lg border px-3 py-2 ${className}`}>
      <h3 className="text-[0.85rem] font-medium">Pas encore de dossier vérifié ?</h3>
      <p className="text-muted-foreground mt-1 text-[0.85rem]">
        DossierFacile est le service <strong>gratuit de l’État</strong> : vous y déposez vos pièces
        une fois, elles sont contrôlées, et vous n’envoyez plus qu’un lien. Le bailleur ouvre un
        dossier déjà vérifié — et vos pièces restent chez eux, pas chez nous.
      </p>
      <a
        href={DOSSIER_FACILE_HOME}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary mt-1.5 inline-flex items-center gap-1 text-[0.85rem] font-medium underline"
      >
        Créer mon dossier
        <ExternalLink aria-hidden="true" className="size-3.5" />
      </a>
    </section>
  );
}
