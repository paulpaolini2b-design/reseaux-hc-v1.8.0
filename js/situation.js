/* situation.js — plan de situation (v1.5.4, H-305).
 *
 * v1.7.6 (H-362) : tuile absente (404) laissée en blanc au lieu de faire échouer toute la carte ; inversion latitude /
 * longitude détectée ; messages d'erreur distincts réseau / service / point hors couverture.
 *
 * Carte « Plan IGN » (IGN Géoplateforme, service WMTS « découverte », gratuit et sans clé, Licence Ouverte Etalab)
 * centrée sur le point GPS de l'affaire, composée une fois à partir des tuiles 256 px du système Web Mercator (PM),
 * puis enregistrée comme une image libre (magasin `fonds`, voir images.js) : elle reste disponible hors ligne et sort
 * à l'export PDF / PNG comme toute image. Seules la création et le changement d'échelle demandent une connexion.
 *
 * L'objet est une image (`type: 'image'`) portant `situation { lat, lon, zoom, diametre_mm, source, date }` : taille,
 * rotation, opacité, rognage et calque sont ceux des images ; symboles.js ajoute le rond rouge (point GPS, au centre de
 * l'image entière) et le cadre. Le point GPS est au centre exact de l'image entière, quel que soit le rognage.
 */
import { CHARTE } from './charte.js';
import { analyserGps } from './descriptif.js';

const K = () => CHARTE.situation;

/* Coordonnées en pixels « monde » Web Mercator au niveau z (256 px par tuile). */
export function pixelsMonde(lat, lon, z) {
  const n = 256 * Math.pow(2, z);
  const phi = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n
  };
}

/* Tuiles nécessaires pour une fenêtre largeurPx × hauteurPx centrée sur (lat, lon) au niveau z. Module pur. */
export function tuilesFenetre(lat, lon, z, largeurPx, hauteurPx) {
  const c = pixelsMonde(lat, lon, z);
  const x0 = c.x - largeurPx / 2, y0 = c.y - hauteurPx / 2;
  const nb = Math.pow(2, z);
  const res = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + hauteurPx - 1) / 256); ty++) {
    if (ty < 0 || ty >= nb) continue;
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + largeurPx - 1) / 256); tx++) {
      const txn = ((tx % nb) + nb) % nb;
      res.push({ x: txn, y: ty, dx: Math.round(tx * 256 - x0), dy: Math.round(ty * 256 - y0) });
    }
  }
  return res;
}

export function urlTuile(z, x, y) {
  return K().url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

/* Mètres par pixel au niveau z à la latitude donnée (pour l'aide de la fiche). */
export function metresParPixel(lat, z) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
}

/* ---------- v1.6.0 §7 (H-318 à H-321) : échelle papier ---------- */

/* Niveau de tuiles pour une échelle 1/E à la latitude donnée : le plus petit niveau (≤ zoom_max) donnant au moins
 * `px_par_mm_min` pixels par mm papier. Retourne { zoom, pxParMm, atteint } — atteint = false si même le niveau maximal
 * n'y suffit pas (1/2 500 à 42° N : niveau 18 = 5,6 px/mm, H-319). */
export function niveauPourEchelle(lat, echelle) {
  const C = K();
  const pxParMm = (z) => echelle / (1000 * metresParPixel(lat, z));
  // v1.7.0 §8 (H-331) : jamais sous `zoom_min` (1/50 000 à 42° N : niveau 14, ≈ 7 px/mm — plancher sans effet aux échelles
  // de la liste ; garde-fou pour une échelle plus petite ou une latitude plus basse)
  for (let z = 0; z <= C.zoom_max; z++) if (pxParMm(z) >= C.px_par_mm_min) { const zz = Math.max(C.zoom_min, z); return { zoom: zz, pxParMm: pxParMm(zz), atteint: true }; }
  return { zoom: C.zoom_max, pxParMm: pxParMm(C.zoom_max), atteint: false };
}

/* Carte à télécharger pour un cadre de largeurMm × hauteurMm papier à l'échelle 1/E : niveau, dimensions en pixels
 * (emprise au sol = mm × E / 1000), dépassement du plafond `cote_max_px`. */
export function cartePourEchelle(lat, echelle, largeurMm, hauteurMm) {
  const n = niveauPourEchelle(lat, echelle);
  const mpp = metresParPixel(lat, n.zoom);
  const largeurPx = Math.max(1, Math.round((largeurMm * echelle) / 1000 / mpp));
  const hauteurPx = Math.max(1, Math.round((hauteurMm * echelle) / 1000 / mpp));
  return { ...n, largeurPx, hauteurPx, depasse: Math.max(largeurPx, hauteurPx) > K().cote_max_px };
}

/* Échelle de la liste à proposer quand la carte dépasse le plafond : la première échelle plus petite (dénominateur plus
 * grand) qui tient, sinon null (réduire alors la taille de la carte). */
export function echelleProposee(lat, echelle, largeurMm, hauteurMm) {
  for (const e of K().echelles) if (e > echelle && !cartePourEchelle(lat, e, largeurMm, hauteurMm).depasse) return e;
  return null;
}

/* Dénominateur de l'échelle RÉELLE d'un plan de situation, calculé à partir de ses dimensions effectives : largeur au
 * sol de l'image entière (pixels × m/px au niveau de la carte) rapportée à sa largeur papier. Rognage et rotation n'y
 * changent rien ; la poignée de taille, si. Null si l'objet ne permet pas le calcul. */
export function echelleReelle(o, MM = 72 / 25.4) {
  const st = o && o.situation;
  if (!st || !Number.isFinite(Number(st.lat)) || !Number.isFinite(Number(st.zoom)) || !(o.largeur > 0)) return null;
  const px = Number(st.largeur_px) > 0 ? Number(st.largeur_px) : K().largeur_px_v154;
  const solM = px * metresParPixel(Number(st.lat), Number(st.zoom));
  return (solM * 1000) / (o.largeur / MM);
}

/* « 1/5 000 » : séparateur des milliers insécable. */
export function formaterDenominateur(e) {
  return '1/' + String(Math.round(e)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

/* Texte de l'indication : valeur de la liste si l'écart est d'au plus `ecart_echelle_pct`, sinon « ≈ » arrondi à la dizaine. */
export function libelleEchelle(e) {
  const C = K();
  if (!(e > 0)) return '';
  const proche = C.echelles.find((x) => Math.abs(e - x) / x <= C.ecart_echelle_pct / 100);
  return C.indication.prefixe + (proche ? formaterDenominateur(proche) : '≈\u00A0' + formaterDenominateur(Math.round(e / 10) * 10));
}

/* Échelle de la liste correspondant à l'objet (écart ≤ 1 %), sinon null. */
export function echelleListe(o) {
  const e = echelleReelle(o);
  if (!e) return null;
  return K().echelles.find((x) => Math.abs(e - x) / x <= K().ecart_echelle_pct / 100) || null;
}

/* v1.7.6 (H-362) — couverture du Plan IGN. Emprise approchée de la France métropolitaine, Corse comprise (valeurs propres
 * à l'application, servant seulement à reconnaître une saisie « longitude, latitude » ; ce n'est pas l'emprise officielle
 * de la couche). */
const EMPRISE_METROPOLE = { lat_min: 41.2, lat_max: 51.2, lon_min: -5.3, lon_max: 9.8 };
const dansMetropole = (lat, lon) => lat >= EMPRISE_METROPOLE.lat_min && lat <= EMPRISE_METROPOLE.lat_max && lon >= EMPRISE_METROPOLE.lon_min && lon <= EMPRISE_METROPOLE.lon_max;

/* Vrai si le point est hors métropole mais y tombe une fois latitude et longitude échangées (saisie « 9.45, 42.69 »).
 * Un point DOM ou étranger saisi dans le bon ordre reste accepté. Module pur. */
export function inversionProbable(lat, lon) {
  return !dansMetropole(lat, lon) && dansMetropole(lon, lat);
}

/* Charge une tuile. Retourne une ImageBitmap, ou null si le service répond 404 (tuile absente de la pyramide : mer au
 * large, point hors couverture). Un 404 est d'abord redemandé une fois en contournant le cache HTTP du navigateur (un
 * 404 ancien peut y avoir été conservé). Lève une erreur typée pour les autres cas. Exportée pour les essais. */
export async function chargerTuile(url, signal) {
  let rep = await fetch(url, { mode: 'cors', signal, cache: 'default' });
  if (rep.status === 404) rep = await fetch(url, { mode: 'cors', signal, cache: 'reload' });
  if (rep.status === 404) return null;
  if (!rep.ok) { const e = new Error('HTTP ' + rep.status); e.code = 'http'; e.status = rep.status; e.url = url; throw e; }
  const blob = await rep.blob();
  if (!/^image\//.test(blob.type || 'image/')) { const e = new Error('réponse non image'); e.code = 'format'; e.url = url; throw e; }
  return await createImageBitmap(blob);
}

/* Message d'erreur selon la cause : seule une panne réseau ou un délai renvoie à la connexion. */
function messageErreur(e) {
  if (e && e.name === 'AbortError') return 'carte IGN : délai dépassé — vérifier la connexion';
  if (e && e.code === 'http') return 'service IGN en erreur (HTTP ' + e.status + ') — réessayer plus tard';
  if (e && e.code === 'format') return 'service IGN : réponse inattendue (pas une image) — réessayer plus tard';
  return 'carte IGN inaccessible (réseau : ' + ((e && e.message) || e) + ') — vérifier la connexion';
}

/* Compose la carte centrée sur le point GPS. Retourne { blob, largeurPx, hauteurPx, nom_fichier, mime, lat, lon, zoom,
 * tuiles_absentes }. Lève une erreur explicite hors connexion, si le point est manifestement inversé ou hors couverture,
 * ou si le service refuse. v1.6.0 : `dimensions` { largeurPx, hauteurPx } facultatif (carte calculée pour une échelle
 * papier) ; absent = 1200 × 900 comme en v1.5.4. v1.7.6 (H-362) : une tuile absente (404) est laissée en blanc. */
export async function genererCarteSituation(gps, zoom = null, dimensions = null) {
  const g = typeof gps === 'string' ? analyserGps(gps) : gps;
  if (!g) throw new Error('point GPS de l’affaire absent ou illisible (Informations de l’affaire)');
  if (inversionProbable(g.lat, g.lon)) throw new Error('point GPS « ' + g.lat + ', ' + g.lon + ' » : latitude et longitude semblent inversées — saisir la latitude en premier (ex. 42.69, 9.45) dans Informations de l’affaire');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('pas de connexion : la carte IGN se télécharge une fois, puis reste disponible hors ligne');
  const C = K();
  const z = Math.min(C.zoom_max, Math.max(dimensions ? 0 : C.zoom_min, Math.round(zoom ?? C.zoom_defaut)));
  const L = dimensions ? Math.round(dimensions.largeurPx) : C.largeur_px, H = dimensions ? Math.round(dimensions.hauteurPx) : C.hauteur_px;
  const tuiles = tuilesFenetre(g.lat, g.lon, z, L, H);
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), C.delai_ms);
  let images;
  try {
    images = await Promise.all(tuiles.map((t) => chargerTuile(urlTuile(z, t.x, t.y), ctrl.signal)));
  } catch (e) {
    ctrl.abort();
    if (e && e.url) console.warn('[situation] tuile en échec :', e.url);
    throw new Error(messageErreur(e));
  } finally { clearTimeout(minuterie); }
  const absentes = images.filter((im) => !im).length;
  if (absentes === images.length) {
    console.warn('[situation] aucune tuile au niveau ' + z + ' autour de', g.lat, g.lon, '— exemple :', urlTuile(z, tuiles[0].x, tuiles[0].y));
    throw new Error('aucune carte IGN au point « ' + g.lat + ', ' + g.lon + ' » (hors couverture du Plan IGN) — vérifier le point GPS de l’affaire');
  }
  const cv = document.createElement('canvas');
  cv.width = L; cv.height = H;
  const c2 = cv.getContext('2d', { alpha: false });
  c2.fillStyle = '#FFFFFF'; c2.fillRect(0, 0, L, H);
  tuiles.forEach((t, i) => { if (!images[i]) return; c2.drawImage(images[i], t.dx, t.dy, 256, 256); if (images[i].close) images[i].close(); });
  // Mention de source obligatoire (Licence Ouverte) : coin bas-droit, sur fond blanc
  const A = C.attribution;
  c2.font = `${A.taille_px}px sans-serif`;
  const lt = c2.measureText(A.texte).width;
  c2.fillStyle = 'rgba(255,255,255,0.85)';
  c2.fillRect(L - lt - 2 * A.marge_px, H - A.taille_px - 2 * A.marge_px, lt + 2 * A.marge_px, A.taille_px + 2 * A.marge_px);
  c2.fillStyle = '#333333'; c2.textBaseline = 'bottom';
  c2.fillText(A.texte, L - lt - A.marge_px, H - A.marge_px);
  const blob = await new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('encodage de la carte impossible'))), 'image/jpeg', C.qualite_jpeg));
  return { blob, largeurPx: L, hauteurPx: H, nom_fichier: 'Plan de situation (IGN)', mime: 'image/jpeg', lat: g.lat, lon: g.lon, zoom: z, tuiles_absentes: absentes };
}
