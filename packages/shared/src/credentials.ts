/**
 * Chiffrement des identifiants d'une source PAYÉE, à titre personnel (§6, §26).
 *
 * POURQUOI ON EN STOCKE, ALORS QU'ON REFUSE LES MOTS DE PASSE DE MESSAGERIE.
 * Le §26 écarte le mot de passe d'une boîte mail, et il a raison : une boîte
 * contient toute la correspondance de quelqu'un, et rien de ce que nous
 * faisons ne justifie d'y accéder — d'où le transfert d'alertes, qui ne
 * demande aucun identifiant.
 *
 * Un abonnement à un bulletin d'annonces n'est pas cela. Il ouvre une liste de
 * biens à louer, rien d'autre ; son propriétaire le paie pour la lire, et la
 * seule façon de la lire est de s'y connecter. Il n'existe ni OAuth ni
 * transfert pour ce genre de service. Le choix est donc : stocker cet
 * identifiant-là, ou renoncer à ce que chacun se serve de l'abonnement qu'il
 * paie — ce qui revient à réserver la source à qui tient le `.env`.
 *
 * CE QUE CELA IMPOSE EN RETOUR, et qui n'est pas négociable :
 *
 *   1. le secret est CHIFFRÉ au repos, jamais en clair dans une colonne ;
 *   2. il ne REVIENT JAMAIS au navigateur — l'écran dit « configuré » ou
 *      « non configuré », et propose de remplacer, jamais de relire ;
 *   3. la clé n'est ni dans le dépôt ni dans la base : c'est un secret de
 *      plateforme, partagé par le Worker qui écrit et le collecteur qui lit.
 *
 * AES-GCM, ET NON UN SIMPLE XOR OU UN ENCODAGE. GCM authentifie en plus de
 * chiffrer : un octet modifié en base fait échouer le déchiffrement au lieu de
 * rendre une chaîne fausse dont on ne saurait rien. `crypto.subtle` existe
 * aussi bien dans un Worker que dans Node : ce fichier n'importe rien de Node,
 * et ne doit jamais le faire.
 */

/** Longueur du vecteur d'initialisation recommandée pour AES-GCM. */
const IV_BYTES = 12;

/**
 * Dérive la clé AES à partir du secret de plateforme.
 *
 * Un SHA-256 du secret : il accepte un secret de longueur quelconque et rend
 * les 256 bits qu'AES attend. Ce n'est pas une dérivation lente à la PBKDF2 —
 * inutile ici, le secret n'étant pas un mot de passe humain devinable mais une
 * valeur tirée au hasard.
 */
// Le type de la clé est INFÉRÉ : `CryptoKey` n’existe pas dans la bibliothèque
// de types de ce paquet, qui ne suppose ni navigateur ni Node.
async function keyFrom(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Chiffre un secret. Le vecteur d'initialisation VOYAGE AVEC lui, en tête : il
 * n'est pas secret, et le ranger à part demanderait une seconde colonne que
 * personne ne penserait à recopier lors d'une sauvegarde.
 */
export async function encryptSecret(plain: string, key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await keyFrom(key),
    new TextEncoder().encode(plain),
  );
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return toBase64(packed);
}

/**
 * Déchiffre, ou rend `null`.
 *
 * `null` COUVRE TOUT CE QUI PEUT ALLER MAL — clé changée, valeur tronquée,
 * ligne écrite par une autre installation. L'appelant se comporte alors comme
 * si rien n'était configuré, ce qui est la seule conduite honnête : un
 * identifiant qu'on ne sait plus lire n'est pas un identifiant (§17).
 */
export async function decryptSecret(packed: string, key: string): Promise<string | null> {
  try {
    const bytes = fromBase64(packed);
    if (bytes.length <= IV_BYTES) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES) },
      await keyFrom(key),
      bytes.slice(IV_BYTES),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
