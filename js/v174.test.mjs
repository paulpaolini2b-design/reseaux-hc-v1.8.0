/* v174.test.mjs — essais v1.7.4 : l'ordre du matériel associé (flèches ▲ ▼ de la fiche) est repris au descriptif (H-358).
 * Lancer : node js/v174.test.mjs */
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
const N = await import('./nomenclature.js');
const H = await import('./historique.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const libre = (libelle) => ({ source: 'LIBRE', ref_article: null, libelle, quantite: 1, quantite_saisie: false, unite: '', package: null });
const nomencl = (id) => { const a = N.articleParId(id); return { source: 'NOMENCLATURE', ref_article: a.id, libelle: a.libelle, quantite: 1, quantite_saisie: false, unite: a.unite || '', package: null }; };
const armBT = () => etat.nomenclature.articles.filter((a) => a.categorie === 'ARMEMENT_BT');

function projet() {
  const p = M.nouveauProjet({ nom: 'ESSAI v1.7.4', commune: 'Furiani' });
  etat.projet = p; etat.plan = p.plans[0]; etat.selection.clear();
  const s = M.nouvelObjetPonctuel('support', 100, 100, { domaine: 'BTS', pose: 'aerien', etat: 'a_poser' }, { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 });
  Object.assign(s, { repere: 'A1', repere_manuel: true });
  actualiserDesignation(s);
  p.plans[0].objets.push(s);
  return { p, s };
}
const entree = (p) => p.plans[0].descriptif.sections.find((x) => x.cle === 'ouvrages').entrees.find((e) => DS.texteSegments(e.repere) === 'A1.');
const textes = (p) => entree(p).lignes.map((l) => DS.texteLigne(l));
const monter = (o, i) => { [o.materiel_associe[i - 1], o.materiel_associe[i]] = [o.materiel_associe[i], o.materiel_associe[i - 1]]; };

essai('▲ / ▼ dans la fiche : la ligne change de place au descriptif', () => {
  const { p, s } = projet();
  s.materiel_associe.push(libre('Élagage'), libre('Abattage'), libre('Terrassement'));
  DS.genererDescriptif(p.plans[0], p);
  assert.deepEqual(textes(p).slice(1), ['Élagage', 'Abattage', 'Terrassement']);
  monter(s, 2);   // Terrassement ▲
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.deepEqual(textes(p).slice(1), ['Élagage', 'Terrassement', 'Abattage']);
  monter(s, 1);   // Terrassement ▲
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.deepEqual(textes(p).slice(1), ['Terrassement', 'Élagage', 'Abattage']);
});

essai('articles de nomenclature et libre mélangés ; deux lignes du même article', () => {
  const { p, s } = projet();
  const [a1, a2] = armBT();
  s.materiel_associe.push(nomencl(a1.id), libre('Élagage'), nomencl(a2.id), nomencl(a1.id));
  s.materiel_associe[3].quantite = 2;
  DS.genererDescriptif(p.plans[0], p);
  const avant = textes(p).slice(1);
  monter(s, 1);   // Élagage en tête
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.deepEqual(textes(p).slice(1), [avant[1], avant[0], avant[2], avant[3]]);
  // échange des deux lignes du même article : le texte (quantité) suit
  [s.materiel_associe[1], s.materiel_associe[3]] = [s.materiel_associe[3], s.materiel_associe[1]];
  DS.mettreAJourDescriptif(p.plans[0], p);
  const apres = textes(p).slice(1);
  assert.equal(apres.length, 4);
  assert.ok(/2/.test(apres[1]), apres.join(' | '));
});

essai('ajout ou retrait seul : aucune ligne déplacée ; déplacement fait dans l\'éditeur conservé', () => {
  const { p, s } = projet();
  s.materiel_associe.push(libre('Élagage'), libre('Abattage'));
  DS.genererDescriptif(p.plans[0], p);
  // déplacement dans l'éditeur du descriptif (lignes échangées), fiche inchangée
  const e = entree(p);
  const i = e.lignes.findIndex((l) => DS.texteLigne(l) === 'Élagage');
  [e.lignes[i], e.lignes[i + 1]] = [e.lignes[i + 1], e.lignes[i]];
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.deepEqual(textes(p).slice(1), ['Abattage', 'Élagage'], 'déplacement de l’éditeur conservé');
  s.materiel_associe.push(libre('Terrassement'));
  DS.mettreAJourDescriptif(p.plans[0], p);
  // ajout seul : les lignes existantes ne bougent pas ; la nouvelle s'insère après sa précédente dans la fiche (règle de
  // fusion existante : après Abattage)
  assert.deepEqual(textes(p).slice(1), ['Abattage', 'Terrassement', 'Élagage'], 'ajout seul : rien ne bouge');
  s.materiel_associe.splice(0, 1);   // retrait d'Élagage
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.deepEqual(textes(p).slice(1), ['Abattage', 'Terrassement']);
});

essai('ligne retouchée à la main : déplacée avec son article, texte manuel conservé', () => {
  const { p, s } = projet();
  s.materiel_associe.push(libre('Élagage'), libre('Abattage'));
  DS.genererDescriptif(p.plans[0], p);
  const e = entree(p);
  const l = e.lignes.find((x) => DS.texteLigne(x) === 'Élagage');
  l.origine = 'manuelle';
  l.segments = [[{ t: 'Élagage des haies' }]];
  monter(s, 1);
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.deepEqual(textes(p).slice(1), ['Abattage', 'Élagage des haies']);
});

essai('package MALT condensé : « Confection MALT » suit sa place dans la fiche', () => {
  const { p, s } = projet();
  s.materiel_associe.push(libre('Élagage'), ...N.lignesPackage('MALT'));
  DS.genererDescriptif(p.plans[0], p);
  const malt = textes(p).find((t) => /MALT/.test(t));
  assert.deepEqual(textes(p).slice(1), ['Élagage', malt]);
  const el = s.materiel_associe.shift(); s.materiel_associe.push(el);   // Élagage descendu sous le package
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.deepEqual(textes(p).slice(1), [malt, 'Élagage']);
});

essai('descriptif d\'un projet antérieur : rien ne bouge à l\'ouverture ; annulation en une étape', () => {
  const { p, s } = projet();
  s.materiel_associe.push(libre('Élagage'), libre('Abattage'));
  DS.genererDescriptif(p.plans[0], p);
  delete entree(p).ordre_materiel;   // entrée créée par la v1.7.3
  const e = entree(p);
  const i = e.lignes.findIndex((l) => DS.texteLigne(l) === 'Élagage');
  [e.lignes[i], e.lignes[i + 1]] = [e.lignes[i + 1], e.lignes[i]];   // ordre divergent hérité
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.deepEqual(textes(p).slice(1), ['Abattage', 'Élagage'], 'aucun déplacement à l’ouverture');
  // flèche dans la fiche : l'ordre de la fiche s'applique, dans l'étape d'historique de la fiche
  H.reinitialiserHistorique();
  monter(s, 1);   // Abattage ▲ → fiche : Abattage, Élagage (déjà l'ordre affiché)
  H.valider('Ordre du matériel');
  monter(s, 1);   // Élagage ▲ → fiche : Élagage, Abattage
  H.valider('Ordre du matériel');
  assert.deepEqual(textes(etat.projet).slice(1), ['Élagage', 'Abattage']);
  H.annuler();
  assert.deepEqual(textes(etat.projet).slice(1), ['Abattage', 'Élagage']);
});

let n = 0;
for (const [nom, fn] of essais) { try { await fn(); n++; console.log('ok  ' + nom); } catch (e) { console.error('ÉCHEC  ' + nom); throw e; } }
console.log(n + ' essais réussis');
