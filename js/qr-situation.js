/* qr-situation.js — v1.7.7 (H-363 à H-366) : QR code du point GPS sur le plan de situation.
 *
 * Module pur (aucun DOM) : réglage, matrice (mise en cache), géométrie, primitives locales, alertes de la fiche.
 * Génération hors ligne par la bibliothèque embarquée `qrcode-generator` (Kazuhiko Arase, licence MIT, version 2.0.4
 * figée, vendor/qrcode-generator/). Contenu encodé : lienGoogleMaps({ lat, lon }) des coordonnées de la CARTE (centre
 * de l'image entière = rond rouge), jamais le point GPS de l'affaire (qui peut avoir changé sans retéléchargement).
 *
 * Réglage facultatif `situation.qr = { visible, coin: 'haut_droit' | 'haut_gauche', cote_mm }` ; absent = aucun QR
 * (rendu strictement celui de la v1.7.6). `cote_mm` = côté total du carré blanc, zone de silence comprise.
 */
import qrcode from '../vendor/qrcode-generator/qrcode.mjs';
import { CHARTE, MM } from './charte.js';
import { lienGoogleMaps } from './descriptif.js';
import { rectangleVisibleDe } from './forme-calcul.js';
import { rect } from './primitives.js';

const Q = () => CHARTE.situation.qr;
export const COINS_QR = ['haut_droit', 'haut_gauche'];

/* ---------- Matrice (cache mémoire URL → matrice) ---------- */
const cacheMatrices = new Map();
const TAILLE_CACHE = 32;
let calculs = 0;
/* Nombre de matrices réellement calculées depuis le chargement (essais : contrôle du cache). */
export function nombreCalculsQr() { return calculs; }
export function viderCacheQr() { cacheMatrices.clear(); }

/* Matrice QR de `url` au niveau de correction de la charte, version la plus petite (type 0 = automatique).
 * Retourne { url, version, n (modules sans la zone de silence), sombre: boolean[n][n] }. */
export function matriceQr(url) {
  const cle = String(url);
  const connue = cacheMatrices.get(cle);
  if (connue) return connue;
  const q = qrcode(0, Q().niveau);
  q.addData(cle, 'Byte');
  q.make();
  const n = q.getModuleCount();
  const sombre = [];
  for (let r = 0; r < n; r++) {
    const ligne = new Array(n);
    for (let c = 0; c < n; c++) ligne[c] = !!q.isDark(r, c);
    sombre.push(ligne);
  }
  const m = { url: cle, version: (n - 17) / 4, n, sombre };
  calculs++;
  if (cacheMatrices.size >= TAILLE_CACHE) cacheMatrices.delete(cacheMatrices.keys().next().value);
  cacheMatrices.set(cle, m);
  return m;
}

/* ---------- Réglage ---------- */
export function qrParDefaut() {
  return { visible: true, coin: Q().coin_defaut, cote_mm: Q().cote_mm };
}

function borneCote(v) {
  const K = Q();
  const n = Number(v);
  return Math.min(K.cote_max_mm, Math.max(K.cote_min_mm, Number.isFinite(n) ? n : K.cote_mm));
}

/* Réglage relu dans les bornes ; null si absent (aucun QR, projet antérieur). */
export function reglageQr(o) {
  const q = o && o.situation && o.situation.qr;
  if (!q || typeof q !== 'object') return null;
  return { visible: q.visible === true, coin: q.coin === 'haut_gauche' ? 'haut_gauche' : 'haut_droit', cote_mm: borneCote(q.cote_mm) };
}

/* Lien encodé : point de la carte (rond rouge). '' si les coordonnées manquent. */
export function urlQrSituation(o) {
  const st = o && o.situation;
  if (!st) return '';
  return lienGoogleMaps({ lat: Number(st.lat), lon: Number(st.lon) });
}

/* Modification d'un réglage depuis la fiche (la fiche appelle ensuite valider() : annulable par Ctrl+Z).
 * champ : 'visible' (booléen) | 'coin' | 'cote_mm'. Un plan sans `qr` reçoit le réglage par défaut à la première
 * modification. Retourne true si le réglage a changé. */
export function appliquerReglageQr(o, champ, valeur) {
  if (!o || !o.situation) return false;
  const avant = JSON.stringify(o.situation.qr ?? null);
  const q = { ...qrParDefaut(), ...(reglageQr(o) || {}) };
  if (!o.situation.qr) q.visible = false;   // plan antérieur : seule la case l'affiche
  if (champ === 'visible') q.visible = !!valeur;
  else if (champ === 'coin') q.coin = valeur === 'haut_gauche' ? 'haut_gauche' : 'haut_droit';
  else if (champ === 'cote_mm') {
    const v = Number(String(valeur ?? '').replace(',', '.'));
    if (!Number.isFinite(v)) return false;
    q.cote_mm = borneCote(Math.round(v));
  } else return false;
  if (JSON.stringify(q) === avant) return false;
  o.situation.qr = q;
  return true;
}

/* ---------- Géométrie ---------- */
function rayonRond(o) {
  const R = CHARTE.situation.rond;
  const d = Number(o.situation && o.situation.diametre_mm);
  const dm = Math.min(R.diametre_max_mm, Math.max(R.diametre_min_mm, Number.isFinite(d) ? d : R.diametre_mm));
  return (dm * MM) / 2;
}

/* Géométrie du QR dans le repère LOCAL du rectangle visible (origine au centre, axes de l'objet avant rotation), ou
 * null si rien à dessiner. { url, matrice, modulesTotal, cote, module, x0, y0 (coin haut-gauche du carré blanc), v } */
export function geometrieQrSituation(o) {
  const r = reglageQr(o);
  if (!r || !r.visible) return null;
  const url = urlQrSituation(o);
  if (!url) return null;
  const K = Q();
  const matrice = matriceQr(url);
  const modulesTotal = matrice.n + 2 * K.silence_modules;
  const cote = r.cote_mm * MM;
  const module = cote / modulesTotal;
  const v = rectangleVisibleDe(o.x, o.y, o.largeur || 0, o.hauteur || 0, o.rotation || 0, o.recadrage);
  const m = K.marge_mm * MM;
  const x0 = r.coin === 'haut_gauche' ? -v.l / 2 + m : v.l / 2 - m - cote;
  const y0 = -v.h / 2 + m;
  return { url, matrice, modulesTotal, cote, module, x0, y0, v, coin: r.coin, cote_mm: r.cote_mm };
}

/* Primitives locales : fond blanc opaque sur tout le carré (zone de silence comprise), puis un rectangle plein par
 * suite de modules noirs contigus d'une même ligne (sans contour). */
export function primitivesQrLocales(g) {
  if (!g) return [];
  const K = Q();
  const prims = [rect(g.x0, g.y0, g.cote, g.cote, { couleur: null, epaisseur: 0, remplissage: K.fond })];
  const { n, sombre } = g.matrice;
  const s = K.silence_modules, u = g.module;
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!sombre[r][c]) { c++; continue; }
      const debut = c;
      while (c < n && sombre[r][c]) c++;
      prims.push(rect(g.x0 + (s + debut) * u, g.y0 + (s + r) * u, (c - debut) * u, u, { couleur: null, epaisseur: 0, remplissage: K.module }));
    }
  }
  return prims;
}

/* Alertes de la fiche (sans blocage) : QR hors du cadre visible, recouvrement du rond rouge, module trop petit.
 * Retourne { debordement, recouvrement, modulePetit, module_mm, version, messages[] } ou null si aucun QR affiché. */
export function alertesQrSituation(o) {
  const g = geometrieQrSituation(o);
  if (!g) return null;
  const K = Q();
  const eps = 1e-6;
  const v = g.v;
  const debordement = g.x0 < -v.l / 2 - eps || g.x0 + g.cote > v.l / 2 + eps || g.y0 + g.cote > v.h / 2 + eps;
  // Centre du rond rouge dans le repère local du rectangle visible
  const a = (-(o.rotation || 0) * Math.PI) / 180;
  const dx = o.x - v.cx, dy = o.y - v.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  const rr = rayonRond(o) + (CHARTE.situation.rond.epaisseur_mm * MM) / 2;
  const px = Math.min(g.x0 + g.cote, Math.max(g.x0, lx)), py = Math.min(g.y0 + g.cote, Math.max(g.y0, ly));
  const recouvrement = Math.hypot(lx - px, ly - py) < rr - eps;
  const module_mm = g.cote_mm / g.modulesTotal;
  const modulePetit = module_mm < K.module_min_mm - eps;
  const f = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');
  const messages = [];
  if (debordement) messages.push('Le QR code déborde du cadre visible de la carte : réduire son côté ou agrandir la carte.');
  if (recouvrement) messages.push('Le QR code recouvre le rond rouge du point GPS : changer de coin ou réduire son côté.');
  if (modulePetit) messages.push(`Module de ${f(module_mm)} mm (moins de ${f(K.module_min_mm, 1)} mm) : lecture incertaine au téléphone, augmenter le côté.`);
  return { debordement, recouvrement, modulePetit, module_mm, version: g.matrice.version, messages };
}
