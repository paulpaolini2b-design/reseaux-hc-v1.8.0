/* reportage-rendu.js — v1.8.0 (H-373, H-374) : géométrie et primitives des blocs ouvrage d'une vignette de reportage.
 *
 * Une vignette est une image libre (`type: 'image'`) portant `reportage` (reportage.js). Ses blocs sont dessinés SOUS la
 * partie visible de la photo, axe horizontal (la rotation de la photo ne tourne pas les blocs), centrés sur la photo,
 * sur la largeur `reportage.largeur_blocs`. Gabarit de la légende SIEEP-HC :
 *
 *   [repère] [ bandeau d'état / équipement ]
 *   [ description, une ligne par élément     ]
 *
 * Module pur (aucun DOM) : mêmes primitives à l'écran, au PDF et au PNG. Valeurs de mise en page : CHARTE.reportage.bloc
 * (NON NORMATIVES). */
import { CHARTE, MM } from './charte.js';
import { ligne, rect, texte, mesurerTexte } from './primitives.js';
import { rectangleVisible, coinsRectangleTourne } from './forme-calcul.js';

const R = () => CHARTE.reportage;

/* Coupe un texte en lignes tenant dans `largeur` (mots entiers ; un mot trop long reste seul sur sa ligne). */
export function couperLignes(t, taille, largeur, style = null) {
  const res = [];
  for (const para of String(t ?? '').split('\n')) {
    const mots = para.split(/\s+/).filter(Boolean);
    if (!mots.length) { res.push(''); continue; }
    let cur = mots[0];
    for (let i = 1; i < mots.length; i++) {
      const essai = cur + ' ' + mots[i];
      if (mesurerTexte(essai, taille, style) <= largeur) cur = essai;
      else { res.push(cur); cur = mots[i]; }
    }
    res.push(cur);
  }
  return res;
}

/* Rectangle englobant (axes du plan) de la partie visible de la photo, rotation comprise. */
export function boitePhoto(o) {
  const v = rectangleVisible(o);
  const c = coinsRectangleTourne(v.cx, v.cy, v.l, v.h, o.rotation || 0);
  const xs = c.map((p) => p.x), ys = c.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), l: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), cx: v.cx, cy: v.cy };
}

/* Texte affiché d'une ligne de bloc. */
function texteLigne(l) { return l && !l.supprimee ? String(l.texte ?? '') : null; }

/* Mise en page d'un bloc à l'échelle `e`, largeur `W` (unités plan), origine (x0, y0). Retourne { prims, h }. */
function disposerBloc(b, x0, y0, W, e) {
  const K = R().bloc;
  const s = (mm) => mm * MM * e;
  const prims = [];
  const trait = K.trait_mm * MM;
  const couleur = K.couleur;
  const etat = R().etats_bloc.includes(b.etat) ? b.etat : 'existant';
  const aspect = R().aspect_bandeau[etat] || R().aspect_bandeau.existant;
  const rs = s(K.repere_mm), gap = s(K.ecart_mm), m = s(K.marge_mm);
  const tb = s(K.taille_bandeau_mm), te = s(K.taille_equipement_mm), td = s(K.taille_description_mm), trp = s(K.taille_repere_mm);
  const il = K.interligne;
  const hw = Math.max(W - rs - gap, rs);
  const bandeau = R().bandeaux[etat] || '';
  const lignesEq = couperLignes(b.equipement || '', te, hw - 2 * m);
  const hb = tb * 1.7;                                        // hauteur du bandeau d'état
  const h1 = Math.max(rs, hb + m + lignesEq.length * te * il + m);
  // Case repère : cadre plein (à poser, à remplacer), discontinu (existant), barré (à déposer)
  const optRep = { couleur, epaisseur: trait, remplissage: '#FFFFFF' };
  if (etat === 'existant') optRep.tirete = K.tirete_existant_mm.map((v) => v * MM);
  prims.push(rect(x0, y0, rs, h1, optRep));
  if (etat === 'a_deposer') prims.push(ligne(x0, y0 + h1, x0 + rs, y0, K.gris_depose, trait * 2, { extremite: 'nette' }));
  const rep = String(b.repere || '');
  if (rep) {
    let t = trp;
    const lmax = rs - 2 * m;
    const lr = mesurerTexte(rep, t, { gras: true });
    if (lr > lmax && lr > 0) t = t * (lmax / lr);
    prims.push(texte(x0 + rs / 2, y0 + h1 / 2 + t * 0.36, rep, { taille: t, couleur, ancre: 'milieu', gras: true }));
  }
  // Case équipement : bandeau d'état en tête, puis l'équipement centré
  const xe = x0 + rs + gap;
  prims.push(rect(xe, y0, hw, h1, { couleur, epaisseur: trait, remplissage: '#FFFFFF' }));
  if (aspect.fond) prims.push(rect(xe, y0, hw, hb, { couleur: null, epaisseur: 0, remplissage: aspect.fond }));
  else prims.push(ligne(xe, y0 + hb, xe + hw, y0 + hb, couleur, trait / 2, { extremite: 'nette' }));
  if (bandeau) prims.push(texte(xe + hw / 2, y0 + hb / 2 + tb * 0.36, bandeau, { taille: tb, couleur: aspect.texte, ancre: 'milieu', gras: true }));
  const yeq = y0 + hb + m + (h1 - hb - 2 * m - lignesEq.length * te * il) / 2;
  lignesEq.forEach((l, i) => prims.push(texte(xe + hw / 2, yeq + te * il * i + te * 0.95, l, { taille: te, couleur, ancre: 'milieu' })));
  // Description : une ligne par élément, coupée à la largeur du bloc
  const desc = [];
  for (const l of b.lignes || []) {
    const t = texteLigne(l);
    if (t === null || !t.trim()) continue;
    desc.push(...couperLignes(t, td, W - 2 * m));
  }
  let h = h1;
  if (desc.length) {
    const y2 = y0 + h1 + gap / 2;
    const h2 = 2 * m + desc.length * td * il;
    prims.push(rect(x0, y2, W, h2, { couleur, epaisseur: trait, remplissage: '#FFFFFF' }));
    desc.forEach((l, i) => prims.push(texte(x0 + m, y2 + m + td * il * i + td * 0.95, l, { taille: td, couleur, ancre: 'debut' })));
    h = h1 + gap / 2 + h2;
  }
  return { prims, h };
}

/* Blocs d'une vignette à l'échelle `e` (défaut : celle de la vignette). Retourne { prims, boite, hauteur }. */
export function disposerBlocsVignette(o, e = null) {
  const rp = o && o.reportage;
  if (!rp) return { prims: [], boite: null, hauteur: 0 };
  const ech = e ?? rp.echelle_texte ?? 1;
  const bp = boitePhoto(o);
  const W = rp.largeur_blocs > 0 ? rp.largeur_blocs : bp.l;
  const x0 = bp.cx - W / 2;
  let y = bp.y + bp.h + R().ecart_photo_blocs_mm * MM;
  const y0 = y;
  const prims = [];
  const blocs = (rp.blocs || []);
  blocs.forEach((b, i) => {
    const r = disposerBloc(b, x0, y, W, ech);
    prims.push(...r.prims);
    y += r.h + (i < blocs.length - 1 ? R().ecart_blocs_mm * MM * ech : 0);
  });
  const hauteur = blocs.length ? y - y0 : 0;
  return { prims, boite: blocs.length ? { x: x0, y: y0, l: W, h: hauteur } : null, hauteur };
}

/* Hauteur des blocs (sans les dessiner dans le plan) pour une largeur et une échelle données. */
export function hauteurBlocs(blocs, W, e = 1) {
  let h = 0;
  (blocs || []).forEach((b, i) => { h += disposerBloc(b, 0, 0, W, e).h + (i < blocs.length - 1 ? R().ecart_blocs_mm * MM * e : 0); });
  return h;
}

