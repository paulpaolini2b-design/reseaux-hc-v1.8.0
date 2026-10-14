/* v172.test.mjs — essais v1.7.2 : MALT existantes au descriptif ; aide au centrage sur la page (commande, objets
 * concernés, annulation). Lancer : node js/v172.test.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {} };

const { etat } = await import('./etat.js');
const { definirMesureur } = await import('./primitives.js');
const M = await import('./modele.js');
const { actualiserDesignation } = await import('./designation.js');
const DS = await import('./descriptif.js');
const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
function projet() { const p = M.nouveauProjet({ nom: 'ESSAI v1.7.2', commune: 'Furiani' }); etat.projet = p; etat.plan = p.plans[0]; return p; }
function ponctuel(p, type, x, etatO, attributs = {}, extra = {}) { const o = M.nouvelObjetPonctuel(type, x, 0, C('BTS', 'aerien', etatO), attributs); Object.assign(o, extra); actualiserDesignation(o); p.plans[0].objets.push(o); return o; }
const SUP = { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 };
const entree = (p, rep) => { DS.genererDescriptif(p.plans[0], p); return p.plans[0].descriptif.sections.find((s) => s.cle === 'ouvrages').entrees.find((x) => DS.texteSegments(x.repere) === rep + '.'); };
const textes = (e) => e.lignes.map((l) => DS.texteLigne(l));

essai('MALT existante notée sur un ouvrage existant (case « MALT ex ») : ligne au descriptif, entrée incluse', () => {
  const p = projet();
  const s = ponctuel(p, 'support', 100, 'existant', { ...SUP }, { repere: 'A1', repere_manuel: true });
  let e = entree(p, 'A1');
  assert.equal(e.inclure, false, 'sans MALT ex : existant sans travaux, non inclus (H-283)');
  s.attributs.malt_ex = true;
  e = entree(p, 'A1');
  assert.deepEqual(textes(e), ['BE 11m D 800 existant', 'MALT existante']);
  assert.equal(e.inclure, true);
});

essai('objet MALT existant rattaché à l\'ouvrage : une seule ligne même si la case est aussi cochée', () => {
  const p = projet();
  const c = ponctuel(p, 'coffret', 100, 'a_poser', { sigle: 'RM450' }, { repere: 'C1', repere_manuel: true });
  ponctuel(p, 'malt', 100.5, 'existant', {}, { repere: 'T1', repere_manuel: true });
  let e = entree(p, 'C1');
  assert.equal(textes(e).filter((t) => t === 'MALT existante').length, 1, textes(e).join(' | '));
  c.attributs.malt_ex = true;
  e = entree(p, 'C1');
  assert.equal(textes(e).filter((t) => t === 'MALT existante').length, 1);
  // MALT à poser rattachée : « Confection MALT », MALT existante en plus si notée
  ponctuel(p, 'malt', 99.5, 'a_poser', {}, { repere: 'T2', repere_manuel: true });
  e = entree(p, 'C1');
  assert.ok(textes(e).includes('Confection MALT') && textes(e).includes('MALT existante'));
});

essai('MALT existante isolée (non rattachée) : entrée propre incluse', () => {
  const p = projet();
  ponctuel(p, 'malt', 5000, 'existant', {}, { repere: 'T9', repere_manuel: true });
  const e = entree(p, 'T9');
  assert.equal(textes(e)[0], 'MALT existante');
  assert.equal(e.inclure, true);
});

essai('centrer sur la page : plan de situation / image centrés, ouvrages exclus de l’aimantation', async () => {
  const outils = await import('./outils.js');
  const H = await import('./historique.js');
  const { etenduePlan } = await import('./vue.js');
  const p = projet();
  H.reinitialiser && H.reinitialiser();
  const img = M.nouvelleImage(100, 100, 200, 120, 'fd_x', 'carte.png');
  img.situation = { lat: 42, lon: 9, zoom: 17, diametre_mm: 6, echelle: 5000, titre: 'Plan de situation', titre_visible: false };
  p.plans[0].objets.push(img);
  etat.selection.clear(); etat.selection.add(img.id);
  const pg = etenduePlan();
  const { boiteObjet } = await import('./accrochage.js');
  assert.ok(outils.centrerSelectionSurPage('horizontal'));
  let b = boiteObjet(img);
  assert.ok(Math.abs(b.x + b.l / 2 - pg.l / 2) < 1e-6);
  assert.ok(Math.abs(b.y + b.h / 2 - pg.h / 2) > 1, 'vertical inchangé');
  outils.centrerSelectionSurPage('les_deux');
  b = boiteObjet(img);
  assert.ok(Math.abs(b.y + b.h / 2 - pg.h / 2) < 1e-6);
  // ouvrages : la commande du menu ne les propose pas (centrable = faux) — et le glisser n'aimante pas
  const s = ponctuel(p, 'support', 300, 'a_poser', { ...SUP });
  etat.selection.clear(); etat.selection.add(s.id); etat.selection.add(img.id);
  assert.equal(outils.repereCentrageActif(), true);
  etat.prefs.reperes_centrage = false;
  assert.equal(outils.repereCentrageActif(), false);
  etat.prefs.reperes_centrage = undefined;
});

let n = 0;
for (const [nom, fn] of essais) { try { await fn(); n++; console.log('ok  ' + nom); } catch (e) { console.error('ÉCHEC  ' + nom); throw e; } }
console.log(n + ' essais réussis');
