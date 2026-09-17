/**
 * L'ADRESSE D'ORIGINE D'UNE PHOTO SERVIE PAR UN PROXY.
 *
 * Un portail qui republie l'annonce d'une agence sert rarement le fichier de
 * l'agence : il le fait passer par son propre redimensionneur, sous une adresse
 * à lui. Le cliché est le même, son adresse ne l'est plus, et le rapprochement
 * par la photo — le plus sûr dont nous disposions — ne voit rien.
 *
 * CERTAINS PROXYS TRANSPORTENT POURTANT L'ORIGINE, en clair dans leur propre
 * adresse. La rendre, c'est retrouver le fichier de l'agence et, avec lui, le
 * rapprochement. Une adresse qu'on ne sait pas défaire est rendue telle quelle :
 * on ne perd jamais ce qu'on avait.
 */

/**
 * ParuVendu : `img.paruvendu.fr/media_ext/_https_/<hôte>/<2>/<2>/<base64>_rct`.
 *
 * L'hôte de l'agence est écrit en clair ; le chemin du fichier est en base64
 * d'URL après deux octets de répartition. Les 291 annonces illustrées du
 * 2026-09-17 s'y plient toutes, et rendent des adresses `media.apimo.pro`,
 * `photos.ubiflow.net`, `images.century21.fr`, `media.immo-facile.com`…
 * — exactement celles que les sources d'agence publient.
 *
 * Le préfixe de protocole est facultatif : quelques hôtes (`box.ics.fr`) sont
 * servis sans lui.
 */
const PARUVENDU_PROXY =
  /^https:\/\/img\.paruvendu\.fr\/media_ext\/(?:_(https?)_\/)?([^/]+)\/[0-9a-f]{2}\/[0-9a-f]{2}\/([A-Za-z0-9_-]+)_rct/;

/** Le texte porté par une base64 d'URL. */
function fromBase64Url(value: string): string {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * L'adresse du fichier chez l'agence, ou l'adresse reçue si elle n'enveloppe
 * rien de reconnaissable.
 */
export function photoOrigin(url: string): string {
  const wrapped = PARUVENDU_PROXY.exec(url);
  if (wrapped === null) return url;
  const [, scheme, host, encoded] = wrapped;
  if (host === undefined || encoded === undefined) return url;
  // Un décodage qui ne rend pas un chemin n'est pas une adresse : on garde
  // l'original plutôt que de fabriquer une clé qui ne désigne rien — base64
  // est tolérante, et rendrait des octets quelconques sans se plaindre.
  const path = fromBase64Url(encoded);
  if (!path.startsWith('/')) return url;
  return `${scheme ?? 'https'}://${host}${path}`;
}
