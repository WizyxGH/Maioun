import { describe, expect, it } from 'vitest';
import { lireReponse, type AnnonceCandidate, type MessageRecu } from './reply-reader.js';

const AGENCE = 'contact@agence-azur.example.invalid';
const PORTAIL = 'ne-pas-repondre@mail.seloger.com'; // secret-scan-ignore : adresse d’envoi du portail, publique
const UTILISATEUR = 'moi@boite-perso.example.invalid';

/** Fixtures écrites pour ce test : aucune agence réelle, aucun message réel. */
const annonce = (over: Partial<AnnonceCandidate> = {}): AnnonceCandidate => ({
  listingId: 'L1',
  reference: 'AZ-4821',
  agencyEmail: AGENCE,
  address: '12 rue Smolett, Nice',
  price: 1180,
  ...over,
});

const message = (over: Partial<MessageRecu> = {}): MessageRecu => ({
  id: '<msg-1@example.invalid>',
  from: AGENCE,
  subject: 'Re: Votre demande',
  body: 'Bonjour, bien reçu.',
  ...over,
});

describe('lireReponse — ce qu’un message prouve', () => {
  it('pose « Contactée » d’office sur l’accusé de réception d’un portail', () => {
    const lu = lireReponse(
      message({
        from: PORTAIL,
        subject: 'Votre demande de contact',
        body: 'Bonjour, votre demande a bien été transmise à l’annonceur (réf. AZ-4821).',
      }),
      [annonce({ agencyEmail: null })],
    );
    expect(lu.proposition).toMatchObject({
      listingId: 'L1',
      statut: 'contacted',
      appariement: 'reference',
      appliquerDOffice: true,
      messageId: '<msg-1@example.invalid>',
    });
    expect(lu.proposition?.phrase).toContain('bien été transmise');
  });

  it('propose « Répondu » pour une réponse d’agence, sans l’appliquer', () => {
    const lu = lireReponse(message({ body: 'Bonjour, nous avons bien reçu votre dossier.' }), [
      annonce(),
    ]);
    expect(lu.proposition).toMatchObject({
      statut: 'replied',
      appariement: 'adresse-email',
      appliquerDOffice: false,
    });
    expect(lu.proposition?.phrase).toBe('Bonjour, nous avons bien reçu votre dossier.');
  });

  it('reconnaît une proposition de visite', () => {
    const lu = lireReponse(
      message({ body: 'Nous pouvons vous proposer une visite. Quels sont vos créneaux ?' }),
      [annonce()],
    );
    expect(lu.proposition?.statut).toBe('visitOffered');
    expect(lu.proposition?.phrase).toContain('proposer une visite');
  });

  it('reconnaît une visite confirmée et rend la date TELLE QU’ÉCRITE', () => {
    const lu = lireReponse(
      message({ body: 'Je vous confirme la visite mardi 23 septembre à 14h30, à l’agence.' }),
      [annonce()],
    );
    expect(lu.proposition?.statut).toBe('visitScheduled');
    expect(lu.proposition?.dateCitee).toBe('mardi 23 septembre à 14h30');
  });

  /** Sans date lisible, rien n'est fixé : on ne fabrique pas le jour manquant. */
  it('n’inscrit aucune visite quand la confirmation ne dit pas quand', () => {
    const lu = lireReponse(
      message({ body: 'Je vous confirme la visite, je reviens vers vous pour le créneau.' }),
      [annonce()],
    );
    expect(lu.proposition?.statut).toBe('visitOffered');
    expect(lu.proposition?.dateCitee).toBeUndefined();
  });

  it('reconnaît un dossier non retenu', () => {
    const lu = lireReponse(
      message({ body: 'Votre dossier n’a pas été retenu par le propriétaire.' }),
      [annonce()],
    );
    expect(lu.proposition?.statut).toBe('rejected');
  });

  it('reconnaît un bien déjà loué', () => {
    const lu = lireReponse(message({ body: 'Le bien est déjà loué, désolé.' }), [annonce()]);
    expect(lu.proposition?.statut).toBe('rented');
  });
});

describe('lireReponse — les pièges', () => {
  /**
   * « Nous revenons vers vous » est une attente, pas un refus. Le confondre
   * ferait proposer d'enterrer une annonce encore ouverte.
   */
  it('ne prend pas « nous revenons vers vous » pour un refus', () => {
    const lu = lireReponse(
      message({
        body: 'Bonjour, nous avons bien reçu votre dossier et nous revenons vers vous dès que possible.',
      }),
      [annonce()],
    );
    expect(lu.proposition?.statut).toBe('replied');
  });

  it('ne lit pas une réponse automatique d’absence comme une réponse d’agence', () => {
    const lu = lireReponse(
      message({
        subject: 'Réponse automatique : Re: Votre demande',
        body: 'Je suis absente du bureau jusqu’au 25 septembre. Réf. AZ-4821.',
      }),
      [annonce()],
    );
    expect(lu.proposition).toBeNull();
    expect(lu.raison).toBe('reponse-automatique');
  });

  it('croit l’en-tête qui déclare l’envoi automatique', () => {
    const lu = lireReponse(
      message({
        body: 'Merci de votre message, réf. AZ-4821, nous le traitons.',
        headers: { 'Auto-Submitted': 'auto-replied' },
      }),
      [annonce()],
    );
    expect(lu.raison).toBe('reponse-automatique');
  });

  /** Deux biens également plausibles n'en font pas un : on se tait. */
  it('ne tranche pas quand le message parle de plusieurs biens', () => {
    const lu = lireReponse(
      message({
        body: 'Le 12 rue Smolett (réf. AZ-4821) et le studio réf. AZ-5510 sont tous deux visitables.',
      }),
      [annonce(), annonce({ listingId: 'L2', reference: 'AZ-5510', address: null, price: null })],
    );
    expect(lu.proposition).toBeNull();
    expect(lu.raison).toBe('plusieurs-annonces');
  });

  it('départage deux annonces de la même agence par la référence citée', () => {
    const lu = lireReponse(
      message({ body: 'Concernant la réf. AZ-5510, je vous propose une visite jeudi.' }),
      [annonce(), annonce({ listingId: 'L2', reference: 'AZ-5510', address: null, price: null })],
    );
    expect(lu.proposition).toMatchObject({ listingId: 'L2', appariement: 'reference' });
  });

  /** La relance de l'utilisateur revient dans le fil : ce n'est pas l'agence. */
  it('ignore un message envoyé par l’utilisateur lui-même', () => {
    const lu = lireReponse(
      message({
        from: `Moi <${UTILISATEUR}>`,
        body: 'Bonjour, je vous relance au sujet de la réf. AZ-4821, je reste disponible pour une visite.',
      }),
      [annonce()],
      { adressesUtilisateur: [UTILISATEUR] },
    );
    expect(lu.proposition).toBeNull();
    expect(lu.raison).toBe('expediteur-utilisateur');
  });

  /**
   * La citation en bas du fil contient NOS mots. Elle dit de quelle annonce on
   * parle, jamais ce que l'agence répond.
   */
  it('ne conclut rien depuis la citation du message d’origine', () => {
    const lu = lireReponse(
      message({
        body: [
          'Bonjour, bien reçu, je vous rappelle demain.',
          '',
          'Le 15 septembre 2026, Maïoun a écrit :',
          '> Bonjour, je suis intéressé par le T2 réf. AZ-4821 à 1 180 €.',
          '> Si le bien n’est plus disponible, merci de me le dire.',
        ].join('\n'),
      }),
      [annonce()],
    );
    expect(lu.proposition).toMatchObject({ statut: 'replied', appariement: 'reference' });
    expect(lu.proposition?.phrase).toBe('Bonjour, bien reçu, je vous rappelle demain.');
  });

  it('écarte de la même façon une citation HTML (blockquote)', () => {
    const lu = lireReponse(
      message({
        body: '<div><p>Bien noté, je reviens vers vous.</p><blockquote><p>Réf. AZ-4821 — si le bien n’est plus disponible, dites-le moi.</p></blockquote></div>',
      }),
      [annonce()],
    );
    expect(lu.proposition?.statut).toBe('replied');
  });

  it('se tait quand aucune annonce ne correspond avec certitude', () => {
    const lu = lireReponse(
      message({
        from: PORTAIL,
        subject: 'Nos nouveautés de la semaine',
        body: 'Votre demande a bien été transmise à l’annonceur.',
      }),
      [annonce({ agencyEmail: null })],
    );
    expect(lu.proposition).toBeNull();
    expect(lu.raison).toBe('aucune-annonce-certaine');
  });

  it('se tait quand la liste de candidates est vide', () => {
    expect(lireReponse(message(), []).raison).toBe('aucune-annonce-certaine');
  });

  it('n’interprète jamais un expéditeur hors liste, même bavard', () => {
    const lu = lireReponse(
      message({
        from: 'inconnu@ailleurs.example.invalid',
        body: 'Le bien réf. AZ-4821 est déjà loué.',
      }),
      [annonce({ agencyEmail: null })],
      { expediteursSuivis: ['agence-azur.example.invalid'] },
    );
    expect(lu.proposition).toBeNull();
    expect(lu.raison).toBe('expediteur-inconnu');
  });

  it('apparie par l’adresse du bien et son loyer quand la référence manque', () => {
    const lu = lireReponse(
      message({
        from: PORTAIL,
        subject: 'Votre demande de contact',
        body: 'Votre demande a bien été transmise pour le 12 rue Smolett à Nice, 1 180 € par mois.',
      }),
      [annonce({ reference: null, agencyEmail: null })],
    );
    expect(lu.proposition).toMatchObject({ statut: 'contacted', appariement: 'bien-et-loyer' });
  });

  /** Un digest de nouveautés n'est pas une preuve d'envoi : rien à proposer. */
  it('ne tire rien d’un message de portail sans intention lisible', () => {
    const lu = lireReponse(
      message({
        from: PORTAIL,
        subject: 'Nouvelles annonces',
        body: 'Réf. AZ-4821 — 1 180 € — 12 rue Smolett, Nice.',
      }),
      [annonce({ agencyEmail: null })],
    );
    expect(lu.proposition).toBeNull();
    expect(lu.raison).toBe('aucune-intention');
  });
});
