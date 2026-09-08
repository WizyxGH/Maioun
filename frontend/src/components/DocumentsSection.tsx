/**
 * Pièces du dossier de candidature (§25) — écran Paramètres.
 *
 * L'utilisateur dépose ses pièces UNE FOIS ; elles sont resservies à chaque
 * candidature. Rien n'est jamais envoyé automatiquement (§24) — ce panneau ne
 * fait que déposer, lister, consulter et supprimer.
 *
 * Elles vivaient sur le disque de la machine qui servait le site. Ce serveur
 * a disparu, et elles sont désormais dans l'espace de fichiers du Worker,
 * rangées par compte : c'est ce qui les rend atteignables DEPUIS LE TÉLÉPHONE,
 * et donc joignables à une candidature envoyée d'où l'on est.
 *
 * Les pièces sont rangées par emplacement, selon la liste limitative du décret
 * n° 2015-1437. Une liste plate ne disait pas ce qu'il restait à fournir, alors
 * que c'est la seule question qui compte au moment de candidater. Chaque
 * emplacement est REPLIÉ tant qu'il n'est pas ouvert : neuf blocs dépliés
 * faisaient une page à faire défiler sans fin.
 *
 * Le rangement passe par un préfixe dans le nom du fichier : le stockage reste
 * un simple ensemble de clés, sans index à tenir à jour à côté.
 */

import { useEffect, useRef, useState } from 'react';
import {
  canStoreDocuments,
  deleteDocument,
  documentUrl,
  fetchDocuments,
  uploadDocument,
  type DocumentInfo,
} from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { ChevronDown, Eye, FileCheck2, FileText, FileWarning, Trash2, Upload } from './icons.js';
import { SettingsGroup, SettingsRow } from './SettingsRow.js';
import {
  FORBIDDEN_PIECES,
  displayName,
  dossierSlots,
  slotOf,
  slotPrefix,
  type DossierSlot,
} from '../dossier.js';
import type { TenantProfile } from '@rentfinder/shared';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Exactement ce que le Worker accepte (`packages/worker/src/documents.ts`).
 * Y ajouter `.doc` reviendrait à laisser choisir un fichier pour le voir
 * refusé après l'attente du téléversement.
 */
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic';

/**
 * L'aperçu d'une pièce, à gauche de son nom.
 *
 * Un nom de fichier ne dit pas ce qu'il contient — surtout renommé par le
 * rangement (`garant-caution__…`). La vignette rend la pièce reconnaissable, et
 * permet de repérer celle qu'on a déposée de travers.
 *
 * Les PDF gardent une icône : le navigateur ne sait pas les rendre dans un
 * `img`.
 */
function DocumentThumbnail({ doc }: { readonly doc: DocumentInfo }): React.JSX.Element {
  const isImage = /\.(jpe?g|png|webp|heic)$/i.test(doc.name);
  const [src, setSrc] = useState<string | null>(null);

  /**
   * L'IMAGE EST TÉLÉCHARGÉE, PAS POINTÉE — et c'est ce qui la fait apparaître
   * sur téléphone.
   *
   * `<img src="…/api/documents/…">` est une requête vers un AUTRE domaine que
   * le site : le Worker. Elle n'aboutit qu'avec le cookie de session, or les
   * navigateurs qui refusent les cookies tiers — Safari en tête — ne le
   * joignent pas à une balise `img`. Le Worker répondait donc 401 et la
   * vignette restait vide, sur le seul appareil où l'on dépose ses pièces.
   *
   * `fetch` avec `credentials: 'include'` est exactement le chemin qu'emprunte
   * déjà tout le reste de l'application, et lui fonctionne. On lit les octets,
   * on en fait une URL locale — que l'on RELÂCHE au démontage, faute de quoi
   * chaque ouverture de l'écran retiendrait quelques mégaoctets.
   */
  useEffect(() => {
    if (!isImage) return undefined;
    let objectUrl: string | null = null;
    let cancelled = false;

    void fetch(documentUrl(doc.name), { credentials: 'include' })
      .then(async (response) => (response.ok ? await response.blob() : null))
      .then((blob) => {
        if (blob === null || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        /* Hors ligne, ou pièce disparue : l'icône neutre prend le relais. */
      });

    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.name, isImage]);

  // L'ICÔNE NEUTRE COUVRE LES TROIS CAS : ce n'est pas une image, elle n'est
  // pas encore arrivée, ou elle n'arrivera pas. Un cadre vide ne disait rien
  // de ces trois-là.
  if (src === null) {
    return (
      <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
        <FileText aria-hidden="true" className="text-muted-foreground size-5" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="bg-muted size-10 shrink-0 rounded-md object-cover"
      // Un format que le navigateur ne sait pas rendre — le HEIC d'un iPhone,
      // le plus souvent — repasse à l'icône plutôt que de laisser un cadre cassé.
      onError={() => setSrc(null)}
    />
  );
}

/**
 * Un nom qui n écrase rien.
 *
 * LE STOCKAGE EST UN ENSEMBLE DE CLÉS : deux fichiers portant le même nom
 * occupent la même, et le second efface le premier sans un mot. Or c est le cas
 * courant — les photos d un téléphone s appellent toutes `IMG_1234.jpg`, et
 * l on dépose justement un recto ET un verso. On croyait n avoir réussi qu un
 * seul envoi.
 *
 * Le rang est glissé AVANT l extension, pour que le fichier reste ouvrable.
 */
export function uniqueName(
  slotId: string | null,
  fileName: string,
  taken: ReadonlySet<string>,
): string {
  const prefix = slotId === null ? '' : slotPrefix(slotId);
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';

  let candidate = `${prefix}${fileName}`;
  for (let rank = 2; taken.has(candidate); rank += 1) {
    candidate = `${prefix}${base} (${rank})${ext}`;
  }
  return candidate;
}

/** Une pièce déposée : aperçu, lien de consultation, poids, suppression. */
function DocumentRow({
  doc,
  onDelete,
}: {
  readonly doc: DocumentInfo;
  readonly onDelete: (name: string) => void;
}): React.JSX.Element {
  const label = displayName(doc.name);
  const [ouverture, setOuverture] = useState(false);

  /**
   * Ouvre la pièce dans un onglet, depuis des octets et non depuis l'API.
   *
   * L'adresse locale n'est PAS révoquée tout de suite : le navigateur en a
   * besoin le temps que l'onglet la charge. Une minute suffit largement, et la
   * garder indéfiniment retiendrait le fichier en mémoire.
   */
  const ouvrir = async (): Promise<void> => {
    setOuverture(true);
    try {
      const response = await fetch(documentUrl(doc.name), { credentials: 'include' });
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      window.open(url, '_blank', 'noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      /* Hors ligne : rien ne s'ouvre, et c'est tout ce qu'on peut en dire. */
    } finally {
      setOuverture(false);
    }
  };

  return (
    <li className="flex items-center gap-2 py-1.5">
      <DocumentThumbnail doc={doc} />

      {/* LE POIDS PASSE SOUS LE NOM. Sur la même ligne, il prenait — avec la
        vignette et la corbeille — près de cent pixels des trois cents
        disponibles sur un téléphone : il ne restait « Carte identité re… » d'un
        nom qui en fait quarante-six. Le nom est ce qu'on lit, le poids ce qu'on
        vérifie ; l'un ne doit pas manger l'autre. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ON N'OUVRE PLUS L'ADRESSE DE L'API, ON OUVRE LES OCTETS.

          Un lien vers `…/api/documents/…` est une navigation vers un AUTRE
          site que celui-ci : le cookie de session ne l'accompagne pas, et
          l'onglet affichait « Connexion requise » au lieu de la pièce. C'est
          le même empêchement que pour la vignette, sous une autre forme.

          On télécharge donc le fichier — requête faite DEPUIS la page, où le
          cookie voyage — puis on ouvre une adresse locale. L'œil dit que ça
          s'ouvre : un nom souligné pouvait passer pour un simple intitulé. */}
        <button
          type="button"
          onClick={() => void ouvrir()}
          disabled={ouverture}
          className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-[0.9rem] text-primary underline"
        >
          <Eye aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
        <span className="text-muted-foreground text-[0.78rem]">{formatSize(doc.size)}</span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onDelete(doc.name)}
        aria-label={`Supprimer ${label}`}
        title={`Supprimer ${label}`}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </Button>
    </li>
  );
}

/** Un emplacement du dossier : replié, il ne montre que son état. */
function Slot({
  slot,
  documents,
  open,
  busy,
  onToggle,
  onAdd,
  onDelete,
}: {
  readonly slot: DossierSlot;
  readonly documents: readonly DocumentInfo[];
  readonly open: boolean;
  readonly busy: boolean;
  readonly onToggle: () => void;
  readonly onAdd: (slotId: string, files: FileList | null) => void;
  readonly onDelete: (name: string) => void;
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const filled = documents.length > 0;

  return (
    <SettingsRow
      Icon={filled ? FileCheck2 : FileWarning}
      tone={filled ? 'done' : 'muted'}
      label={slot.label}
      badge={filled ? `${documents.length} pièce${documents.length > 1 ? 's' : ''}` : 'À fournir'}
      hint={open ? slot.hint : undefined}
      onClick={onToggle}
      trailing={
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      }
    >
      {open ? (
        <>
          {filled && (
            <ul className="flex flex-col divide-y divide-border">
              {documents.map((doc) => (
                <DocumentRow key={doc.name} doc={doc} onDelete={onDelete} />
              ))}
            </ul>
          )}
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              onAdd(slot.id, event.target.files);
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={filled ? 'mt-2' : ''}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden="true" className="size-4" />
            {filled ? 'Ajouter une pièce' : 'Joindre'}
          </Button>
        </>
      ) : undefined}
    </SettingsRow>
  );
}

/**
 * @param profile Le profil locataire, pour les GARANTIES qu'il déclare : elles
 *   décident des pièces demandées. Un visa Visale remplace à lui seul tout le
 *   dossier d'une caution, et afficher les cinq emplacements d'un garant qu'on
 *   n'a pas laissait croire à un dossier incomplétable. Deux garants physiques,
 *   à l'inverse, ont bien chacun leur dossier. Profil absent : on ne suppose
 *   aucune garantie (§17).
 */
export function DocumentsSection({
  profile,
}: {
  readonly profile: TenantProfile | null;
}): React.JSX.Element | null {
  const [documents, setDocuments] = useState<readonly DocumentInfo[]>([]);
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchDocuments()
      .then(setDocuments)
      .catch(() => {
        /* API injoignable : la section reste vide plutôt que d'alarmer */
      });
  }, []);

  // Sans espace de fichiers (démo, accès direct à Turso), un dépôt serait perdu
  // au rechargement : mieux vaut ne rien promettre du tout.
  if (!canStoreDocuments()) return null;

  const handleFiles = async (slotId: string | null, files: FileList | null): Promise<void> => {
    if (files === null || files.length === 0) return;
    setBusy(true);
    setError(null);

    /**
     * UN ÉCHEC N'ABANDONNE PLUS LES SUIVANTS. La boucle vivait dans un seul
     * `try` : la première pièce refusée — trop lourde, format inconnu —
     * emportait toutes celles sélectionnées avec elle, sans dire lesquelles.
     * On déposait deux fichiers et l'on en retrouvait un, voire aucun.
     *
     * Chaque pièce est donc tentée pour elle-même, et le message NOMME celles
     * qui n'ont pas abouti : c'est la seule chose qui permette de recommencer
     * à bon escient (§17).
     */
    const refusees: string[] = [];
    let dernierMessage: string | null = null;
    // Les noms déjà pris, ceux de la base ET ceux de ce lot : le stockage est
    // un ensemble de CLÉS, et deux fichiers homonymes s écrasent en silence.
    const pris = new Set(documents.map((doc) => doc.name));

    for (const file of files) {
      const named = new File([file], uniqueName(slotId, file.name, pris), { type: file.type });
      pris.add(named.name);
      try {
        const saved = await uploadDocument(named);
        setDocuments((current) => [...current.filter((doc) => doc.name !== saved.name), saved]);
      } catch (caught) {
        refusees.push(file.name);
        dernierMessage = caught instanceof Error ? caught.message : null;
      }
    }

    if (refusees.length > 0) {
      setError(
        `${refusees.length > 1 ? 'Ces pièces n’ont pas été déposées' : 'Cette pièce n’a pas été déposée'} : ` +
          `${refusees.join(', ')}${dernierMessage === null ? '' : ` — ${dernierMessage}`}`,
      );
    }
    setBusy(false);
  };

  const handleDelete = (name: string): void => {
    setDocuments((current) => current.filter((doc) => doc.name !== name));
    void deleteDocument(name).catch(() => setError('La suppression a échoué'));
  };

  const inSlot = (slotId: string): DocumentInfo[] =>
    documents.filter((doc) => slotOf(doc.name) === slotId);
  // Pièces déposées avant que le rangement n'existe, ou hors liste : elles ne
  // disparaissent pas de l'écran pour autant.
  const unsorted = documents.filter((doc) => slotOf(doc.name) === null);

  const slots = dossierSlots(profile?.guarantors ?? []);
  const tenant = slots.filter((slot) => !slot.forGuarantor);
  const guarantee = slots.filter((slot) => slot.forGuarantor);
  const done = (slots: readonly DossierSlot[]): number =>
    slots.filter((slot) => inSlot(slot.id).length > 0).length;

  const group = (slots: readonly DossierSlot[]): React.ReactNode =>
    slots.map((slot) => (
      <Slot
        key={slot.id}
        slot={slot}
        documents={inSlot(slot.id)}
        open={openSlot === slot.id}
        busy={busy}
        onToggle={() => setOpenSlot((current) => (current === slot.id ? null : slot.id))}
        onAdd={(id, files) => void handleFiles(id, files)}
        onDelete={handleDelete}
      />
    ));

  return (
    <section aria-labelledby="documents-title" className="mt-8">
      <h2 id="documents-title" className="text-lg font-bold">
        Dossier de candidature
      </h2>
      <p className="mt-1 text-[0.85rem] text-muted-foreground">
        Déposé une fois, accessible depuis vos appareils, <strong>lisible de vous seul</strong> et{' '}
        <strong>jamais envoyé automatiquement</strong> : c’est vous qui joignez vos pièces. PDF et
        images, 10 Mo par pièce.
      </p>

      {error !== null && (
        <p
          className="mt-3 rounded-xl border border-bad px-3 py-2 text-[0.88rem] text-bad"
          role="alert"
        >
          {error}
        </p>
      )}

      <SettingsGroup title="Vos pièces" count={`${done(tenant)}/${tenant.length}`}>
        {group(tenant)}
      </SettingsGroup>

      {guarantee.length > 0 && (
        <SettingsGroup title="Garantie" count={`${done(guarantee)}/${guarantee.length}`}>
          {group(guarantee)}
        </SettingsGroup>
      )}

      {unsorted.length > 0 && (
        <SettingsGroup title="Non classées">
          <li className="rounded-xl border border-border p-3">
            <ul className="flex flex-col divide-y divide-border">
              {unsorted.map((doc) => (
                <DocumentRow key={doc.name} doc={doc} onDelete={handleDelete} />
              ))}
            </ul>
          </li>
        </SettingsGroup>
      )}

      {/* La liste du décret est LIMITATIVE : le savoir évite d'en donner plus
        que nécessaire, ce qui est le sens même du §26. */}
      <details className="mt-4 text-[0.85rem] text-muted-foreground">
        <summary className="cursor-pointer">Ce qu’un bailleur ne peut pas exiger</summary>
        <p className="mt-1.5">
          La liste ci-dessus est fixée par le décret n° 2015-1437 et elle est limitative. Sont
          notamment interdits : {FORBIDDEN_PIECES.join(', ')}.
        </p>
      </details>
    </section>
  );
}
