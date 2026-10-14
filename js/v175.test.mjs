/* v175.test.mjs — essais v1.7.5 : page annexe du descriptif ajustée à la feuille A4 (H-359), en-tête de l'affaire et
 * titres de section centrés sur la feuille (H-360), réglage « Échelle en page annexe » (H-361).
 * v1.7.7 : adaptés au titre de page masqué (H-367) et au folio « n/N » de la marge basse (H-368).
 * Lancer : node js/v175.test.mjs   (non précaché par le service worker, comme les autres essais)
 * Mesure du texte : largeur approchée 0,55 × taille par caractère (pas de canvas sous Node). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {} };

const { etat } = await import('./etat.js');
const { definirMesureur, mesurerTexte } = await import('./primitives.js');
const { CHARTE, MM } = await import('./charte.js');
const M = await import('./modele.js');
const { actualiserDesignation } = await import('./designation.js');
const DS = await import('./descriptif.js');
const R = await import('./descriptif-rendu.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

let n = 0;
const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
const pt = (x, y) => ({ x, y });
const K = CHARTE.descriptif;
const [W, H] = K.annexe.format_pt;
const Z = R.zoneUtileAnnexe(W, H);
const proche = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

function projet(infos = {}) { const p = M.nouveauProjet({ nom: 'TDF Polaccie', commune: 'Saliceto', num_edf: '26B113', ...infos }); etat.projet = p; etat.plan = p.plans[0]; return p; }
function ponctuel(p, type, x, y, courant, attributs = {}, extra = {}) { const o = M.nouvelObjetPonctuel(type, x, y, courant, attributs); Object.assign(o, extra); actualiserDesignation(o); p.plans[0].objets.push(o); return o; }
function troncon(p, pts, courant, attributs = {}) { const o = M.nouveauTroncon(pts, courant, attributs); actualiserDesignation(o); p.plans[0].objets.push(o); return o; }
const generer = (p) => { for (const o of p.plans[0].objets) actualiserDesignation(o); DS.genererDescriptif(p.plans[0], p); const d = p.plans[0].descriptif; d.sortie_pdf = 'annexe'; return d; };

/* TDF Polaccie (Saliceto) : supports S1 à S5, BT aérienne 3 x 70 + 54,6 à poser de S1 à S5 (50 / 50 / 50 / 35 ml). */
function tdfPolaccie(nbSupports = 5) {
  const p = projet();
  for (let i = 1; i <= nbSupports; i++) ponctuel(p, 'support', i * 100, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'E', hauteur_m: 11, effort_daN: 650 }, { repere: 'S' + i, repere_manuel: true });
  const L = [50, 50, 50, 35];
  for (let i = 1; i < nbSupports; i++) troncon(p, [pt(i * 100, 0), pt((i + 1) * 100, 0)], C('BTS', 'aerien', 'a_poser'), { section: '3 x 70 + 54,6', longueur_m: L[(i - 1) % 4] });
  return p;
}
const textes = (pg) => pg.filter((x) => x.t === 'texte');
const centreTexte = (x) => x.x + mesurerTexte(x.texte, x.taille, { gras: x.gras }) / 2;
/* Centre horizontal d'une rangée de textes (même ligne de base) */
function centreRangee(pg, contenu) {
  const t = textes(pg).find((x) => x.texte === contenu);
  assert.ok(t, 'texte absent : ' + contenu);
  const rangee = textes(pg).filter((x) => proche(x.y, t.y, 1e-6) && x.taille === t.taille);
  const g = Math.min(...rangee.map((x) => x.x));
  const d = Math.max(...rangee.map((x) => x.x + mesurerTexte(x.texte, x.taille, { gras: x.gras })));
  return (g + d) / 2;
}
/* v1.7.7 (H-368) : folio « n/N » dans la marge basse, hors zone utile — contrôlé à part (sous la zone, dans la feuille) */
const estFolio = (x) => x.ancre === 'milieu' && /^\d+\/\d+$/.test(x.texte) && x.y > Z.y + Z.h;
function dansZone(pages) {
  for (const pg of pages) for (const x of textes(pg)) {
    if (estFolio(x)) { assert.ok(x.y - x.taille >= Z.y + Z.h - 1e-6 && x.y + 0.3 * x.taille <= H + 1e-6, 'folio hors marge basse'); continue; }
    const l = mesurerTexte(x.texte, x.taille, { gras: x.gras });
    assert.ok(x.x >= Z.x - 1e-6 && x.x + l <= Z.x + Z.l + 0.01, 'hors largeur : ' + x.texte);
    assert.ok(x.y >= Z.y - 1e-6 && x.y <= Z.y + Z.h + 1e-6, 'hors hauteur : ' + x.texte);
  }
}

essai('H-359 charte : corps maximal 4 mm, échelle ajustée bornée entre le corps minimal et le corps maximal', () => {
  assert.equal(K.annexe.taille_max_corps_mm, 4);
  const d = generer(tdfPolaccie());
  assert.equal(d.echelle_annexe, 'ajustee');
  const r = R.echelleAnnexe(etat.plan, etat.projet, W, H);
  assert.ok(r.ajustee && r.une_page);
  const corps = (K.corps.taille * r.echelle) / MM;
  assert.ok(corps >= K.taille_min_mm - 1e-6 && corps <= K.annexe.taille_max_corps_mm + 1e-6, 'corps ' + corps);
  // descriptif court : corps maximal atteint, une seule page
  assert.ok(proche(corps, 4, 1e-6));
  assert.equal(R.pagesAnnexe(etat.plan, etat.projet, W, H).length, 1);
});

essai('H-359 descriptif long : plus grande échelle qui tient sur une page, texte dans la zone utile', () => {
  const d = generer(tdfPolaccie(40));
  const r = R.echelleAnnexe(etat.plan, etat.projet, W, H);
  const pages = R.pagesAnnexe(etat.plan, etat.projet, W, H);
  if (r.une_page) {
    assert.equal(pages.length, 1);
    // 3 % plus grand ne tient plus (échelle maximale à 0,002 près, ou borne haute)
    const corps = (K.corps.taille * r.echelle) / MM;
    if (corps < K.annexe.taille_max_corps_mm - 0.01) {
      d.echelle_annexe = 'bloc'; d.echelle = r.echelle * 1.03;
      assert.ok(!R.echelleAnnexe(etat.plan, etat.projet, W, H).une_page);
      d.echelle_annexe = 'ajustee';
    }
  } else assert.ok(pages.length > 1);
  dansZone(pages);
});

essai('H-359 trop long pour une page au corps minimal : corps nominal 2,5 mm sur plusieurs pages, numérotées', () => {
  generer(tdfPolaccie(160));
  const r = R.echelleAnnexe(etat.plan, etat.projet, W, H);
  assert.ok(!r.une_page && proche(r.echelle, K.echelle_defaut, 1e-9));
  const pages = R.pagesAnnexe(etat.plan, etat.projet, W, H);
  assert.ok(pages.length > 1);
  // v1.7.7 (H-367, H-368) : plus de titre « … (1/N) » ; folio « 1/N » seul, en bas de chaque page
  assert.ok(!textes(pages[0]).some((x) => /Descriptif/.test(x.texte)));
  pages.forEach((pg, i) => assert.ok(textes(pg).some((x) => estFolio(x) && x.texte === (i + 1) + '/' + pages.length), 'folio page ' + (i + 1)));
  dansZone(pages);
});

essai('H-360 en-tête de l\'affaire (SALICETO, TDF POLACCIE, GPS, EDF) et titre « Tronçons » centrés sur la feuille A4', () => {
  const p = tdfPolaccie();
  p.gps = { lat: 42.4251006, lon: 9.2037964 };
  for (const colonnes of [1, 2, 3]) {
    const d = generer(p);
    d.colonnes = colonnes;
    d.sections.find((s) => s.cle === 'troncons').titre = [{ t: 'Tronçons', g: true }];   // titre saisi dans l'éditeur
    const pg = R.pagesAnnexe(etat.plan, etat.projet, W, H)[0];
    for (const t of ['SALICETO', 'POLACCIE', 'GPS', 'EDF']) assert.ok(proche(centreRangee(pg, t), W / 2), t + ' (' + colonnes + ' col.) : ' + centreRangee(pg, t));
    // descriptif court : une colonne pleine largeur quel que soit le réglage du bloc → titre centré sur la feuille
    assert.equal(R.echelleAnnexe(etat.plan, etat.projet, W, H).colonnes, 1);
    assert.ok(proche(centreRangee(pg, 'Tronçons'), W / 2), 'Tronçons : ' + centreRangee(pg, 'Tronçons'));
    dansZone([pg]);
  }
});

essai('H-360 une colonne seulement sous le corps nominal : colonnes du bloc si elles donnent un corps plus grand', () => {
  const d = generer(tdfPolaccie(70));
  d.colonnes = 3;
  const r = R.echelleAnnexe(etat.plan, etat.projet, W, H);
  d.colonnes = 1;
  const r1 = R.echelleAnnexe(etat.plan, etat.projet, W, H);
  if (r1.une_page && r1.echelle >= K.echelle_defaut) assert.equal(r.colonnes, 1);
  else { assert.ok(r.colonnes === 3 || r.echelle === r1.echelle); assert.ok(!r1.une_page || r.echelle >= r1.echelle); }
  d.colonnes = 3;
  dansZone(R.pagesAnnexe(etat.plan, etat.projet, W, H));
});

essai('H-360 en-tête sur la première page seulement, au-dessus des colonnes', () => {
  generer(tdfPolaccie(160));
  const pages = R.pagesAnnexe(etat.plan, etat.projet, W, H);
  assert.ok(textes(pages[0]).some((x) => x.texte === 'SALICETO'));
  for (const pg of pages.slice(1)) assert.ok(!textes(pg).some((x) => x.texte === 'SALICETO'));
  const ySal = textes(pages[0]).find((x) => x.texte === 'SALICETO').y;
  const yS1 = textes(pages[0]).find((x) => x.texte === 'S1').y;
  assert.ok(ySal < yS1);
});

essai('H-361 « Échelle du bloc » : comportement antérieur (échelle du bloc, pagination) ; valeur absente lue « ajustée »', () => {
  const d = generer(tdfPolaccie());
  d.echelle_annexe = 'bloc'; d.echelle = 1.2;
  const r = R.echelleAnnexe(etat.plan, etat.projet, W, H);
  assert.ok(!r.ajustee && proche(r.echelle, 1.2, 1e-9));
  const corps = textes(R.pagesAnnexe(etat.plan, etat.projet, W, H)[0]).find((x) => /^Pose/.test(x.texte));
  assert.ok(!corps || proche(corps.taille, K.corps.taille * 1.2, 1e-6));
  delete d.echelle_annexe;
  assert.equal(R.modeEchelleAnnexe(d), 'ajustee');
  DS.normaliserDescriptif(d);
  assert.equal(d.echelle_annexe, 'ajustee');
  d.echelle_annexe = 'n_importe_quoi';
  DS.normaliserDescriptif(d);
  assert.equal(d.echelle_annexe, 'ajustee');
});

essai('Bloc sur le plan inchangé : l\'échelle de l\'annexe n\'agit pas sur le bloc', () => {
  const d = generer(tdfPolaccie());
  d.sortie_pdf = 'plan'; d.echelle = 1;
  const a = JSON.stringify(R.primitivesDescriptifPlan(etat.plan, etat.projet));
  d.echelle_annexe = 'bloc';
  assert.equal(JSON.stringify(R.primitivesDescriptifPlan(etat.plan, etat.projet)), a);
});

for (const [nom, fn] of essais) { await fn(); n++; console.log('ok  ' + nom); }
console.log(n + ' essais réussis');
