/**
 * VOS DÉMARCHES, DANS L'ORDRE DE CE QUI ATTEND LE PLUS.
 *
 * Le suivi vivait en trois endroits qui ne se parlaient pas : le statut de
 * l'annonce, le registre des démarches, et les réponses lues dans la boîte. On
 * savait qu'une annonce était « contactée » ; on ne savait pas depuis QUAND,
 * combien de fois, ni laquelle attend depuis trois semaines.
 *
 * LA COLONNE QU'ON REGARDE VRAIMENT EST L'ATTENTE, et c'est pourquoi elle
 * ouvre chaque ligne. Trier par date d'envoi décroissante aurait montré ce
 * qu'on vient de faire — ce qu'on sait déjà.
 */

import { formatAge, formatCity, formatPrice } from '../format.js';
import type { ExchangeView } from '../api/client.js';
import { ArrowLeft } from './icons.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { ItemButton, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item.js';

/** Le canal, dit comme on le dirait à voix haute. */
const CANAUX: Readonly<Record<string, string>> = {
  email: 'par e-mail',
  phone: 'par téléphone',
  form: 'par formulaire',
  manual: 'à la main',
};

/** Ce que le registre sait de la suite, quand il sait quelque chose. */
const SUITES: Readonly<Record<string, string>> = {
  replied: 'réponse reçue',
  refused: 'refus',
  rented: 'déjà loué',
};

export function ExchangesPanel({
  exchanges,
  nowMs,
  onBack,
  onOpen,
}: {
  readonly exchanges: readonly ExchangeView[];
  readonly nowMs: number;
  readonly onBack: () => void;
  readonly onOpen: (id: string) => void;
}): React.JSX.Element {
  return (
    <div>
      <header className="mb-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Retour
        </Button>
      </header>

      <h1 className="mb-1 text-xl font-bold">Vos démarches</h1>
      <p className="text-muted-foreground mb-3 text-[0.9rem]">
        Ce que vous avez envoyé, et depuis combien de temps vous attendez. La plus ancienne d’abord
        : c’est elle à relancer.
      </p>

      {exchanges.length === 0 ? (
        <Card className="text-muted-foreground py-8 text-center text-[0.92rem]">
          Aucune démarche enregistrée. Elles s’inscrivent ici dès que vous contactez une annonce ou
          que vous la marquez « Contactée ».
        </Card>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="exchange-list">
          {exchanges.map((exchange) => (
            <li key={exchange.listing.id}>
              <ItemButton onClick={() => onOpen(exchange.listing.id)}>
                <ItemContent>
                  <ItemTitle className="truncate">
                    {/* L'ATTENTE D'ABORD : c'est la seule chose qui décide d'agir. */}
                    {formatAge(exchange.lastContactAt, nowMs)} ·{' '}
                    {exchange.listing.title.value ?? 'Annonce'}
                  </ItemTitle>
                  <ItemDescription className="text-[0.8rem]">
                    {[
                      formatPrice(exchange.listing.price.value),
                      formatCity(exchange.listing.city.value),
                      CANAUX[exchange.lastChannel] ?? 'à la main',
                      exchange.attempts > 1 ? `${exchange.attempts} messages` : null,
                      SUITES[exchange.lastOutcome] ?? null,
                    ]
                      .filter((part) => part !== null)
                      .join(' · ')}
                  </ItemDescription>
                </ItemContent>
              </ItemButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
