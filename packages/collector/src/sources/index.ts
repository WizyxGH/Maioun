/**
 * Déclaration des sources actives (§5).
 *
 * AJOUTER UNE SOURCE :
 *   1. créer `src/sources/<id>/parser.ts` et `src/sources/<id>/index.ts` ;
 *   2. ajouter une fixture dans `tests/fixtures/<id>/` et son test de parsing ;
 *   3. importer le scraper et l'ajouter au tableau ci-dessous.
 *
 * Rien d'autre n'est à modifier : le scheduler, la normalisation, le
 * dédoublonnage et le scoring découvrent la source par ce seul tableau (§47).
 *
 * Pour désactiver une source sans supprimer son code, passer `enabled: false`
 * dans son descripteur (§5, §76).
 */

import type { Scraper } from '@maioun/shared';
import { agenceDuCentreScraper } from './agence-du-centre/index.js';
import { agenceVictoireScraper } from './agence-victoire/index.js';
import { bepScraper } from './bep/index.js';
import { gilettaScraper } from './giletta/index.js';
import { bepAbonnesScraper } from './bep-abonnes/index.js';
import { century21Scraper } from './century21/index.js';
import { dazurScraper } from './dazur/index.js';
import { dgimmoScraper } from './dgimmo/index.js';
import { gestionCassiniScraper } from './gestion-cassini/index.js';
import { groupeFochScraper } from './groupe-foch/index.js';
import { fonciaScraper } from './foncia/index.js';
import { laforetScraper } from './laforet/index.js';
import { lamyScraper } from './lamy/index.js';
import { leprinceRealtyScraper } from './leprince-realty/index.js';
import { ltImmobilierScraper } from './lt-immobilier/index.js';
import { saintRochScraper } from './saint-roch/index.js';
import { mirabelloScraper } from './mirabello/index.js';
import { inliScraper } from './inli/index.js';
import { borneDelaunayScraper } from './borne-delaunay/index.js';
import { eraScraper } from './era/index.js';
import { fnaimScraper } from './fnaim/index.js';
import { cityaScraper } from './citya/index.js';
import { rentumoScraper } from './rentumo/index.js';
import { studapartScraper } from './studapart/index.js';
import { personalimmoScraper } from './personalimmo/index.js';
import { nousgeronsScraper } from './nousgerons/index.js';
import { maisonetteScraper } from './maisonette/index.js';
import { orpiScraper } from './orpi/index.js';
import { papScraper } from './pap/index.js';
import { emailAlertsScraper } from './email-alerts/index.js';
import { ladresseScraper } from './ladresse/index.js';
import { albertiScraper } from './alberti/index.js';
import { akorimmoScraper } from './akorimmo/index.js';
import { immoJbfScraper } from './immo-jbf/index.js';
import { immo3000Scraper } from './immo3000/index.js';
import { acropolisImmoScraper } from './acropolis-immo/index.js';
import { petrovaScraper } from './petrova/index.js';
import { tichadouScraper } from './tichadou/index.js';
import { aequalisScraper } from './aequalis/index.js';
import { squareHabitatScraper } from './square-habitat/index.js';
import { lesiteimmoScraper } from './lesiteimmo/index.js';
import { oreaScraper } from './orea/index.js';
import { votreAgenceImmoScraper } from './votre-agence-immo/index.js';
import { locserviceScraper } from './locservice/index.js';
import { bieniciScraper } from './bienici/index.js';
import { arthurimmoScraper } from './arthurimmo/index.js';
import { pujolScraper } from './pujol/index.js';
import { paruvenduScraper } from './paruvendu/index.js';
import { partnersImmoScraper } from './partners-immo/index.js';
import { agenceLongchampScraper } from './agence-longchamp/index.js';
import { cimiezBoulevardScraper } from './cimiez-boulevard/index.js';
import { climmoScraper } from './climmo/index.js';
import { palaisImmobilierScraper } from './palais-immobilier/index.js';
import { beaumontScraper } from './beaumont/index.js';
import { immoSudScraper } from './immo-sud/index.js';
import { winterScraper } from './winter/index.js';
import { lodgisScraper } from './lodgis/index.js';
import { saviEsteveScraper } from './savi-esteve/index.js';
import { ashleyParkerScraper } from './ashley-parker/index.js';
import { dinamyScraper } from './dinamy/index.js';
import { immobiliereNicoiseScraper } from './immobiliere-nicoise/index.js';
import { dragoScraper } from './drago/index.js';
import { privilegeScraper } from './privilege/index.js';
import { centragenceScraper } from './centragence/index.js';
import { iciImmobilierScraper } from './ici-immobilier/index.js';
import { afedimScraper } from './afedim/index.js';
import { roselandScraper } from './roseland/index.js';
import { sagImmobilierScraper } from './sag-immobilier/index.js';
import { agencePassyScraper } from './agence-passy/index.js';
import { libertyAgencyScraper } from './liberty-agency/index.js';
import { maisonQuatreScraper } from './maison-quatre/index.js';
import { murtaScraper } from './murta/index.js';
import { belgraviaScraper } from './belgravia/index.js';
import { deVitaScraper } from './de-vita/index.js';
import { coteVillageScraper } from './cote-village/index.js';
import { lbImmobilierScraper } from './lb-immobilier/index.js';
import { midemScraper } from './midem/index.js';
import { sudContactScraper } from './sud-contact/index.js';
import { aaGestionScraper } from './aa-gestion/index.js';
import { agenceAzureenneScraper } from './agence-azureenne/index.js';
import { englimmoScraper } from './englimmo/index.js';
import { sudAgenceScraper } from './sud-agence/index.js';
import { agirScraper } from './agir/index.js';
import { coprogestimmoScraper } from './coprogestimmo/index.js';
import { cabinetNardiScraper } from './cabinet-nardi/index.js';
import { rivieraConceptScraper } from './riviera-concept/index.js';
import { aurusScraper } from './aurus/index.js';
import { immoConsultCoteSudScraper } from './immo-consult-cote-sud/index.js';
import { immobilierePelouScraper } from './immobiliere-pelou/index.js';
import { agenceDesDomainesScraper } from './agence-des-domaines/index.js';
import { massenaImmoScraper } from './massena-immo/index.js';
import { phtRealEstateScraper } from './pht-real-estate/index.js';
import { vizcayaScraper } from './vizcaya/index.js';
import { reutterInvestScraper } from './reutter-invest/index.js';
import { allianceConseilScraper } from './alliance-conseil/index.js';
import { cabinetVenturaScraper } from './cabinet-ventura/index.js';
import { immobilier2niceScraper } from './immobilier2nice/index.js';
import { fdsCarreDorScraper } from './fds-carre-dor/index.js';
import { reussiteImmoScraper } from './reussite-immo/index.js';
import { josephGarnierScraper } from './joseph-garnier/index.js';
import { marceleScraper } from './marcele/index.js';
import { sambroniScraper } from './sambroni/index.js';
import { homePearlScraper } from './home-pearl/index.js';
import { fiveStarsScraper } from './five-stars/index.js';
import { agenceGounodScraper } from './agence-gounod/index.js';
import { bomarcheScraper } from './bomarche/index.js';
import { provencalpesScraper } from './provencalpes/index.js';
import { fitImmobilierScraper } from './fit-immobilier/index.js';
import { agenceRivieraScraper } from './agence-riviera/index.js';
import { difimmoScraper } from './difimmo/index.js';
import { laConcaDorScraper } from './la-conca-dor/index.js';
import { etudeLotteScraper } from './etude-lotte/index.js';
import { nicePremiumScraper } from './nice-premium/index.js';
import { victorHugoScraper } from './victor-hugo/index.js';
import { laFirmeScraper } from './la-firme/index.js';
import { angImmobilierScraper } from './ang-immobilier/index.js';
import { cabinetReynierScraper } from './cabinet-reynier/index.js';
import { groupePicadoScraper } from './groupe-picado/index.js';
import { cabinetCordierScraper } from './cabinet-cordier/index.js';
import { agentNicoisScraper } from './agent-nicois/index.js';
import { optimmoScraper } from './optimmo/index.js';
import { amConceptScraper } from './am-concept/index.js';
import { luminaScraper } from './lumina/index.js';
import { lienhardScraper } from './lienhard/index.js';
import { igtiScraper } from './igti/index.js';
import { mediterraneeImmoScraper } from './mediterranee-immo/index.js';
import { lapierreScraper } from './lapierre/index.js';
import { postillonScraper } from './postillon/index.js';
import { groupeMarshallScraper } from './groupe-marshall/index.js';
import { bereniceScraper } from './berenice/index.js';
import { contessoScraper } from './contesso/index.js';
import { carlettaScraper } from './carletta/index.js';
import { crouzetBreilScraper } from './crouzet-breil/index.js';
import { mkImmoScraper } from './mk-immo/index.js';
import { griguerScraper } from './griguer/index.js';
import { conceptPatrimoineScraper } from './concept-patrimoine/index.js';
import { procivisScraper } from './procivis/index.js';
import { kaperaScraper } from './kapera/index.js';
import { safiScraper } from './safi/index.js';
import { ferreroScraper } from './ferrero/index.js';
import { cabinetLedeuxScraper } from './cabinet-ledeux/index.js';
import { residImmoScraper } from './resid-immo/index.js';
import { gestionCasaImmoScraper } from './gestion-casa-immo/index.js';
import { laChouetteScraper } from './la-chouette/index.js';
import { lagenceJeanJauresScraper } from './lagence-jean-jaures/index.js';
import { marroImmobilierScraper } from './marro-immobilier/index.js';
import { immo3PointsScraper } from './immo-3-points/index.js';
import { rivieraAngelsScraper } from './riviera-angels/index.js';
import { gestymoScraper } from './gestymo/index.js';
import { azurConseilSalmonScraper } from './azur-conseil-salmon/index.js';
import { laClefImmobiliereScraper } from './la-clef-immobiliere/index.js';
import { apiNiceScraper } from './api-nice/index.js';
import { phoenixGlvScraper } from './phoenix-glv/index.js';
import { deltaPromotionScraper } from './delta-promotion/index.js';
import { platineImmobilierScraper } from './platine-immobilier/index.js';
import { westimmoScraper } from './westimmo/index.js';
import { blueResidencesScraper } from './blue-residences/index.js';
import { laPerouseScraper } from './la-perouse/index.js';
import { isitImmobilierScraper } from './isit-immobilier/index.js';
import { ericImmoScraper } from './eric-immo/index.js';
import { etudeDesVosgesScraper } from './etude-des-vosges/index.js';
import { valroseImmobilierScraper } from './valrose-immobilier/index.js';
import { aparteImmobilierScraper } from './aparte-immobilier/index.js';
import { abylaBosseScraper } from './abyla-bosse/index.js';
import { cabinetCentralGestionScraper } from './cabinet-central-gestion/index.js';
import { transactimoScraper } from './transactimo/index.js';
import { homeOnRivieraScraper } from './home-on-riviera/index.js';
import { laPetiteMaisonScraper } from './la-petite-maison/index.js';
import { maisonKScraper } from './maison-k/index.js';
import { toscaNiceLePortScraper } from './tosca-nice-le-port/index.js';
import { acetimoScraper } from './acetimo/index.js';
import { agence5PromenadeScraper } from './agence-5-promenade/index.js';
import { cegestimScraper } from './cegestim/index.js';
import { immobiliereCamoScraper } from './immobiliere-camo/index.js';
import { kallisteImmoConseilScraper } from './kalliste-immo-conseil/index.js';
import { milorImmobilierScraper } from './milor-immobilier/index.js';
import { cabinetEuropazurScraper } from './cabinet-europazur/index.js';
import { noraitScraper } from './norait/index.js';
import { coccimmoScraper } from './coccimmo/index.js';
import { immoIdealScraper } from './immo-ideal/index.js';
import { sunImmobiliaScraper } from './sun-immobilia/index.js';
import { frenchRivieraStudiosScraper } from './french-riviera-studios/index.js';
import { parnasseImmobilierScraper } from './parnasse-immobilier/index.js';
import { laFrancoSuisseScraper } from './la-franco-suisse/index.js';
import { mossImmobilierScraper } from './moss-immobilier/index.js';
import { marchalImmobilierScraper } from './marchal-immobilier/index.js';
import { barberaGestionScraper } from './barbera-gestion/index.js';
import { azurimmoScraper } from './azurimmo/index.js';
import { richerImmobilierScraper } from './richer-immobilier/index.js';
import { grandMetropoleScraper } from './grand-metropole/index.js';
import { elitimoScraper } from './elitimo/index.js';
import { agenceCalifornieScraper } from './agence-californie/index.js';
import { forimmoScraper } from './forimmo/index.js';
import { nestennNicePortScraper } from './nestenn-nice-port/index.js';
import { orientationImmobiliereScraper } from './orientation-immobiliere/index.js';
import { imodirectScraper } from './imodirect/index.js';
import { altareaNiceScraper } from './altarea-nice/index.js';
import { agenceDuPortScraper } from './agence-du-port/index.js';
import { miramarScraper } from './miramar/index.js';
import { loquisScraper } from './loquis/index.js';
import { coteDazurPropertiesScraper } from './cote-dazur-properties/index.js';
import { cdsGestionScraper } from './cds-gestion/index.js';
import { agenceCastelScraper } from './agence-castel/index.js';
import { cdcImmobilierScraper } from './cdc-immobilier/index.js';
import { nicolasPisaniScraper } from './nicolas-pisani/index.js';
import { domiNiceImmobilierScraper } from './domi-nice-immobilier/index.js';
import { figaroImmoScraper } from './figaro-immo/index.js';
import { bbiiScraper } from './bbii/index.js';
import { agenceDumasScraper } from './agence-dumas/index.js';
import { capSudImmobilierScraper } from './cap-sud-immobilier/index.js';
import { oneTwoThreeLogerScraper } from './123loger/index.js';
import { solissimmoScraper } from './solissimmo/index.js';
import { johnTaylorScraper } from './john-taylor/index.js';
import { barnesScraper } from './barnes/index.js';
import { guyHoquetScraper } from './guy-hoquet/index.js';
import { kellerWilliamsScraper } from './keller-williams/index.js';
import { rivieraSudImmobilierScraper } from './riviera-sud-immobilier/index.js';
import { immoRivieraTransactionsScraper } from './immo-riviera-transactions/index.js';
import { oqoroScraper } from './oqoro/index.js';
import { cotOuestScraper } from './cot-ouest/index.js';
import { immojeuneScraper } from './immojeune/index.js';
import { morningcroissantScraper } from './morningcroissant/index.js';
import { appartagerScraper } from './appartager/index.js';

/**
 * Nom lisible de chaque source, par identifiant — dérivé des descripteurs pour
 * qu'il n'existe qu'une seule vérité (ajouter une source suffit). Sert à
 * afficher la provenance d'une annonce (notifications, interface).
 */
export function sourceDisplayNames(): ReadonlyMap<string, string> {
  return new Map(ALL_SCRAPERS.map((s) => [s.descriptor.id, s.descriptor.name]));
}

export const ALL_SCRAPERS: readonly Scraper[] = [
  laforetScraper,
  orpiScraper,
  bepScraper,
  papScraper,
  fonciaScraper,
  century21Scraper,
  nousgeronsScraper,
  maisonetteScraper,
  oneTwoThreeLogerScraper,
  dazurScraper,
  gestionCassiniScraper,
  bepAbonnesScraper,
  lamyScraper,
  agenceVictoireScraper,
  groupeFochScraper,
  personalimmoScraper,
  leprinceRealtyScraper,
  dgimmoScraper,
  gilettaScraper,
  ltImmobilierScraper,
  agenceDuCentreScraper,
  saintRochScraper,
  mirabelloScraper,
  inliScraper,
  borneDelaunayScraper,
  eraScraper,
  fnaimScraper,
  cityaScraper,
  rentumoScraper,
  studapartScraper,
  emailAlertsScraper,
  ladresseScraper,
  albertiScraper,
  akorimmoScraper,
  immoJbfScraper,
  immo3000Scraper,
  acropolisImmoScraper,
  petrovaScraper,
  tichadouScraper,
  aequalisScraper,
  squareHabitatScraper,
  lesiteimmoScraper,
  oreaScraper,
  votreAgenceImmoScraper,
  locserviceScraper,
  bieniciScraper,
  arthurimmoScraper,
  pujolScraper,
  paruvenduScraper,
  partnersImmoScraper,
  agenceLongchampScraper,
  cimiezBoulevardScraper,
  climmoScraper,
  palaisImmobilierScraper,
  beaumontScraper,
  immoSudScraper,
  winterScraper,
  privilegeScraper,
  centragenceScraper,
  iciImmobilierScraper,
  lodgisScraper,
  saviEsteveScraper,
  ashleyParkerScraper,
  dinamyScraper,
  immobiliereNicoiseScraper,
  dragoScraper,
  afedimScraper,
  roselandScraper,
  sagImmobilierScraper,
  agencePassyScraper,
  libertyAgencyScraper,
  maisonQuatreScraper,
  murtaScraper,
  belgraviaScraper,
  deVitaScraper,
  coteVillageScraper,
  lbImmobilierScraper,
  midemScraper,
  sudContactScraper,
  aaGestionScraper,
  agenceAzureenneScraper,
  englimmoScraper,
  sudAgenceScraper,
  agirScraper,
  coprogestimmoScraper,
  cabinetNardiScraper,
  rivieraConceptScraper,
  aurusScraper,
  immoConsultCoteSudScraper,
  immobilierePelouScraper,
  agenceDesDomainesScraper,
  massenaImmoScraper,
  phtRealEstateScraper,
  vizcayaScraper,
  reutterInvestScraper,
  allianceConseilScraper,
  cabinetVenturaScraper,
  immobilier2niceScraper,
  fdsCarreDorScraper,
  reussiteImmoScraper,
  josephGarnierScraper,
  marceleScraper,
  sambroniScraper,
  homePearlScraper,
  fiveStarsScraper,
  agenceGounodScraper,
  bomarcheScraper,
  provencalpesScraper,
  fitImmobilierScraper,
  agenceRivieraScraper,
  difimmoScraper,
  laConcaDorScraper,
  etudeLotteScraper,
  nicePremiumScraper,
  victorHugoScraper,
  laFirmeScraper,
  angImmobilierScraper,
  cabinetReynierScraper,
  groupePicadoScraper,
  cabinetCordierScraper,
  agentNicoisScraper,
  optimmoScraper,
  amConceptScraper,
  luminaScraper,
  lienhardScraper,
  igtiScraper,
  mediterraneeImmoScraper,
  lapierreScraper,
  postillonScraper,
  groupeMarshallScraper,
  bereniceScraper,
  contessoScraper,
  carlettaScraper,
  crouzetBreilScraper,
  mkImmoScraper,
  griguerScraper,
  conceptPatrimoineScraper,
  procivisScraper,
  kaperaScraper,
  safiScraper,
  ferreroScraper,
  cabinetLedeuxScraper,
  residImmoScraper,
  gestionCasaImmoScraper,
  laChouetteScraper,
  lagenceJeanJauresScraper,
  marroImmobilierScraper,
  immo3PointsScraper,
  rivieraAngelsScraper,
  gestymoScraper,
  azurConseilSalmonScraper,
  laClefImmobiliereScraper,
  apiNiceScraper,
  phoenixGlvScraper,
  deltaPromotionScraper,
  platineImmobilierScraper,
  westimmoScraper,
  blueResidencesScraper,
  laPerouseScraper,
  isitImmobilierScraper,
  ericImmoScraper,
  etudeDesVosgesScraper,
  valroseImmobilierScraper,
  aparteImmobilierScraper,
  abylaBosseScraper,
  cabinetCentralGestionScraper,
  transactimoScraper,
  homeOnRivieraScraper,
  laPetiteMaisonScraper,
  maisonKScraper,
  toscaNiceLePortScraper,
  acetimoScraper,
  agence5PromenadeScraper,
  cegestimScraper,
  immobiliereCamoScraper,
  kallisteImmoConseilScraper,
  milorImmobilierScraper,
  cabinetEuropazurScraper,
  noraitScraper,
  coccimmoScraper,
  immoIdealScraper,
  sunImmobiliaScraper,
  frenchRivieraStudiosScraper,
  parnasseImmobilierScraper,
  laFrancoSuisseScraper,
  mossImmobilierScraper,
  marchalImmobilierScraper,
  barberaGestionScraper,
  azurimmoScraper,
  richerImmobilierScraper,
  grandMetropoleScraper,
  elitimoScraper,
  agenceCalifornieScraper,
  forimmoScraper,
  nestennNicePortScraper,
  orientationImmobiliereScraper,
  imodirectScraper,
  altareaNiceScraper,
  agenceDuPortScraper,
  miramarScraper,
  loquisScraper,
  coteDazurPropertiesScraper,
  cdsGestionScraper,
  agenceCastelScraper,
  cdcImmobilierScraper,
  nicolasPisaniScraper,
  domiNiceImmobilierScraper,
  figaroImmoScraper,
  bbiiScraper,
  agenceDumasScraper,
  capSudImmobilierScraper,
  solissimmoScraper,
  johnTaylorScraper,
  barnesScraper,
  guyHoquetScraper,
  kellerWilliamsScraper,
  rivieraSudImmobilierScraper,
  immoRivieraTransactionsScraper,
  oqoroScraper,
  cotOuestScraper,
  morningcroissantScraper,
  appartagerScraper,
  immojeuneScraper,
];

// Laforêt sert de source de référence aux tests d'intégration, qui passent par
// `@maioun/collector`. Les autres scrapers n'entrent que par `ALL_SCRAPERS`.
export { laforetScraper } from './laforet/index.js';
