/**
 * Réglage des CRITÈRES DE RECHERCHE (§66) — ce qui est collecté et signalé.
 *
 * À ne pas confondre avec les filtres d'affichage de la modale, qui ne font que
 * trier ce qui est déjà là : ici on décide ce qui entrera dans la base et ce
 * qui déclenchera une alerte. Les deux vivent dans la même modale parce qu'on
 * les cherche au même endroit — mais dans deux familles nettement séparées,
 * l'une titrée « Affiner ces résultats », celle-ci dans son propre cadre.
 *
 * TOUT S'APPLIQUE À LA SAISIE, comme le reste de la modale.
 *
 * Ce panneau demandait un clic sur « Appliquer les critères », et proposait à
 * côté un « Valeurs par défaut » qui réécrivait six champs sans les enregistrer
 * — il fallait donc encore appliquer derrière. Deux boutons dont la portée ne
 * se devinait pas, dans le seul bloc d'un écran où tout le reste — tri, budget,
 * pilules, cases — agit dès qu'on y touche. Qui règle un critère puis referme
 * n'a aucune raison de soupçonner qu'il vient de tout perdre.
 *
 * L'écriture est donc DIFFÉRÉE de quelques centaines de millisecondes : frappe
 * par frappe, on enverrait « 4 » puis « 45 » à une base dont Turso facture les
 * accès (§30). Et elle est FORCÉE au démontage — refermer la modale juste après
 * une frappe ne doit pas perdre le réglage.
 */

import { useEffect, useRef, useState } from 'react';
import type { FilterConfig } from '../types.js';
import { fetchDistricts, fetchFilters, saveFilters, type DistrictOption } from '../api/client.js';
import { PanelSkeleton } from './Skeletons.js';
import { MultiSelect } from '@/components/ui/multi-select.js';
import { PillButton } from './QuickFilters.js';
import { Input } from '@/components/ui/input.js';

/**
 * La largeur, et rien d'autre : bordure, fond, hauteur et anneau de focus
 * viennent de `Input`. Cette constante portait tout le style du champ, et
 * l'autre famille de la modale — le budget, la surface — portait le sien,
 * différent. Une seule des deux pouvait être la bonne ; aucune ne l'était.
 */
const FIELD = 'w-28 text-right';
const ROW = 'flex items-center justify-between gap-3 py-2';

/**
 * Délai avant écriture. Assez long pour qu'un nombre à deux chiffres ne compte
 * que pour une écriture, assez court pour que l'accusé arrive pendant qu'on
 * regarde encore le champ.
 */
const SAVE_DELAY_MS = 600;

/**
 * Choix « nature du bailleur ». Les intitulés portent leur propre explication
 * — « seuls », « uniquement » — plutôt qu'une note en petits caractères à côté.
 */
const LANDLORD_OPTIONS: readonly {
  readonly value: 'all' | 'private' | 'agency';
  readonly label: string;
}[] = [
  { value: 'all', label: 'Tous' },
  { value: 'private', label: 'Particuliers seuls' },
  { value: 'agency', label: 'Agences uniquement' },
];

/** Choix « meublé » présentés dans l'ordre Tous / Meublé / Non meublé. */
const FURNISHED_OPTIONS: readonly {
  readonly value: 'all' | 'furnished' | 'unfurnished';
  readonly label: string;
}[] = [
  { value: 'all', label: 'Tous' },
  { value: 'furnished', label: 'Meublé' },
  { value: 'unfurnished', label: 'Non meublé' },
];

/**
 * Choix exclusif parmi quelques options courtes — en PILULES.
 *
 * C'ÉTAIT UN BOUTON SEGMENTÉ, un bloc joint dont l'option retenue s'affichait
 * en aplat plein. « Pièces », « Nombre de personnes » et « Type de bien », dans
 * la même modale et à quelques centimètres, posent exactement la même question
 * — choisir une valeur parmi quelques-unes — avec des pilules séparées et une
 * sélection en teinte pâle. Deux réponses graphiques à une seule question, sans
 * qu'aucune règle ne distingue les cas : la seule chose que les deux familles
 * ne partageaient pas, c'était la date à laquelle elles ont été écrites.
 *
 * `role="group"` et son intitulé restent : ils venaient du bouton segmenté, et
 * sans eux un lecteur d'écran annoncerait quatre boutons sans dire de quel
 * réglage ils relèvent. Les pilules de l'autre famille tiennent cela d'un
 * `fieldset` et de sa `legend` ; ici les lignes n'en ont pas.
 *
 * `flex-wrap` : « Particuliers seuls » et « Agences uniquement » sont bien plus
 * longs que « 2+ ». Sur un téléphone étroit, elles passent à la ligne au lieu
 * de pousser la rangée hors de l'écran.
 */
function PillGroup<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
  readonly ariaLabel: string;
}): React.JSX.Element {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap justify-end gap-1.5">
      {options.map((opt) => (
        <PillButton
          key={opt.value}
          selected={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </PillButton>
      ))}
    </div>
  );
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * @param onSaved Appelé après chaque enregistrement réussi.
 *
 * IL MANQUAIT, ET LE COMPTEUR MENTAIT. Ces réglages s'écrivent côté SERVEUR —
 * c'est lui qui filtre la liste. Le site, lui, ne redemandait rien : le nombre
 * affiché sur « Voir N annonces » restait celui d'avant, et la liste derrière
 * la modale ne bougeait pas non plus. Les pilules, qui filtrent dans le
 * navigateur, se répercutaient immédiatement — d'où l'impression que « certains
 * filtres ne comptent pas ».
 */
export function FiltersPanel({ onSaved }: { readonly onSaved?: () => void }): React.JSX.Element {
  const [filters, setFilters] = useState<FilterConfig | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  /** Les quartiers de l'inventaire. Vide = le bloc « Zone de recherche » se tait. */
  const [districts, setDistricts] = useState<readonly DistrictOption[]>([]);

  /**
   * La minuterie d'écriture différée, et ce qui reste à écrire tant qu'elle
   * n'a pas expiré. C'est ce couple qui permet de forcer l'écriture au
   * démontage.
   */
  const timer = useRef<number | null>(null);
  const unsaved = useRef<FilterConfig | null>(null);

  useEffect(() => {
    void fetchFilters().then(setFilters);
    // Chargé à PART des critères : c'est un inventaire, pas un réglage, et il
    // ne doit pas retarder l'affichage du reste si l'API le refuse.
    void fetchDistricts().then(setDistricts);
  }, []);

  // Refermer la modale démonte ce panneau. Sans ce filet, une valeur saisie
  // moins d'une demi-seconde avant la fermeture serait perdue — et rien ne
  // l'aurait laissé deviner.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (unsaved.current !== null) void saveFilters(unsaved.current);
    },
    [],
  );

  if (filters === null) return <PanelSkeleton rows={5} />;

  const commit = async (next: FilterConfig): Promise<void> => {
    try {
      await saveFilters(next);
      unsaved.current = null;
      setStatus('saved');
      // La liste vient du serveur, et c'est lui qu'on vient de changer : sans
      // ce rappel, l'écran garde la liste d'avant et le compteur avec elle.
      onSaved?.();
    } catch {
      setStatus('error');
    }
  };

  const set = (patch: Partial<FilterConfig>): void => {
    const next = { ...filters, ...patch };
    setFilters(next);
    unsaved.current = next;
    setStatus('saving');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void commit(next), SAVE_DELAY_MS);
  };

  return (
    <section>
      <dl className="divide-y divide-border">
        {/* BUDGET ET SURFACE NE SONT PAS ICI : les filtres d'affichage, quelques
          centimètres plus haut, portent déjà les mêmes deux réglages. Les
          montrer deux fois posait la question « lequel des deux compte ? », à
          laquelle il n'y avait pas de bonne réponse. C'est « Enregistrer cette
          recherche » qui reporte les valeurs des filtres sur les critères. */}
        <div className={ROW}>
          <label htmlFor="maxCommuteMinutes">Trajet max domicile→travail (min)</label>
          <Input
            id="maxCommuteMinutes"
            size="sm"
            type="number"
            min={0}
            className={FIELD}
            value={filters.maxCommuteMinutes ?? 60}
            onChange={(e) => set({ maxCommuteMinutes: Number(e.target.value) })}
          />
        </div>
        {/* LA DATE D'EMMÉNAGEMENT, et elle se lit dans les deux sens. Un
          logement libre APRÈS la date qu'on se fixe n'est pas une option ;
          celui dont la date est inconnue en reste une, et c'est le cas des
          deux tiers des annonces — les écarter viderait la liste sur une
          information que les sources ne donnent pas (§17).

          `date` et non trois champs : le sélecteur natif du navigateur est
          celui que l'utilisateur connaît déjà, et il est correct au clavier
          comme au doigt. */}
        {/* ZONE DE RECHERCHE. La commune était le seul réglage de lieu : on
          cherchait « à Nice », toute la ville, du Vieux Nice à l'Ariane. Le
          quartier est ce qui manquait le plus — c'est lui qui décide du trajet,
          du voisinage et du prix au mètre.

          LE MENU NE PROPOSE QUE CE QUI EXISTE, avec le nombre d'annonces : la
          table en compte une soixantaine, l'inventaire n'en couvre qu'une
          partie, et offrir un quartier vide ferait cocher un filtre qui vide la
          liste sans dire pourquoi. */}
        {districts.length > 0 && (
          <div className="py-2">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="font-medium">Zone de recherche</span>
              <span className="text-muted-foreground text-[0.8rem]">Nice</span>
            </div>
            <MultiSelect
              label="Quartiers"
              searchable
              emptyLabel="Tous les quartiers"
              summarize={(count) => `${count} quartier${count > 1 ? 's' : ''}`}
              options={districts.map((district) => ({
                value: district.slug,
                label: `${district.label} (${district.count})`,
              }))}
              selected={new Set(filters.districts ?? [])}
              onToggle={(slug) => {
                const current = filters.districts ?? [];
                set({
                  districts: current.includes(slug)
                    ? current.filter((one) => one !== slug)
                    : [...current, slug],
                });
              }}
              onClear={() => set({ districts: [] })}
            />
            {(filters.districts?.length ?? 0) > 0 && (
              <p className="text-muted-foreground mt-1.5 text-[0.78rem]">
                Les annonces dont le quartier n’est pas indiqué ne s’affichent plus : nommer des
                quartiers, c’est en exclure le reste.
              </p>
            )}
          </div>
        )}
        <div className={ROW}>
          <label htmlFor="availableBy">Disponible au plus tard le</label>
          <Input
            id="availableBy"
            size="sm"
            type="date"
            className={FIELD}
            value={filters.availableBy ?? ''}
            onChange={(e) => set({ availableBy: e.target.value })}
          />
        </div>
        <div className={ROW}>
          <label htmlFor="excludeFlatShare">Exclure les colocations</label>
          <input
            id="excludeFlatShare"
            type="checkbox"
            className="size-5"
            checked={filters.excludeFlatShare ?? false}
            onChange={(e) => set({ excludeFlatShare: e.target.checked })}
          />
        </div>
        <div className={ROW}>
          <label htmlFor="excludeStudent">Exclure les locations étudiantes</label>
          <input
            id="excludeStudent"
            type="checkbox"
            className="size-5"
            checked={filters.excludeStudent ?? false}
            onChange={(e) => set({ excludeStudent: e.target.checked })}
          />
        </div>
        <div className={ROW}>
          {/* Les intitulés disent eux-mêmes ce qu'ils font : « seuls » et
            « uniquement » rendent la note explicative inutile. */}
          <span>Bailleur</span>
          <PillGroup
            ariaLabel="Nature du bailleur"
            options={LANDLORD_OPTIONS}
            value={filters.landlordFilter ?? 'all'}
            onChange={(landlordFilter) => set({ landlordFilter })}
          />
        </div>
        <div className={ROW}>
          <span>
            Meublé
            <span className="ml-1 text-xs text-muted-foreground">(inconnus conservés)</span>
          </span>
          <PillGroup
            ariaLabel="Caractère meublé"
            options={FURNISHED_OPTIONS}
            value={filters.furnishedFilter ?? 'all'}
            onChange={(furnishedFilter) => set({ furnishedFilter })}
          />
        </div>
      </dl>

      {/* ON NE DIT PLUS « Enregistré », on ne dit que ce qui va mal. Un réglage
        qui s'applique sous le doigt n'a pas besoin d'être confirmé : la liste
        derrière la modale change, et c'est la seule confirmation qui compte.
        L'accusé clignotait à chaque frappe et attirait l'œil là où il n'y avait
        rien à lire. L'ÉCHEC, LUI, RESTE DIT : c'est la seule chose que
        l'utilisateur ne peut pas deviner en regardant l'écran. */}
      {status === 'error' && (
        <p role="status" className="text-bad mt-2 text-[0.82rem]">
          Échec de l’enregistrement.
        </p>
      )}
    </section>
  );
}
