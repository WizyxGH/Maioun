/**
 * Les sources PAYÉES, déclarées compte par compte (§6, §26) — écran Paramètres.
 *
 * L'ABONNEMENT EST PERSONNEL, LA CONFIGURATION ÉTAIT GLOBALE. L'accès abonné
 * BEP est payé par quelqu'un, et vivait pourtant dans une variable
 * d'environnement : seul le détenteur du `.env` pouvait s'en servir, et un
 * second compte ne pouvait même pas déclarer l'abonnement qu'il paie.
 *
 * LE MOT DE PASSE NE REVIENT JAMAIS ICI. L'écran dit « configuré » et sous quel
 * identifiant ; il propose de le remplacer, jamais de le relire. Réafficher un
 * mot de passe ne rend service à personne et l'expose à tout ce qui regarde
 * l'écran.
 *
 * CE QUI EST COLLECTÉ PROFITE À TOUS, et il faut le dire franchement : les
 * annonces entrent dans la base commune, comme celles des alertes transférées.
 * Un abonnement suffit donc à servir l'installation entière — ce qui est une
 * raison de plus de savoir qui l'a déclaré.
 */

import { useEffect, useState } from 'react';
import {
  clearSourceAccess,
  fetchSourceAccess,
  saveSourceAccess,
  type SourceAccess,
} from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { ConfirmDialog } from '@/components/ui/dialog.js';

const SOURCE_ID = 'bep-abonnes';

export function PaidSourcesPanel(): React.JSX.Element {
  const [access, setAccess] = useState<SourceAccess | null>(null);
  const [editing, setEditing] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchSourceAccess(SOURCE_ID)
      .then(setAccess)
      .catch(() => setAccess(null));
  }, []);

  const close = (): void => {
    setEditing(false);
    setLogin('');
    setPassword('');
    setError(null);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    const message = await saveSourceAccess(SOURCE_ID, login, password);
    setBusy(false);
    if (message !== null) {
      setError(message);
      setPassword('');
      return;
    }
    setAccess({ configured: true, login, available: true });
    close();
  };

  const clear = async (): Promise<void> => {
    setBusy(true);
    await clearSourceAccess(SOURCE_ID).catch(() => undefined);
    setBusy(false);
    setAccess((current) =>
      current === null ? null : { ...current, configured: false, login: null },
    );
  };

  return (
    <section aria-labelledby="paid-sources-title">
      <h1 id="paid-sources-title" className="text-xl font-bold">
        Accès abonnés
      </h1>
      <p className="text-muted-foreground mt-1 text-[0.88rem]">
        Certaines agences réservent leurs annonces à leurs abonnés. Si vous payez un tel accès,
        déclarez-le ici : la collecte s’en servira pour lire ce que vous avez déjà le droit de lire.
      </p>

      {access === null && <p className="text-muted-foreground mt-4 text-[0.9rem]">Chargement…</p>}

      {access !== null && !access.available && (
        <p className="border-border mt-4 rounded-xl border p-3 text-[0.9rem]">
          Cette installation ne sait pas encore conserver un accès payant en sécurité : il lui
          manque sa clé de chiffrement. Mieux vaut vous le dire que ranger votre mot de passe en
          clair.
        </p>
      )}

      {access !== null && access.available && (
        <div className="border-border mt-4 rounded-xl border p-3">
          <p className="font-medium">BEP Logement — bulletin abonné</p>
          <p className="text-muted-foreground mt-0.5 text-[0.85rem]">
            {access.configured
              ? `Déclaré sous l’identifiant « ${access.login ?? ''} ».`
              : 'Non déclaré : cette source reste inactive.'}
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLogin(access.login ?? '');
                setEditing(true);
              }}
            >
              {access.configured ? 'Remplacer' : 'Déclarer mon abonnement'}
            </Button>
            {access.configured && (
              <Button
                variant="ghost"
                size="sm"
                className="text-bad"
                disabled={busy}
                onClick={() => void clear()}
              >
                Retirer
              </Button>
            )}
          </div>

          <p className="text-muted-foreground mt-2 text-[0.8rem]">
            Votre mot de passe est chiffré et ne vous est jamais réaffiché. Les annonces ainsi
            collectées entrent dans la base commune à tous les comptes de cette installation.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={editing}
        title="Déclarer votre abonnement BEP"
        description="Ces identifiants servent uniquement à lire le bulletin auquel vous êtes abonné. Ils sont chiffrés, et ne vous seront jamais réaffichés."
        confirmLabel={busy ? 'Enregistrement…' : 'Enregistrer'}
        confirmDisabled={busy || login.trim() === '' || password === ''}
        onConfirm={() => void save()}
        onCancel={close}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[0.85rem] font-medium">Identifiant abonné</span>
          <Input
            type="text"
            value={login}
            autoComplete="off"
            onChange={(event) => setLogin(event.target.value)}
            className="w-full text-base"
          />
        </label>
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-[0.85rem] font-medium">Mot de passe abonné</span>
          <Input
            type="password"
            value={password}
            autoComplete="off"
            onChange={(event) => setPassword(event.target.value)}
            className="w-full text-base"
          />
        </label>
        {error !== null && (
          <p role="alert" className="text-bad mt-2 text-[0.85rem]">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}
