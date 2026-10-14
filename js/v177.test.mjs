/* v177.test.mjs — essais v1.7.7 : QR code du point GPS sur le plan de situation (H-363 à H-366) ; titre de la page
 * annexe A4 du descriptif masqué au PDF, folio « n/N » (H-367, H-368).
 * Lancer : node js/v177.test.mjs   (non précaché par le service worker, comme les autres essais)
 * Mesure du texte : largeur approchée 0,55 × taille par caractère (pas de canvas sous Node).
 * Références v1.7.6 : empreintes SHA-256 (16 premiers caractères) du JSON des primitives et échelles retenues, calculées
 * avec le code de la v1.7.6 sur les mêmes jeux d'essai et le même mesureur. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {} };

const { etat } = await import('./etat.js');
const { definirMesureur } = await import('./primitives.js');
const { CHARTE, MM } = await import('./charte.js');
const M = await import('./modele.js');
const { actualiserDesignation } = await import('./designation.js');
const DS = await import('./descriptif.js');
const R = await import('./descriptif-rendu.js');
const S = await import('./symboles.js');
const QR = await import('./qr-situation.js');
const H = await import('./historique.js');
const FC = await import('./forme-calcul.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const empreinte = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const proche = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const KQ = CHARTE.situation.qr;
const KD = CHARTE.descriptif;
const [W, HP] = KD.annexe.format_pt;
const Z = R.zoneUtileAnnexe(W, HP);

/* ---------- Références v1.7.6 ---------- */
const REF_SITUATION = { r0: 'c76f258d902b23d1', r37: '863b34358e96f06e', r90: 'cfefc89ca691786e' };
const REF_ANNEXE = {
  ann_5_ajustee_1: [1.6, 1, 1, '9c3fa367302d4b12'], ann_5_ajustee_3: [1.6, 1, 1, '9c3fa367302d4b12'],
  ann_5_bloc_1: [1.2, 1, 1, '3cf785444a2fbd25'], ann_5_bloc_3: [1.2, 3, 1, '446b143146292be1'],
  ann_40_ajustee_1: [0.862, 1, 1, '25f4435a7a874898'], ann_40_ajustee_3: [1.6, 3, 1, '4c1cc5a5967d2bfd'],
  ann_40_bloc_1: [1.2, 1, 2, '31f5a06e88d220b2'], ann_40_bloc_3: [1.2, 3, 1, '40abe5e639d832fc'],
  ann_70_ajustee_1: [1, 1, 3, '7c8eceb1b8bc84fa'], ann_70_ajustee_3: [1.366, 3, 1, '9eb297d90ded4841'],
  ann_70_bloc_1: [1.2, 1, 3, '973758e6f60fcc92'], ann_70_bloc_3: [1.2, 3, 1, 'd61b284e1f3403cb'],
  ann_160_ajustee_1: [1, 1, 5, '4cd62a0f73164533'], ann_160_ajustee_3: [1, 3, 2, 'e2bfc1a1e6757cfe'],
  ann_160_bloc_1: [1.2, 1, 6, 'e408d60f4ca38b19'], ann_160_bloc_3: [1.2, 3, 3, 'd56b023bf7fbe279']
};
/* Jeu d'essai de v175.test.mjs (TDF Polaccie) : [échelle, colonnes] v1.7.6 */
const REF_V175 = { '5_1': [1.6, 1], '5_2': [1.6, 1], '5_3': [1.6, 1], '40_1': [0.871, 1], '40_2': [1.6, 2], '40_3': [1.6, 3], '70_1': [1, 1], '70_2': [0.967, 2], '70_3': [1.388, 3], '160_1': [1, 1], '160_2': [1, 2], '160_3': [1, 3] };

/* ---------- Jeux d'essai ---------- */
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
const pt = (x, y) => ({ x, y });
function descriptifSupports(nb, infos) {
  const p = M.nouveauProjet(infos);
  etat.projet = p; etat.plan = p.plans[0];
  for (let i = 1; i <= nb; i++) {
    const o = M.nouvelObjetPonctuel('support', i * 100, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'E', hauteur_m: 11, effort_daN: 650 });
    Object.assign(o, { repere: 'S' + i, repere_manuel: true });
    actualiserDesignation(o); p.plans[0].objets.push(o);
  }
  const L = [50, 50, 50, 35];
  for (let i = 1; i < nb; i++) {
    const o = M.nouveauTroncon([pt(i * 100, 0), pt((i + 1) * 100, 0)], C('BTS', 'aerien', 'a_poser'), { section: '3 x 70 + 54,6', longueur_m: L[(i - 1) % 4] });
    actualiserDesignation(o); p.plans[0].objets.push(o);
  }
  for (const o of p.plans[0].objets) actualiserDesignation(o);
  DS.genererDescriptif(p.plans[0], p);
  const d = p.plans[0].descriptif;
  d.sortie_pdf = 'annexe';
  return d;
}
/* Affaire de la recette : Santa Maria Poggio — Renfo BTA MIGLIARI, N° 1000 */
const migliari = (nb) => descriptifSupports(nb, { nom: 'Renfo BTA MIGLIARI', commune: 'Santa Maria Poggio', num_edf: '26B113', num_sieep: '1000' });
const polaccie = (nb) => descriptifSupports(nb, { nom: 'TDF Polaccie', commune: 'Saliceto', num_edf: '26B113' });

function planSituation({ rotation = 0, recadrage = null, qr = undefined, lat = 42.6971, lon = 9.4501, largeurMm = 70 } = {}) {
  const o = M.nouvelleImage(100, 200, largeurMm * MM, largeurMm * 0.75 * MM, 'fd_x', 'Plan de situation (IGN)');
  o.rotation = rotation;
  if (recadrage) o.recadrage = recadrage;
  o.situation = { lat, lon, zoom: 15, largeur_px: 1200, diametre_mm: 6, echelle: 5000, titre: 'PLAN DE SITUATION', titre_visible: true };
  if (qr !== undefined) o.situation.qr = qr;
  return o;
}
const CAS_SITUATION = [['r0', 0, null], ['r37', 37, { g: 0.1, h: 0.05, d: 0.2, b: 0.1 }], ['r90', 90, { g: 0, h: 0.2, d: 0, b: 0 }]];
const fondQr = (prims) => prims.find((x) => x.t === 'poly' && x.remplissage === KQ.fond && x.couleur === null);
const modulesQr = (prims) => prims.filter((x) => x.t === 'poly' && x.remplissage === KQ.module && x.couleur === null);

/* Capacité en octets (mode octet) au niveau M, versions 1 à 10 (ISO/IEC 18004, tableau 7) */
const CAPACITE_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

/* ==================== A. QR code du point GPS ==================== */

essai('A.1 matrice : taille 17 + 4 × version, carrée, plus petite version contenant l’URL au niveau M', () => {
  assert.equal(KQ.niveau, 'M');
  for (const [lat, lon] of [[42.6971, 9.4501], [42.1028902, 9.2117636], [42, 9], [-12.7806413, 45.2278824]]) {
    const url = DS.lienGoogleMaps({ lat, lon });
    const m = QR.matriceQr(url);
    assert.equal(m.n, 17 + 4 * m.version);
    assert.equal(m.sombre.length, m.n);
    for (const l of m.sombre) assert.equal(l.length, m.n);
    const L = new TextEncoder().encode(url).length;
    assert.ok(L <= CAPACITE_M[m.version - 1], 'URL de ' + L + ' octets en version ' + m.version);
    if (m.version > 1) assert.ok(L > CAPACITE_M[m.version - 2], 'version non minimale pour ' + L + ' octets');
  }
});

essai('A.2 zone de silence : 4 modules blancs sur chaque bord, fond blanc opaque sur tout le carré', () => {
  const o = planSituation({ qr: QR.qrParDefaut() });
  const g = QR.geometrieQrSituation(o);
  const loc = QR.primitivesQrLocales(g);
  const f = fondQr(loc);
  assert.ok(f, 'fond blanc absent');
  const xs = f.points.map((q) => q.x), ys = f.points.map((q) => q.y);
  assert.ok(proche(Math.min(...xs), g.x0, 1e-9) && proche(Math.max(...xs), g.x0 + g.cote, 1e-9));
  assert.ok(proche(Math.min(...ys), g.y0, 1e-9) && proche(Math.max(...ys), g.y0 + g.cote, 1e-9));
  assert.equal(loc.indexOf(f), 0, 'fond sous les modules');
  const s = KQ.silence_modules * g.module;
  assert.equal(KQ.silence_modules, 4);
  const noirs = modulesQr(loc);
  assert.ok(noirs.length > 0);
  for (const r of noirs) for (const q of r.points) {
    assert.ok(q.x >= g.x0 + s - 1e-9 && q.x <= g.x0 + g.cote - s + 1e-9, 'module dans la zone de silence (x)');
    assert.ok(q.y >= g.y0 + s - 1e-9 && q.y <= g.y0 + g.cote - s + 1e-9, 'module dans la zone de silence (y)');
  }
  // modules contigus d'une même ligne fusionnés : jamais deux rectangles qui se touchent sur une même ligne
  const lignes = new Map();
  for (const r of noirs) { const y = Math.round(Math.min(...r.points.map((q) => q.y)) * 1e6); (lignes.get(y) || lignes.set(y, []).get(y)).push(r); }
  for (const rs of lignes.values()) {
    const seg = rs.map((r) => [Math.min(...r.points.map((q) => q.x)), Math.max(...r.points.map((q) => q.x))]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < seg.length; i++) assert.ok(seg[i][0] > seg[i - 1][1] + g.module / 2, 'modules contigus non fusionnés');
  }
  // nombre de modules noirs reconstitué = matrice
  const total = noirs.reduce((n, r) => n + Math.round((Math.max(...r.points.map((q) => q.x)) - Math.min(...r.points.map((q) => q.x))) / g.module), 0);
  assert.equal(total, g.matrice.sombre.flat().filter(Boolean).length);
});

essai('A.3 côté total = cote_mm × MM à 0,01 près, quelle que soit la version', () => {
  const versions = new Set();
  for (const [lat, lon] of [[42, 9], [42.6971, 9.4501], [-12.7806413, 45.2278824]]) for (const cote of [KQ.cote_min_mm, 20, 27, KQ.cote_max_mm]) {
    const o = planSituation({ lat, lon, qr: { visible: true, coin: 'haut_droit', cote_mm: cote } });
    const g = QR.geometrieQrSituation(o);
    versions.add(g.matrice.version);
    const f = fondQr(S.primitivesQrSituation(o));
    const xs = f.points.map((q) => q.x);
    assert.ok(proche(Math.max(...xs) - Math.min(...xs), cote * MM), 'côté ' + cote);
    assert.ok(proche(g.module * g.modulesTotal, cote * MM, 1e-9));
  }
  assert.ok(versions.size >= 2, 'au moins deux versions essayées');
  // côté hors bornes ramené aux bornes de la charte
  assert.equal(QR.reglageQr(planSituation({ qr: { visible: true, cote_mm: 5 } })).cote_mm, KQ.cote_min_mm);
  assert.equal(QR.reglageQr(planSituation({ qr: { visible: true, cote_mm: 99 } })).cote_mm, KQ.cote_max_mm);
});

essai('A.4 position haut droit / haut gauche dans le rectangle visible, rognage et rotation 0°, 90°, 37°', () => {
  for (const rotation of [0, 90, 37]) for (const recadrage of [null, { g: 0.1, h: 0.15, d: 0.2, b: 0.05 }]) for (const coin of ['haut_droit', 'haut_gauche']) {
    const o = planSituation({ rotation, recadrage, qr: { visible: true, coin, cote_mm: 20 } });
    const v = FC.rectangleVisibleDe(o.x, o.y, o.largeur, o.hauteur, rotation, o.recadrage);
    const m = KQ.marge_mm * MM, c = 20 * MM;
    const x0 = coin === 'haut_gauche' ? -v.l / 2 + m : v.l / 2 - m - c, y0 = -v.h / 2 + m;
    const a = (rotation * Math.PI) / 180;
    const monde = (x, y) => ({ x: v.cx + x * Math.cos(a) - y * Math.sin(a), y: v.cy + x * Math.sin(a) + y * Math.cos(a) });
    const attendu = [monde(x0, y0), monde(x0 + c, y0), monde(x0 + c, y0 + c), monde(x0, y0 + c)];
    const f = fondQr(S.primitivesSituation(o));
    f.points.forEach((q, i) => assert.ok(proche(q.x, attendu[i].x) && proche(q.y, attendu[i].y), `coin ${i} ${coin} ${rotation}°`));
    // dans le cadre visible (coins du carré dans le rectangle tourné)
    for (const q of f.points) assert.ok(FC.dansRectangleTourne ? FC.dansRectangleTourne(q, v.cx, v.cy, v.l + 1e-6, v.h + 1e-6, rotation) : true, 'hors cadre');
    // jamais en bas : le carré est dans la moitié haute du cadre
    assert.ok(y0 + c < v.h / 2 - m - 1e-9 || c > v.h / 2);
  }
  // ordre : cadre, rond, QR, puis indication d'échelle et titre
  const prims = S.primitivesSituation(planSituation({ qr: QR.qrParDefaut() }));
  const iRond = prims.findIndex((x) => x.t === 'cercle');
  const iFond = prims.indexOf(fondQr(prims));
  const iTexte = prims.findIndex((x) => x.t === 'texte');
  assert.ok(iRond === 1 && iFond === 2 && iTexte > iFond);
});

essai('A.5 qr absent ou visible: false : primitives identiques à la v1.7.6 ; contenu encodé = point de la carte', () => {
  for (const [k, rotation, recadrage] of CAS_SITUATION) {
    assert.equal(empreinte(S.primitivesSituation(planSituation({ rotation, recadrage }))), REF_SITUATION[k], 'qr absent ' + k);
    assert.equal(empreinte(S.primitivesSituation(planSituation({ rotation, recadrage, qr: { visible: false, coin: 'haut_droit', cote_mm: 20 } }))), REF_SITUATION[k], 'visible false ' + k);
    assert.equal(empreinte(S.primitivesSituation(planSituation({ rotation, recadrage, qr: null }))), REF_SITUATION[k], 'qr null ' + k);
  }
  // projet v1.7.6 migré : aucun `qr` ajouté
  const ancien = M.nouveauProjet({ nom: 'Ancien', commune: 'Furiani' });
  const img = planSituation();
  ancien.plans[0].objets.push(img);
  const migre = M.migrerProjet(JSON.parse(JSON.stringify(ancien)));
  assert.equal(migre.plans[0].objets.at(-1).situation.qr, undefined);
  // champ conservé tel quel par la migration et la recopie (.json)
  img.situation.qr = { visible: true, coin: 'haut_gauche', cote_mm: 25 };
  assert.deepEqual(M.migrerProjet(JSON.parse(JSON.stringify(ancien))).plans[0].objets.at(-1).situation.qr, img.situation.qr);
  // URL = coordonnées de la carte, jamais le point GPS de l'affaire
  etat.projet = ancien; ancien.gps = '41.9, 8.7';
  assert.equal(QR.urlQrSituation(img), DS.lienGoogleMaps({ lat: 42.6971, lon: 9.4501 }));
});

essai('A.6 matrice en cache : mêmes coordonnées, un seul calcul ; nouvelles coordonnées, nouvelle matrice', () => {
  const o = planSituation({ lat: 42.55555, lon: 9.33333, qr: QR.qrParDefaut() });
  const n0 = QR.nombreCalculsQr();
  S.primitivesSituation(o);
  assert.equal(QR.nombreCalculsQr(), n0 + 1);
  for (let i = 0; i < 5; i++) { S.primitivesSituation(o); S.primitivesObjet(o); QR.alertesQrSituation(o); }
  assert.equal(QR.nombreCalculsQr(), n0 + 1, 'recalcul à chaque rendu');
  const m1 = QR.geometrieQrSituation(o).matrice;
  o.situation.lat = 42.55556;
  S.primitivesSituation(o);
  assert.equal(QR.nombreCalculsQr(), n0 + 2);
  assert.notEqual(QR.geometrieQrSituation(o).matrice, m1);
  o.situation.lat = 42.55555;
  S.primitivesSituation(o);
  assert.equal(QR.nombreCalculsQr(), n0 + 2, 'retour aux coordonnées initiales : matrice en cache');
});

essai('A.7 alertes de la fiche : débordement, recouvrement du rond, module < 0,4 mm', () => {
  const ok = QR.alertesQrSituation(planSituation({ qr: QR.qrParDefaut() }));
  assert.deepEqual([ok.debordement, ok.recouvrement, ok.modulePetit], [false, false, false]);
  assert.equal(ok.messages.length, 0);
  assert.ok(ok.module_mm >= KQ.module_min_mm);
  // débordement : carte de 40 × 30 mm, QR de 40 mm
  const deb = QR.alertesQrSituation(planSituation({ largeurMm: 40, qr: { visible: true, coin: 'haut_droit', cote_mm: 40 } }));
  assert.ok(deb.debordement && deb.messages.some((m) => /déborde/.test(m)));
  // débordement par rognage : partie visible réduite
  const rog = QR.alertesQrSituation(planSituation({ recadrage: { g: 0.5, h: 0.4, d: 0.2, b: 0.3 }, qr: { visible: true, coin: 'haut_droit', cote_mm: 20 } }));
  assert.ok(rog.debordement);
  // recouvrement : carte de 30 × 22,5 mm, QR de 20 mm au coin haut droit
  const rec = QR.alertesQrSituation(planSituation({ largeurMm: 30, qr: { visible: true, coin: 'haut_droit', cote_mm: 20 } }));
  assert.ok(rec.recouvrement && rec.messages.some((m) => /rond rouge/.test(m)));
  // recouvrement suivi en rotation (même géométrie locale)
  assert.ok(QR.alertesQrSituation(planSituation({ largeurMm: 30, rotation: 37, qr: { visible: true, coin: 'haut_droit', cote_mm: 20 } })).recouvrement);
  // module trop petit : 12 mm pour 45 modules (version 5) = 0,27 mm
  const pet = QR.alertesQrSituation(planSituation({ qr: { visible: true, coin: 'haut_droit', cote_mm: 12 } }));
  assert.ok(pet.modulePetit && pet.module_mm < 0.4 && pet.messages.some((m) => /Module/.test(m)));
  // aucun QR → aucune alerte
  assert.equal(QR.alertesQrSituation(planSituation()), null);
  assert.equal(QR.alertesQrSituation(planSituation({ qr: { visible: false } })), null);
});

essai('A.8 annulation d’une modification du réglage (Ctrl+Z) ; plan antérieur : seule la case affiche le QR', () => {
  const p = M.nouveauProjet({ nom: 'ESSAI v1.7.7', commune: 'Furiani' });
  etat.projet = p; etat.plan = p.plans[0]; etat.selection.clear();
  const o = planSituation();
  p.plans[0].objets.push(o);
  H.reinitialiserHistorique();
  const lire = () => etat.plan.objets.find((x) => x.id === o.id).situation.qr;
  // plan v1.7.6 : changer le coin seul ne fait pas apparaître le QR
  assert.ok(QR.appliquerReglageQr(etat.plan.objets[0], 'coin', 'haut_gauche'));
  H.valider('Réglage du QR code');
  assert.equal(lire().visible, false);
  assert.ok(QR.appliquerReglageQr(etat.plan.objets.find((x) => x.id === o.id), 'visible', true));
  H.valider('QR code affiché');
  assert.deepEqual(lire(), { visible: true, coin: 'haut_gauche', cote_mm: KQ.cote_mm });
  assert.ok(QR.appliquerReglageQr(etat.plan.objets.find((x) => x.id === o.id), 'cote_mm', '27,4'));
  H.valider('Réglage du QR code');
  assert.equal(lire().cote_mm, 27);
  assert.equal(QR.appliquerReglageQr(etat.plan.objets.find((x) => x.id === o.id), 'cote_mm', '27'), false, 'valeur identique : aucune étape');
  H.annuler();
  assert.equal(lire().cote_mm, KQ.cote_mm);
  H.annuler();
  assert.equal(lire().visible, false);
  H.retablir();
  assert.equal(lire().visible, true);
});

/* ==================== B. Page annexe A4 : titre masqué ==================== */

const textes = (pg) => pg.filter((x) => x.t === 'texte');
const estFolio = (x) => x.ancre === 'milieu' && /^\d+\/\d+$/.test(x.texte) && x.y > Z.y + Z.h;

essai('B.1 une page : aucun texte hors de l’en-tête de l’affaire et des entrées (ni « Descriptif », ni nom de l’affaire)', () => {
  assert.equal(KD.annexe.titre_pdf_visible, false);
  assert.ok(KD.annexe.entete.includes('Descriptif'), 'format du titre conservé dans la charte');
  migliari(5);
  const pages = R.pagesAnnexe(etat.plan, etat.projet, W, HP);
  assert.equal(pages.length, 1);
  const t = textes(pages[0]);
  assert.ok(!t.some((x) => /Descriptif/.test(x.texte)));
  // le nom de l'affaire n'apparaît que dans l'en-tête (en majuscules : « RENFO BTA MIGLIARI »)
  for (const x of t.filter((x) => /migliari|renfo/i.test(x.texte))) assert.equal(x.texte, x.texte.toUpperCase(), 'nom hors en-tête : ' + x.texte);
  assert.ok(!t.some(estFolio), 'pas de folio sur une page unique');
  // « SANTA MARIA POGGIO » en première ligne
  const yMin = Math.min(...t.map((x) => x.y));
  assert.ok(t.filter((x) => proche(x.y, yMin, 1e-6)).some((x) => x.texte === 'SANTA'));
});

essai('B.2 haut de l’en-tête de l’affaire = haut de la zone utile (0,01 pt)', () => {
  for (const nb of [5, 40, 160]) {
    migliari(nb);
    const dsp = R.dispositionAnnexe(etat.plan, etat.projet, W, HP);
    assert.equal(dsp.hTitre, 0);
    assert.ok(proche(dsp.yEntete, Z.y), 'yEntete ' + dsp.yEntete);
  }
});

essai('B.3 échelle ajustée ≥ échelle de la v1.7.6 (jeu d’essai de v175.test.mjs)', () => {
  for (const [cle, [e176]] of Object.entries(REF_V175)) {
    const [nb, col] = cle.split('_').map(Number);
    const d = polaccie(nb); d.colonnes = col;
    const r = R.echelleAnnexe(etat.plan, etat.projet, W, HP);
    assert.ok(r.echelle >= e176 - 1e-9, `${cle} : ${r.echelle} < ${e176}`);
  }
});

essai('B.4 plusieurs pages : folio « n/N » sur chaque page, centré sur la feuille, sous la zone utile et dans la feuille', () => {
  for (const [nb, mode, echelle] of [[160, 'ajustee', null], [70, 'bloc', 1.2], [40, 'bloc', 4]]) {
    const d = migliari(nb);
    d.echelle_annexe = mode; if (echelle) d.echelle = echelle;
    const pages = R.pagesAnnexe(etat.plan, etat.projet, W, HP);
    assert.ok(pages.length > 1, nb + ' ' + mode);
    pages.forEach((pg, i) => {
      const f = textes(pg).filter(estFolio);
      assert.equal(f.length, 1, 'folio page ' + (i + 1));
      const x = f[0];
      assert.equal(x.texte, (i + 1) + '/' + pages.length);
      assert.ok(proche(x.x, W / 2) && x.ancre === 'milieu', 'centrage');
      assert.equal(x.couleur, '#000000');
      assert.ok(x.y - x.taille >= Z.y + Z.h - 1e-6, 'folio dans la zone utile');
      assert.ok(x.y + 0.3 * x.taille <= HP + 1e-6, 'folio hors feuille');
      const corps = KD.corps.taille * R.echelleAnnexe(etat.plan, etat.projet, W, HP).echelle;
      assert.ok(x.taille <= corps + 1e-9);
      if (corps / MM <= R.corpsMaxFolioMm()) assert.ok(proche(x.taille, corps, 1e-9), 'taille du corps × échelle');
      // aucun autre texte hors de la zone utile, aucun numéro dans un titre
      for (const y of textes(pg)) if (y !== x) assert.ok(y.y <= Z.y + Z.h + 1e-6 && !/\(\d+\/\d+\)/.test(y.texte));
    });
  }
  assert.ok(proche(R.corpsMaxFolioMm(), 10 / 1.3, 1e-9));
});

essai('B.5 mode « Échelle du bloc » : même échelle et mêmes colonnes qu’en v1.7.6, aucun titre', () => {
  for (const [cle, [e176, c176]] of Object.entries(REF_ANNEXE)) {
    const [, nb, mode, col] = cle.split('_');
    if (mode !== 'bloc') continue;
    const d = migliari(Number(nb)); d.echelle_annexe = 'bloc'; d.colonnes = Number(col); d.echelle = 1.2;
    const r = R.echelleAnnexe(etat.plan, etat.projet, W, HP);
    assert.ok(proche(r.echelle, e176, 1e-9) && r.colonnes === c176, cle);
    for (const pg of R.pagesAnnexe(etat.plan, etat.projet, W, HP)) assert.ok(!textes(pg).some((x) => /Descriptif/.test(x.texte)), cle);
  }
});

essai('B.7 titre_pdf_visible: true : primitives identiques à la v1.7.6 (titre, numéro de page dans le titre, échelle)', () => {
  KD.annexe.titre_pdf_visible = true;
  try {
    for (const [cle, [e176, c176, n176, h176]] of Object.entries(REF_ANNEXE)) {
      const [, nb, mode, col] = cle.split('_');
      const d = migliari(Number(nb)); d.echelle_annexe = mode; d.colonnes = Number(col); if (mode === 'bloc') d.echelle = 1.2;
      const r = R.echelleAnnexe(etat.plan, etat.projet, W, HP);
      assert.ok(proche(r.echelle, e176, 1e-9) && r.colonnes === c176, 'échelle ' + cle);
      const pages = R.pagesAnnexe(etat.plan, etat.projet, W, HP);
      assert.equal(pages.length, n176, 'pages ' + cle);
      assert.equal(empreinte(pages), h176, 'primitives ' + cle);
    }
  } finally { KD.annexe.titre_pdf_visible = false; }
});

let n = 0;
for (const [nom, fn] of essais) { try { await fn(); n++; console.log('ok  ' + nom); } catch (e) { console.error('ÉCHEC  ' + nom); throw e; } }
console.log(n + ' essais réussis (B.6 : v175.test.mjs adapté, à lancer à part)');
