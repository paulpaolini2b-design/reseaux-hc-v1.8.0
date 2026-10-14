/* v173.test.mjs — essais v1.7.3 : angle de piquetage des supports aériens (calcul pur, portées retenues, amont / aval,
 * saisie manuelle, activation, historique, migration 16 → 17). Lancer : node js/v173.test.mjs */
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
const PC = await import('./piquetage-calcul.js');
const PQ = await import('./piquetage.js');
const H = await import('./historique.js');
const SY = await import('./symboles.js');
const DS = await import('./descriptif.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
const GR = Math.PI / 200;
const TOL = PQ.tolerancePiquetage();

/* Géométrie du cas P5 (affaire « TDF Polaccie — Saliceto ») : P4 → P5 plein est, P5 → P6 dévié de `dev` grades ;
 * dev < 0 : rotation anti-horaire à l'écran (y vers le bas : P6 au-dessus de l'axe). */
const A = { x: 100, y: 300 }, S = { x: 300, y: 300 };
const versB = (dev, L = 200) => ({ x: S.x + L * Math.cos(dev * GR), y: S.y + L * Math.sin(dev * GR) });

function projet({ actif = false } = {}) {
  const p = M.nouveauProjet({ nom: 'TDF Polaccie', commune: 'Saliceto' });
  p.reglages.angle_piquetage_auto = actif;
  etat.projet = p; etat.plan = p.plans[0]; etat.selection.clear();
  return p;
}
function support(p, pt, repere, extra = {}, domaine = 'BTS') {
  const o = M.nouvelObjetPonctuel('support', pt.x, pt.y, C(domaine, 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 });
  Object.assign(o, { repere, repere_manuel: true }, extra);
  actualiserDesignation(o); p.plans[0].objets.push(o); return o;
}
function troncon(p, pts, { domaine = 'BTS', pose = 'aerien', etatT = 'a_poser' } = {}) {
  const t = M.nouveauTroncon(pts, C(domaine, pose, etatT), { section: '3x70+54,6' });
  actualiserDesignation(t); p.plans[0].objets.push(t); return t;
}
/* Ligne P4 – P5 – P6 en un seul tronçon (dev en grades) ; renvoie les objets. */
function ligne(p, dev, opts = {}) {
  const B = versB(dev);
  const p4 = support(p, A, 'P4'), p5 = support(p, S, 'P5', opts.p5 || {}), p6 = support(p, B, 'P6');
  const t = troncon(p, [A, S, B]);
  return { p4, p5, p6, t, B };
}
const analyse = (p, o) => PC.analyserSupport(o, p.plans[0].objets, TOL);

/* ---------- 1 à 5 : calcul pur ---------- */
essai('1. cas P5 : 73,5 gr anti-horaire → brut 73,5, arrondi 74, ANTIHORAIRE (et sur un plan)', () => {
  const r = PC.angleDeviation(A, S, versB(-73.5));
  assert.ok(Math.abs(r.brut - 73.5) <= 1e-9, String(r.brut));
  assert.equal(r.arrondi, 74);
  assert.equal(r.sens, 'ANTIHORAIRE');
  const p = projet({ actif: true });
  const { p5 } = ligne(p, -73.5);
  PQ.recalculerAnglesPlan(p.plans[0], p);
  assert.equal(p5.attributs.angle_gr, 74);
  assert.equal(p5.attributs.angle_source, 'CALCULE');
  assert.equal(p5.attributs.angle_sens, 'ANTIHORAIRE');
  assert.ok(Math.abs(p5.attributs.angle_brut_gr - 73.5) <= 1e-9);
  assert.equal(M.formaterAngle(p5.attributs.angle_gr), 'φ = 74\u00A0gr', 'étiquette : valeur entière sans décimale');
});

essai('2. symétrique miroir → 74, HORAIRE', () => {
  const r = PC.angleDeviation(A, S, versB(73.5));
  assert.ok(Math.abs(r.brut - 73.5) <= 1e-9);
  assert.equal(r.arrondi, 74);
  assert.equal(r.sens, 'HORAIRE');
});

essai('3. arrondi : 73,0 → 73 ; 73,0 + 1e-10 → 73 ; 73,01 → 74 (et géométrie exacte à 73 gr)', () => {
  assert.equal(PC.arrondiPiquetage(73.0), 73);
  assert.equal(PC.arrondiPiquetage(73.0 + 1e-10), 73);
  assert.equal(PC.arrondiPiquetage(73.01), 74);
  assert.equal(PC.arrondiPiquetage(73.5), 74);
  assert.equal(PC.arrondiPiquetage(0), 0);
  assert.equal(PC.arrondiPiquetage(1e-9), 0);
  assert.equal(PC.angleDeviation(A, S, versB(-73)).arrondi, 73, 'bruit flottant du calcul géométrique absorbé');
  assert.equal(PC.angleDeviation(A, S, versB(73)).arrondi, 73);
});

essai('4. portées alignées → 0, sans sens', () => {
  const r = PC.angleDeviation(A, S, versB(0));
  assert.equal(r.arrondi, 0);
  assert.equal(r.sens, null);
  assert.ok(r.brut < 1e-9);
});

essai('5. portées superposées ou de longueur nulle → null + motif « à compléter »', () => {
  assert.equal(PC.angleDeviation(A, S, { x: 200, y: 300 }), null, 'B dans la direction de A');
  assert.equal(PC.angleDeviation(A, S, { x: 0, y: 300 }), null, 'B au-delà de A sur la même droite');
  assert.equal(PC.angleDeviation(S, S, versB(-20)), null, 'portée amont de longueur nulle');
  const p = projet({ actif: true });
  support(p, A, 'P4'); const p5 = support(p, S, 'P5'); support(p, { x: 200, y: 300 }, 'P6');
  troncon(p, [A, S]); troncon(p, [S, { x: 200, y: 300 }]);
  const an = analyse(p, p5);
  assert.equal(an.cas, 'DEUX');
  assert.equal(an.resultat, null);
  assert.deepEqual(M.motifsACompleter(p5, p.plans[0].objets), [PC.MOTIFS_PIQUETAGE.superposees]);
  assert.equal(M.estComplet(p5, p.plans[0].objets), false);
  p.reglages.angle_piquetage_auto = false;
  assert.equal(M.estComplet(p5, p.plans[0].objets), true, 'fonction inactive : aucun motif');
});

/* ---------- 6 à 9 : portées, amont / aval ---------- */
essai('6. inversion amont / aval → même valeur, sens inversé', () => {
  const p = projet({ actif: true });
  const { p5 } = ligne(p, -73.5);
  let an = analyse(p, p5);
  assert.equal(an.amont.voisin_repere, 'P4');
  assert.equal(an.aval.voisin_repere, 'P6');
  assert.equal(an.regle, 'repere');
  p5.attributs.angle_inverse = true;
  an = analyse(p, p5);
  assert.equal(an.amont.voisin_repere, 'P6');
  assert.equal(an.resultat.arrondi, 74);
  assert.equal(an.resultat.sens, 'HORAIRE');
});

essai('6 bis. amont par repère quel que soit le sens de tracé ; à défaut de repères, sens de tracé', () => {
  const p = projet({ actif: true });
  const B = versB(-73.5);
  support(p, A, 'P4'); const p5 = support(p, S, 'P5'); support(p, B, 'P6');
  troncon(p, [B, S, A]);   // tracé de P6 vers P4
  assert.equal(analyse(p, p5).amont.voisin_repere, 'P4');
  assert.equal(analyse(p, p5).resultat.sens, 'ANTIHORAIRE');
  // Repères effacés : le sens de tracé décide (voisin précédent = amont → P6 amont)
  for (const o of p.plans[0].objets) if (o.type === 'support') o.repere = '';
  const an = analyse(p, p5);
  assert.equal(an.regle, 'trace');
  assert.equal(an.amont.index, 0);
  assert.equal(an.resultat.arrondi, 74);
  assert.equal(an.resultat.sens, 'HORAIRE');
  // Deux tronçons distincts qui se rejoignent sur le support
  const p2 = projet({ actif: true });
  support(p2, A, 'P4'); const q5 = support(p2, S, 'P5'); support(p2, B, 'P6');
  troncon(p2, [A, S]); troncon(p2, [S, B]);
  const an2 = analyse(p2, q5);
  assert.equal(an2.cas, 'DEUX');
  assert.equal(an2.resultat.arrondi, 74);
  assert.equal(an2.resultat.sens, 'ANTIHORAIRE');
});

essai('7. support déporté (symbole avec ligne de rappel) → calcul sur l\'ancrage, valeur identique', () => {
  const p = projet({ actif: true });
  const { p5 } = ligne(p, -73.5);
  const r0 = analyse(p, p5).resultat;
  p5.deport = { dx: 40, dy: -25 };
  const r1 = analyse(p, p5).resultat;
  assert.equal(r1.arrondi, r0.arrondi);
  assert.equal(r1.sens, r0.sens);
  assert.ok(Math.abs(r1.brut - r0.brut) < 1e-12);
});

essai('8. tronçons à déposer, souterrain, façade, autre réseau → ignorés ; sommet dans la tolérance', () => {
  const p = projet({ actif: true });
  const { p5 } = ligne(p, -73.5);
  const C1 = { x: 300, y: 500 };
  troncon(p, [S, C1], { etatT: 'a_deposer' });
  troncon(p, [S, C1], { pose: 'souterrain' });
  troncon(p, [S, C1], { pose: 'facade' });
  troncon(p, [S, C1], { domaine: 'HTA' });
  troncon(p, [S, C1], { domaine: 'EP' });
  const an = analyse(p, p5);
  assert.equal(an.portees.length, 2);
  assert.equal(an.resultat.arrondi, 74);
  // tronçons « à remplacer » et existant retenus
  const p2 = projet({ actif: true });
  support(p2, A, 'P4'); const q5 = support(p2, S, 'P5'); support(p2, versB(-73.5), 'P6');
  troncon(p2, [A, { x: S.x + TOL * 0.5, y: S.y }], { etatT: 'a_reprendre' });   // sommet à moins de la tolérance
  troncon(p2, [{ x: S.x, y: S.y - TOL * 0.5 }, versB(-73.5)], { etatT: 'existant' });
  assert.equal(analyse(p2, q5).portees.length, 2);
  troncon(p2, [{ x: S.x + TOL * 1.5, y: S.y }, { x: 300, y: 600 }]);   // hors tolérance : ignoré
  assert.equal(analyse(p2, q5).portees.length, 2);
  // Coffret, ERAS, boîte de jonction : jamais d'angle
  const cof = M.nouvelObjetPonctuel('coffret', S.x, S.y, C('BTS', 'aerien', 'a_poser'));
  p2.plans[0].objets.push(cof);
  assert.equal(PC.analyserSupport(cof, p2.plans[0].objets, TOL), null);
  assert.equal(PC.recalculerAngles(p2.plans[0].objets, TOL) >= 1, true);
  assert.equal(cof.attributs.angle_gr, undefined);
});

essai('8 bis. sommet hors support dans la portée : calcul fait, motif « à compléter »', () => {
  const p = projet({ actif: true });
  support(p, A, 'P4'); const p5 = support(p, S, 'P5');
  troncon(p, [A, S, versB(-73.5), { x: 600, y: 0 }]);   // sommet intermédiaire sans ouvrage
  const an = analyse(p, p5);
  assert.equal(an.resultat.arrondi, 74);
  assert.ok(an.aval.hors_support);
  assert.deepEqual(an.motifs, [PC.MOTIFS_PIQUETAGE.hors_support]);
  assert.ok(M.motifsACompleter(p5, p.plans[0].objets).includes(PC.MOTIFS_PIQUETAGE.hors_support));
});

essai('9. 1 portée → aucun calcul ni motif ; 3 portées → aucun calcul tant que le choix n\'est pas fait', () => {
  const p = projet({ actif: true });
  const p4 = support(p, A, 'P4'); support(p, S, 'P5');
  troncon(p, [A, S]);
  let an = analyse(p, p4);
  assert.equal(an.cas, 'FIN');
  assert.equal(an.resultat, null);
  assert.deepEqual(an.motifs, []);
  PQ.recalculerAnglesPlan(p.plans[0], p);
  assert.equal(p4.attributs.angle_gr, null);
  assert.equal(M.estComplet(p4, p.plans[0].objets), true);
  // dérivation : trois portées
  const p2 = projet({ actif: true });
  const { p5, t } = ligne(p2, -73.5);
  support(p2, { x: 300, y: 550 }, 'P20');
  const d = troncon(p2, [S, { x: 300, y: 550 }]);
  an = analyse(p2, p5);
  assert.equal(an.cas, 'CHOIX');
  assert.equal(an.portees.length, 3);
  assert.equal(an.resultat, null);
  assert.deepEqual(an.motifs, [PC.MOTIFS_PIQUETAGE.choix]);
  PQ.recalculerAnglesPlan(p2.plans[0], p2);
  assert.equal(p5.attributs.angle_gr, null);
  // Tronçon traversant sans côté : ambigu, toujours rien
  p5.attributs.angle_portees = { amont_id: t.id, aval_id: t.id, amont_cote: null, aval_cote: null };
  assert.equal(analyse(p2, p5).resultat, null);
  // Choix complet : ligne principale
  p5.attributs.angle_portees = { amont_id: t.id, aval_id: t.id, amont_cote: 'precedent', aval_cote: 'suivant' };
  an = analyse(p2, p5);
  assert.equal(an.resultat.arrondi, 74);
  assert.equal(an.resultat.sens, 'ANTIHORAIRE');
  PQ.recalculerAnglesPlan(p2.plans[0], p2);
  assert.equal(p5.attributs.angle_gr, 74);
  // Choix vers la dérivation : P4 → P5 → P20 (100 gr, horaire : vers le bas de l'écran)
  p5.attributs.angle_portees = { amont_id: t.id, aval_id: d.id, amont_cote: 'precedent', aval_cote: null };
  an = analyse(p2, p5);
  assert.equal(an.resultat.arrondi, 100);
  assert.equal(an.resultat.sens, 'HORAIRE');
});

/* ---------- 10 à 12 : saisie manuelle, activation, historique ---------- */
function deplacerP6(p, x6, B6) {
  const { p6, t } = x6;
  p6.x = B6.x; p6.y = B6.y;
  t.points[t.points.length - 1] = { x: B6.x, y: B6.y };
}

essai('10. valeur manuelle conservée après déplacement ; « Revenir au calcul » la remplace', () => {
  const p = projet({ actif: true });
  const l = ligne(p, -73.5);
  H.reinitialiserHistorique();
  H.valider('init');
  assert.equal(l.p5.attributs.angle_gr, 74);
  l.p5.attributs.angle_gr = 72; l.p5.attributs.angle_source = 'MANUEL';   // saisie dans la fiche
  H.valider('Angle');
  deplacerP6(p, l, versB(-50));
  H.valider('Déplacement');
  assert.equal(l.p5.attributs.angle_gr, 72);
  assert.equal(l.p5.attributs.angle_source, 'MANUEL');
  assert.equal(PC.arrondiPiquetage(l.p5.attributs.angle_brut_gr), 50, 'valeur calculée tenue à jour pour la fiche');
  assert.deepEqual(M.motifsACompleter(l.p5, p.plans[0].objets), [], 'manuel ≠ calculé : pas de motif');
  // Étiquette : saisie manuelle au format à une décimale
  l.p5.attributs.angle_gr = 72.5; H.valider('Angle');
  assert.equal(M.formaterAngle(l.p5.attributs.angle_gr), 'φ = 72,5\u00A0gr');
  // Revenir au calcul (fiche)
  l.p5.attributs.angle_source = null; l.p5.attributs.angle_gr = null;
  H.valider('Angle : retour au calcul');
  assert.equal(l.p5.attributs.angle_gr, 50);
  assert.equal(l.p5.attributs.angle_source, 'CALCULE');
});

essai('10 bis. descriptif et étiquette reprennent la valeur arrondie', () => {
  const p = projet({ actif: true });
  const l = ligne(p, -73.5);
  H.reinitialiserHistorique();
  H.valider('init');
  const r = SY.primitivesObjet(l.p5, p.reglages);
  const textes = JSON.stringify(r);
  assert.ok(textes.includes('φ = 74'), 'ligne φ de l\'étiquette');
  DS.genererDescriptif(p.plans[0], p);
  const e = p.plans[0].descriptif.sections.find((s) => s.cle === 'ouvrages').entrees.find((x) => DS.texteSegments(x.repere) === 'P5.');
  assert.ok(DS.texteLigne(e.lignes[0]).startsWith('φ = 74'), DS.texteLigne(e.lignes[0]));
});

essai('11. désactivation → valeurs conservées, plus de recalcul après déplacement', () => {
  const p = projet({ actif: true });
  const l = ligne(p, -73.5);
  H.reinitialiserHistorique();
  H.valider('init');
  assert.equal(l.p5.attributs.angle_gr, 74);
  p.reglages.angle_piquetage_auto = false;
  deplacerP6(p, l, versB(-20));
  H.valider('Déplacement');
  assert.equal(l.p5.attributs.angle_gr, 74);
  assert.equal(l.p5.attributs.angle_source, 'CALCULE');
  assert.equal(M.estComplet(l.p5, p.plans[0].objets), true);
  // modifiable à la main
  l.p5.attributs.angle_gr = 20; l.p5.attributs.angle_source = 'MANUEL'; H.valider('Angle');
  assert.equal(l.p5.attributs.angle_gr, 20);
  // réactivation : la saisie reste manuelle
  p.reglages.angle_piquetage_auto = true; H.valider('activé');
  assert.equal(l.p5.attributs.angle_gr, 20);
  // Recalculer tous les angles : remplace la saisie
  PQ.recalculerAnglesPlan(p.plans[0], p, { remplacerManuels: true });
  assert.equal(l.p5.attributs.angle_gr, 20, 'déviation de 20 gr exactement');
  assert.equal(l.p5.attributs.angle_source, 'CALCULE');
});

essai('12. annulation d\'un déplacement → angle revenu à sa valeur précédente en une seule étape', () => {
  const p = projet({ actif: true });
  const l = ligne(p, -73.5);
  H.reinitialiserHistorique();
  H.valider('init');
  assert.equal(etat.plan.objets.find((o) => o.id === l.p5.id).attributs.angle_gr, 74);
  deplacerP6(p, l, versB(-30.4));
  H.valider('Déplacement');
  const apres = etat.plan.objets.find((o) => o.id === l.p5.id).attributs;
  assert.equal(apres.angle_gr, 31);
  assert.ok(H.annuler());
  const av = etat.plan.objets.find((o) => o.id === l.p5.id).attributs;
  assert.equal(av.angle_gr, 74);
  assert.equal(av.angle_sens, 'ANTIHORAIRE');
  assert.ok(Math.abs(av.angle_brut_gr - 73.5) <= 1e-9);
  assert.ok(H.retablir());
  assert.equal(etat.plan.objets.find((o) => o.id === l.p5.id).attributs.angle_gr, 31);
  // Support déplacé seul hors de ses portées : l'angle calculé est effacé (H-353)
  const s5 = etat.plan.objets.find((o) => o.id === l.p5.id);
  s5.x += 100; H.valider('Déplacement');
  assert.equal(s5.attributs.angle_gr, null);
  assert.equal(s5.attributs.angle_source, null);
});

/* ---------- 13 : migration ---------- */
essai('13. migration 16 → 17 avec et sans angle saisi ; idempotente ; fonction désactivée', () => {
  const p = projet();
  const s1 = support(p, A, 'P1'), s2 = support(p, S, 'P2');
  s1.attributs.angle_gr = 45;
  const v16 = M.cloner(p);
  v16.version_schema = 16;
  delete v16.reglages.angle_piquetage_auto;
  for (const o of v16.plans[0].objets) for (const k of ['angle_source', 'angle_brut_gr', 'angle_sens', 'angle_inverse', 'angle_portees']) delete o.attributs[k];
  const m = M.migrerProjet(v16);
  assert.equal(m.version_schema, 18);   // v1.8.0 : schéma 18
  assert.equal(m.reglages.angle_piquetage_auto, false);
  const [m1, m2] = m.plans[0].objets;
  assert.equal(m1.attributs.angle_gr, 45);
  assert.equal(m1.attributs.angle_source, 'MANUEL');
  assert.equal(m2.attributs.angle_gr, null);
  assert.equal(m2.attributs.angle_source, null);
  for (const o of [m1, m2]) {
    assert.equal(o.attributs.angle_brut_gr, null);
    assert.equal(o.attributs.angle_sens, null);
    assert.equal(o.attributs.angle_inverse, false);
    assert.equal(o.attributs.angle_portees, null);
  }
  const deux = M.migrerProjet(M.cloner(m));
  assert.deepEqual(deux.plans[0].objets.map((o) => o.attributs), m.plans[0].objets.map((o) => o.attributs), 'idempotente');
  // Objets neufs : champs présents, source vide
  assert.deepEqual(Object.keys(M.anglePiquetageParDefaut()).every((k) => k in s2.attributs), true);
  // Rendu inchangé tant que la fonction n'est pas activée : primitives identiques avant / après migration
  assert.equal(JSON.stringify(SY.primitivesObjet(m1, m.reglages)), JSON.stringify(SY.primitivesObjet(s1, p.reglages)));
});

essai('cohérence : liste des ouvrages ponctuels du module pur = modele.js', () => {
  assert.deepEqual(PC.TYPES_OUVRAGES_PONCTUELS, M.TYPES_PONCTUELS);
  assert.equal(PC.texteConstruction(PC.angleDeviation(A, S, versB(-73.5))), '73,5 \u2192 74\u00A0gr');
});

let n = 0;
for (const [nom, fn] of essais) { try { await fn(); n++; console.log('ok  ' + nom); } catch (e) { console.error('ÉCHEC  ' + nom); throw e; } }
console.log(n + ' essais réussis');
