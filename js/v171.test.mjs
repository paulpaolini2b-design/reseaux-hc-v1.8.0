/* v171.test.mjs — essais v1.7.1 : aspect du cartouche du plan repris au descriptif, armements multiples (fiche, étiquette,
 * descriptif, migration 15 → 16), indicateur de longueur actif en souterrain par défaut, 1/100 000.
 * Lancer : node js/v171.test.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }) };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };

const { etat } = await import('./etat.js');
const { definirMesureur } = await import('./primitives.js');
const { CHARTE } = await import('./charte.js');
const M = await import('./modele.js');
const { actualiserDesignation } = await import('./designation.js');
const DS = await import('./descriptif.js');
const { primitivesDescriptifPlan, geometrieCartouche } = await import('./descriptif-rendu.js');
const SY = await import('./symboles.js');
const SI = await import('./situation.js');
const IL = await import('./indicateur-longueur.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
function projet() { const p = M.nouveauProjet({ nom: 'ESSAI v1.7.1', commune: 'Furiani' }); etat.projet = p; etat.plan = p.plans[0]; return p; }
function support(p, x, etatO, extra = {}) {
  const o = M.nouvelObjetPonctuel('support', x, 0, C('BTS', 'aerien', etatO), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 });
  Object.assign(o, { repere: 'A' + (x / 100), repere_manuel: true }, extra); actualiserDesignation(o); p.plans[0].objets.push(o); return o;
}
const arm = (ref, etatA, q = 1, par = null) => ({ id: 'a' + Math.random().toString(36).slice(2, 7), ref, libelle: '', etat: etatA, quantite: q, par_ref: par, par_libelle: '' });
const lignes = (p, rep) => { DS.genererDescriptif(p.plans[0], p); const e = p.plans[0].descriptif.sections.find((s) => s.cle === 'ouvrages').entrees.find((x) => DS.texteSegments(x.repere) === rep + '.'); return e.lignes.map((l) => DS.texteLigne(l)); };

essai('cartouche du plan (texte, contour, fond) repris au descriptif ; couleur choisie au descriptif prioritaire', () => {
  const p = projet();
  const s = support(p, 100, 'a_poser');
  s.cartouche.couleur_texte = '#e2001a'; s.cartouche.couleur_contour = '#171AEB'; s.cartouche.fond = 'transparent';
  DS.genererDescriptif(p.plans[0], p);
  const e = p.plans[0].descriptif.sections.find((x) => x.cle === 'ouvrages').entrees[0];
  assert.deepEqual(e.style_repere, { texte: '#e2001a', contour: '#171AEB', fond: 'transparent' });
  const prims = primitivesDescriptifPlan(p.plans[0], p);
  const c = prims.find((x) => x.t === 'cercle');
  assert.equal(c.couleur, '#171AEB'); assert.equal(c.remplissage, null);
  assert.ok(prims.some((x) => x.t === 'texte' && x.texte === 'A1' && x.couleur === '#E2001A'));
  assert.equal(geometrieCartouche('A1.', '#14307D', e.style_repere).couleur, '#14307D', 'couleur choisie au descriptif prioritaire');
  assert.equal(geometrieCartouche('A1.', '#E30000', e.style_repere).couleur, '#E2001A', 'ancien rouge par défaut ignoré');
  // aspect par défaut : noir sur blanc, inchangé
  s.cartouche.couleur_texte = '#000000'; s.cartouche.couleur_contour = '#000000'; s.cartouche.fond = 'blanc';
  DS.mettreAJourDescriptif(p.plans[0], p);
  const c2 = primitivesDescriptifPlan(p.plans[0], p).find((x) => x.t === 'cercle');
  assert.equal(c2.couleur, '#000000'); assert.equal(c2.remplissage, '#FFFFFF');
});

essai('armements multiples : étiquette (suffixe seulement si l\'état diffère du support)', () => {
  const p = projet();
  const s = support(p, 100, 'existant');
  s.attributs.armements = [arm('a0186', 'existant'), arm('a0189', 'a_poser', 2), arm('a0191', 'a_reprendre', 1, 'a0190'), arm('a0187', 'a_deposer')];
  assert.deepEqual(SY.texteArmementsEtiquette(s), ['ES 54-14', '2 EAS 54-10 à poser', 'EADS 54-10 à remplacer par EADS 70-10', 'ES 70-14 à déposer']);
  s.etat = 'a_poser'; s.attributs.armements = [arm('a0186', 'a_poser')];
  assert.deepEqual(SY.texteArmementsEtiquette(s), ['ES 54-14'], 'même rendu qu\'en v1.7.0 pour un armement unique');
  s.attributs.materiau = 'CONSOLE';
  assert.deepEqual(SY.texteArmementsEtiquette(s), [], 'console / ancrage : pas d\'armement');
});

essai('armements multiples au descriptif : existant, à poser, à déposer, à remplacer ; sigle sauf ambiguïté', () => {
  const p = projet();
  const s = support(p, 100, 'existant');
  s.attributs.armements = [arm('a0186', 'existant'), arm('a0189', 'a_poser', 2), arm('a0193', 'a_deposer')];
  assert.deepEqual(lignes(p, 'A1'), ['BE 11m D 800 existant', 'Armement ES existant', 'Pose 2 EAS', 'Dépose 1 BT-H 61']);
  s.attributs.armements = [arm('a0191', 'a_reprendre', 1, 'a0190')];
  assert.deepEqual(lignes(p, 'A1'), ['BE 11m D 800 existant', 'Dépose 1 EADS 54-10 – Pose 1 EADS 70-10'], 'même sigle : abréviation d\'étiquette');
  s.attributs.armements = [arm('a0191', 'a_reprendre', 1, null)];
  assert.deepEqual(lignes(p, 'A1').slice(1), ['Armement EADS à remplacer']);
  // existant seul : visible dans l'entrée, entrée non incluse par défaut (aucun travail)
  s.attributs.armements = [arm('a0186', 'existant')];
  DS.genererDescriptif(p.plans[0], p);
  const e = p.plans[0].descriptif.sections.find((x) => x.cle === 'ouvrages').entrees[0];
  assert.ok(e.lignes.some((l) => DS.texteLigne(l) === 'Armement ES existant'));
  assert.equal(e.inclure, false);
});

essai('migration 15 → 16 : l\'armement unique devient une ligne à l\'état du support ; ancrage conservé ; idempotente', () => {
  const p = projet();
  const s = support(p, 100, 'a_poser');
  s.attributs.armement = 'ES 1500 (ES 54-14)'; s.attributs.armement_ref = 'a0186'; delete s.attributs.armements;
  const a = support(p, 200, 'existant');
  a.attributs.materiau = 'ANCRAGE'; a.attributs.armement_ref = 'a0195'; a.attributs.armement = 'EAF'; delete a.attributs.armements;
  const v = JSON.parse(JSON.stringify(p)); v.version_schema = 15;
  DS.genererDescriptif(p.plans[0], p);
  const avant = lignes(p, 'A1');
  const m = M.migrerProjet(v);
  assert.equal(m.version_schema, 18);   // v1.7.3 : schéma 17 ; v1.8.0 : 18
  const sm = m.plans[0].objets[0], am = m.plans[0].objets[1];
  assert.equal(sm.attributs.armements.length, 1);
  assert.equal(sm.attributs.armements[0].ref, 'a0186'); assert.equal(sm.attributs.armements[0].etat, 'a_poser');
  assert.equal(sm.attributs.armement, ''); assert.equal(sm.attributs.armement_ref, null);
  assert.equal(am.attributs.armement_ref, 'a0195', 'type d\'ancrage conservé'); assert.deepEqual(am.attributs.armements, []);
  etat.projet = m; etat.plan = m.plans[0];
  assert.deepEqual(lignes(m, 'A1'), avant, 'descriptif identique après migration (« Pose 1 ES »)');
  const j = JSON.stringify(m); M.migrerProjet(m); assert.equal(JSON.stringify(m), j);
  assert.equal(M.nouvelArmement({ etat: 'a_reprendre' }).etat, 'a_poser');
  assert.equal(M.nouvelArmement({ etat: 'existant' }).etat, 'existant');
});

essai('indicateur de longueur actif par défaut en souterrain et pour les fourreaux, désactivable', () => {
  etat.prefs.indicateur_longueur = undefined;
  assert.equal(IL.indicateurActif('souterrain'), true);
  assert.equal(IL.indicateurActif('souterrain', 'fourreau'), true);
  etat.prefs.indicateur_longueur = { aerien: true, souterrain: false };
  assert.equal(IL.indicateurActif('souterrain'), false);
  etat.prefs.indicateur_longueur = undefined;
});

essai('plan de situation au 1/100 000 : niveau ≥ zoom_min, indication', () => {
  assert.ok(CHARTE.situation.echelles.includes(100000));
  const r = SI.niveauPourEchelle(42, 100000);
  assert.equal(r.zoom, 13); assert.ok(r.zoom >= CHARTE.situation.zoom_min && r.atteint);
  assert.equal(SI.libelleEchelle(100000), 'Éch. 1/100\u00A0000');
  assert.equal(SI.cartePourEchelle(42, 100000, 70, 52.5).depasse, false);
});

let n = 0;
for (const [nom, fn] of essais) { try { await fn(); n++; console.log('ok  ' + nom); } catch (e) { console.error('ÉCHEC  ' + nom); throw e; } }
console.log(n + ' essais réussis');
