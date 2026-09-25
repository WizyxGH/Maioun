/**
 * L'OUTIL ENTIER SUR CETTE MACHINE : servir ET tenir à jour, ensemble.
 *
 *   pnpm local                      sert, collecte, puis recollecte
 *   pnpm local -- --toutes 20       autre cadence, en minutes
 *   pnpm local -- --sans-collecte   comme `pnpm serve:local`
 *
 * `serve:local` montrait une PHOTO : les annonces du dernier passage, qui
 * vieillissent sans que rien ne les rafraîchisse. Il fallait penser à lancer
 * une collecte à côté, dans un autre terminal, et se souvenir de la relancer.
 * Une semaine sans base distante, c'est une semaine à consulter la veille.
 *
 * LES DEUX EN MÊME TEMPS, ET SANS SE GÊNER : la base locale est en WAL, donc le
 * serveur lit pendant que la collecte écrit. C'est la raison d'être de ce
 * réglage, posé dans `db/client.ts`.
 *
 * ELLE SOLLICITE DE VRAIS SITES. C'est le propre d'une collecte, et c'est
 * pourquoi cette commande le dit avant de commencer, plutôt que de le faire
 * dans le dos de qui voulait seulement regarder.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { cadence, environnementLocal, motAlertes } from './local-options.js';

const arguments_ = process.argv.slice(2);
const sansCollecte = arguments_.includes('--sans-collecte');

const choix = cadence(arguments_);
if ('refus' in choix) {
  console.error(choix.refus);
  process.exit(1);
}
const { minutes } = choix;

const ici = import.meta.dirname;

const environnement = environnementLocal(process.env);

const enfants: ChildProcess[] = [];

function lancer(script: string): ChildProcess {
  const enfant = spawn(process.execPath, [resolve(ici, script)], {
    env: environnement,
    stdio: 'inherit',
  });
  enfants.push(enfant);
  return enfant;
}

const serveur = lancer('serve.js');
serveur.on('exit', (code) => {
  console.error(`Le serveur local s'est arrêté (code ${code ?? '?'}).`);
  arreter(code ?? 1);
});

/** Une collecte est-elle en cours ? Deux en parallèle se marcheraient dessus. */
let enCours = false;

function collecter(): void {
  if (enCours) {
    console.log('Collecte précédente encore en cours : on saute ce tour.');
    return;
  }
  enCours = true;
  const debut = Date.now();
  const passage = lancer('collect.js');
  passage.on('exit', (code) => {
    enCours = false;
    const secondes = ((Date.now() - debut) / 1000).toFixed(0);
    // UNE COLLECTE QUI ÉCHOUE N'ARRÊTE PAS LE SERVEUR : les annonces déjà
    // collectées restent consultables, et c'est tout l'intérêt du mode local.
    console.log(
      code === 0
        ? `Collecte terminée en ${secondes} s — l'écran se recharge au prochain passage.`
        : `Collecte en échec (code ${code ?? '?'}) après ${secondes} s. Les annonces déjà en base restent lisibles.`,
    );
  });
}

function arreter(code: number): void {
  for (const enfant of enfants) {
    if (enfant.exitCode === null) enfant.kill();
  }
  process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => arreter(0));
}

if (sansCollecte) {
  console.log('Mode consultation seule : aucune collecte ne sera lancée.');
} else {
  console.log(
    [
      '',
      `Collecte toutes les ${minutes} min, dans data/local.db.`,
      'Elle interroge de VRAIS sites, à son rythme habituel (3 s entre deux requêtes).',
      motAlertes(process.env),
      '',
    ].join('\n'),
  );
  collecter();
  setInterval(collecter, minutes * 60_000);
}
