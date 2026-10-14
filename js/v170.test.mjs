/* v170.test.mjs — essais v1.7.0 : notation des sections HTA/S (§1), « CIBE type 1/2 » au descriptif (§2), rendu double des
 * tronçons aériens / façade à remplacer (§3), descriptif et fourniture d'un tronçon à remplacer (§4), indicateur de
 * longueur sans écriture de longueur_m (§5), raccourcis transformateurs et encastrement (§6, §7), 1/50 000 (§8), cartouche
 * de repère au descriptif (§9), références des photos (§10), migration 14 → 15.
 * Lancer : node js/v170.test.mjs   (non précaché par le service worker, comme les autres essais)
 * Mesure du texte : largeur approchée 0,55 × taille par caractère (pas de canvas sous Node). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }) };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };

const { etat } = await import('./etat.js');
const { definirMesureur } = await import('./primitives.js');
const { CHARTE, MM, SECTIONS_AFFICHAGE, sectionPourAffichage, remplacerSectionsAffichage, RACCOURCIS_MATERIEL, ABREVIATIONS_ETIQUETTE, libelleEtiquetteMateriel } = await import('./charte.js');
const M = await import('./modele.js');
const { actualiserDesignation } = await import('./designation.js');
const DS = await import('./descriptif.js');
const { primitivesDescriptifPlan, geometrieCartouche, pagesAnnexe } = await import('./descriptif-rendu.js');
const SY = await import('./symboles.js');
const { echantillonTroncon, entreesLegende } = await import('./legende.js');
const N = await import('./nomenclature.js');
const PC = await import('./plans-calcul.js');
const SI = await import('./situation.js');
const MC = await import('./mesure-calcul.js');
const IL = await import('./indicateur-longueur.js');
const PH = await import('./photos.js');

const ici = dirname(fileURLToPath(import.meta.url));
const NOMENCLATURE_BRUTE = readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8');
etat.nomenclature = JSON.parse(NOMENCLATURE_BRUTE);
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
const pt = (x, y) => ({ x, y });
function projet() { const p = M.nouveauProjet({ nom: 'ESSAI v1.7.0', commune: 'Furiani' }); etat.projet = p; etat.plan = p.plans[0]; return p; }
function ponctuel(p, type, x, y, courant, attributs = {}, extra = {}) { const o = M.nouvelObjetPonctuel(type, x, y, courant, attributs); Object.assign(o, extra); actualiserDesignation(o); p.plans[0].objets.push(o); return o; }
function troncon(p, pts, courant, attributs = {}, extra = {}) { const o = M.nouveauTroncon(pts, courant, attributs); Object.assign(o, extra); actualiserDesignation(o); p.plans[0].objets.push(o); return o; }
const generer = (p) => { for (const o of p.plans[0].objets) actualiserDesignation(o); DS.genererDescriptif(p.plans[0], p); return p.plans[0].descriptif; };
const entrees = (d, cle) => d.sections.find((s) => s.cle === cle).entrees;
const lignes = (e) => e.lignes.filter((l) => !l.supprimee).map((l) => DS.texteLigne(l));
const groupe = (d, re) => entrees(d, 'troncons').find((e) => re.test(DS.texteLigne(e.lignes[0])));
const remplacer = (t, cible) => { t.remplacement_par = { article_id: null, designation: cible, attributs: { section: cible } }; actualiserDesignation(t); return t; };

/* Chaîne de supports A1 → A4 (repères manuels) et trois tronçons de 40 m à remplacer. */
function chaineARemplacer(domaine, pose, section, cible, longueurs = [40, 40, 40]) {
  const p = projet();
  for (let i = 1; i <= 4; i++) ponctuel(p, 'support', i * 100, 0, C(domaine, 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 }, { repere: 'A' + i, repere_manuel: true });
  const t = [];
  for (let i = 1; i < 4; i++) t.push(remplacer(troncon(p, [pt(i * 100, 0), pt((i + 1) * 100, 0)], C(domaine, pose, 'a_reprendre'), { section, longueur_m: longueurs[i - 1] }), cible));
  return { p, t };
}

/* ---------- §1 Sections HTA souterraines ---------- */
essai('§1 notation courte : affichage seulement, valeur stockée et article inchangés, BT / BRT / EP non concernés', () => {
  assert.deepEqual(Object.values(SECTIONS_AFFICHAGE), ['3x95²', '3x150²', '3x240²']);
  for (const [stockee, aff] of Object.entries(SECTIONS_AFFICHAGE)) assert.equal(sectionPourAffichage(stockee), aff);
  for (const s of ['3 x 70 + 54,6', '3 X 240 + 95 mm² ou 3 x 240 + 115 mm²', '4 x 25', '3 X 6 mm² cuivre']) assert.equal(sectionPourAffichage(s), s);
  // Les sections stockées sont exactement celles de nomenclature.json (articles a0317 à a0319)
  const art = (id) => etat.nomenclature.articles.find((a) => a.id === id);
  assert.deepEqual(['a0317', 'a0318', 'a0319'].map((id) => art(id).attributs.section), Object.keys(SECTIONS_AFFICHAGE));
  const p = projet();
  const h = troncon(p, [pt(0, 0), pt(100, 0)], C('HTA', 'souterrain', 'a_poser'), { section: '3 X 240 — 3x1x240²', longueur_m: 59, fourreau: 'TPC Ø160' });
  h.ref_article = 'a0319';
  assert.equal(h.attributs.section, '3 X 240 — 3x1x240²', 'valeur stockée inchangée');
  assert.equal(M.designationAffichee(h), '3x240² TPC Ø160');
  assert.equal(M.etiquetteTroncon(h, {}), '3x240² TPC Ø160 : 59\u00A0m');
  h.designation_manuelle = 'HTA 3 X 240 — 3x1x240² manuelle';
  assert.equal(M.designationAffichee(h), 'HTA 3 X 240 — 3x1x240² manuelle', 'désignation manuelle jamais retouchée');
  h.designation_manuelle = '';
  const d = generer(p);
  assert.deepEqual(lignes(groupe(d, /HTA\/S/)).filter((l) => /3x240²/.test(l)).length >= 2, true);
  assert.ok(lignes(groupe(d, /HTA\/S/)).some((l) => /^Fourniture 3x240² : /.test(l)));
  assert.equal(h.ref_article, 'a0319');
});

essai('§1 empreinte sur la valeur stockée : ligne manuelle conservée, pas d\'alerte « objet source modifié »', () => {
  const p = projet();
  troncon(p, [pt(0, 0), pt(100, 0)], C('HTA', 'souterrain', 'a_poser'), { section: '3 X 150 — 3x1x150²', longueur_m: 20 });
  const d = generer(p);
  const e = groupe(d, /HTA\/S/);
  const tete = e.lignes.find((l) => l.cle_auto === 'tete');
  DS.modifierLigne(tete, { segments: [[{ t: 'HTA/S à construire 3 X 150 — 3x1x150² (texte saisi)' }]] });
  // Empreinte « à l'ancienne » (valeurs stockées) : la remise à jour ne voit aucun changement de la source
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.ok(!e.alertes.includes('source_modifiee'));
  assert.equal(DS.texteLigne(tete), 'HTA/S à construire 3 X 150 — 3x1x150² (texte saisi)');
});

/* ---------- §2 CIBE ---------- */
essai('§2 « CIBE type 1 / 2 » au descriptif ; puces et étiquette du plan inchangées', () => {
  const p = projet();
  const s = ponctuel(p, 'support', 0, 0, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 }, { repere: 'A1', repere_manuel: true });
  N.ajouterOuIncrementerArticle(s, 'a0333');
  N.ajouterOuIncrementerArticle(s, 'a0334');
  const c = ponctuel(p, 'coffret', 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'CIBE2' }, { repere: 'C1', repere_manuel: true });
  const d = generer(p);
  const ouv = entrees(d, 'ouvrages');
  const lA1 = lignes(ouv.find((e) => DS.texteSegments(e.repere) === 'A1.'));
  assert.ok(lA1.includes('Pose 1 CIBE type 1') && lA1.includes('Pose 1 CIBE type 2'), lA1.join(' | '));
  assert.equal(lignes(ouv.find((e) => DS.texteSegments(e.repere) === 'C1.'))[0], 'Pose coffret CIBE type 2');
  assert.equal(ABREVIATIONS_ETIQUETTE.a0333, 'CIBE 1');
  assert.deepEqual(M.lignesMaterielEtiquette(s), ['CIBE 1', 'CIBE 2']);
  assert.ok(N.raccourcisMateriel('coffret').some((e) => e.article === 'a0333' && e.puce === 'CIBE 1'));
  assert.equal(c.attributs.sigle, 'CIBE2');
});

/* ---------- §3 Rendu double ---------- */
essai('§3 aérien / façade à remplacer : deux traits parallèles, entraxe 2 × épaisseur × échelle, hachures raccourcies', () => {
  for (const [domaine, pose] of [['BTS', 'aerien'], ['HTA', 'aerien'], ['BRT', 'aerien'], ['EP', 'aerien'], ['BTS', 'facade']]) {
    for (const e of [0.5, 1, 3]) {
      const o = { type: 'troncon', domaine, pose, etat: 'a_reprendre', points: [pt(0, 0), pt(100, 0)], echelle_symbole: e, echelle_plan_origine: null, attributs: { cote_depose: 'droite' } };
      assert.ok(SY.rendreEnDouble(o));
      const prims = SY.primitivesTroncon(o);
      const sP = CHARTE.reseaux[domaine].couleur.a_poser;
      const polys = prims.filter((x) => x.t === 'poly');
      const pose_ = polys.find((x) => x.couleur === sP);
      const ep = CHARTE.reseaux[domaine].epaisseur;
      const sD = SY.primitivesTroncon({ ...o, etat: 'existant' }).filter((x) => x.t === 'poly').pop().couleur;
      const depose = polys.filter((x) => x.couleur === sD).pop();
      assert.ok(pose_ && depose, domaine + ' ' + pose);
      const entraxe = depose.points[0].y - pose_.points[0].y;
      assert.ok(Math.abs(entraxe - 2 * ep * e) < 1e-9, domaine + ' entraxe ' + entraxe);
      assert.ok(pose_.points[0].y < 0, 'à poser à gauche du sens de tracé (au-dessus pour un tracé vers la droite)');
      assert.equal(pose_.extremite, 'nette');
      assert.equal(pose_.points[0].x, 0); assert.equal(pose_.points[1].x, 100);   // au droit des extrémités
      // Hachures : jamais au-delà du bord du trait à poser
      const hach = prims.filter((x) => x.t === 'ligne');
      assert.ok(hach.length >= 3);
      const bordPose = pose_.points[0].y + (ep * e) / 2;
      for (const h of hach) assert.ok(Math.min(h.y1, h.y2) > bordPose, domaine + ' e=' + e + ' : hachure sur le trait à poser');
      const L = Math.hypot(hach[0].x2 - hach[0].x1, hach[0].y2 - hach[0].y1);
      assert.ok(L < CHARTE.hachures_troncon.longueur * e, 'hachures plus courtes que celles de la v1.6.1');
      if (e === 1) assert.ok(Math.abs(L - Math.min(ep + 0.8 * MM, L)) < 1e-9);
    }
  }
});

essai('§3 « Inverser les côtés », souterrain inchangé, légende et échantillon identiques', () => {
  const base = { type: 'troncon', domaine: 'BTS', pose: 'aerien', etat: 'a_reprendre', points: [pt(0, 0), pt(100, 0)], echelle_symbole: 1, echelle_plan_origine: null };
  const g = SY.primitivesTroncon({ ...base, attributs: { cote_depose: 'gauche' } });
  const bleu = g.filter((x) => x.t === 'poly' && x.couleur === CHARTE.reseaux.BTS.couleur.a_poser).pop();
  assert.ok(bleu.points[0].y > 0, 'côtés inversés : à poser à droite');
  const sout = SY.primitivesTroncon({ ...base, pose: 'souterrain', attributs: {} });
  assert.ok(!SY.rendreEnDouble({ ...base, pose: 'souterrain' }));
  assert.ok(sout.some((x) => x.t === 'poly' && x.tirete && x.couleur === CHARTE.a_reprendre_troncon.couleur), 'souterrain : liseré discontinu conservé');
  const ech = echantillonTroncon('BTS', 'aerien', 'a_reprendre', 0, 100, 0);
  assert.deepEqual(ech, SY.primitivesRemplacementDouble([pt(0, 0), pt(100, 0)], 'BTS', 'aerien', 1, 'droite'));
  assert.ok(ech.some((x) => x.couleur === CHARTE.reseaux.BTS.couleur.a_poser));
  const ent = entreesLegende([{ ...base, attributs: {} }]);
  assert.equal(ent.length, 1);
  // remplaçant non renseigné : le trait à poser est tout de même dessiné, l'objet reste « à compléter »
  const p = projet();
  const t = troncon(p, [pt(0, 0), pt(100, 0)], C('BTS', 'aerien', 'a_reprendre'), { section: '3 x 35 + 54,6 Alu' });
  assert.ok(SY.primitivesTroncon(t).some((x) => x.couleur === CHARTE.reseaux.BTS.couleur.a_poser));
  M.mettreAJourComplet(t, p.plans[0].objets);
  assert.equal(t.complet, false);
});

/* ---------- §4 Descriptif d'un tronçon à remplacer ---------- */
essai('§4 BT aérienne : tête, section à déposer / à poser, fourniture × 1,08 sur la section à poser', () => {
  const { p } = chaineARemplacer('BTS', 'aerien', '3 x 35 + 54,6 Alu', '3 x 70 + 54,6');
  const d = generer(p);
  const e = groupe(d, /^BTA à remplacer/);
  assert.deepEqual(lignes(e), ['BTA à remplacer de A1 à A4', 'Section à déposer 3 x 35 + 54,6 Alu : 120 ml', 'Section à poser 3 x 70 + 54,6 : 120 ml', 'Fourniture 3 x 70 + 54,6 : 130 ml']);
  const lp = e.lignes.find((l) => l.cle_auto === 'section_pose');
  assert.ok(lp.segments[0].every((s) => s.c === CHARTE.reseaux.BTS.couleur.a_poser), 'section à poser à la couleur du câble');
  assert.ok(e.lignes.find((l) => l.cle_auto === 'section_depose').segments[0].every((s) => !s.c), 'section à déposer en noir');
  assert.ok(e.lignes.find((l) => l.cle_auto === 'tete').segments[0].some((s) => s.t === 'A1' && s.g), 'repères en gras');
});

essai('§4 longueur_depose_m vide = longueur posée ; saisie = longueur déposée, fourniture inchangée', () => {
  const { p, t } = chaineARemplacer('BTS', 'aerien', 'Nu < 22 mm²', '3 x 70 + 54,6');
  t[0].attributs.longueur_depose_m = 45;
  const d = generer(p);
  const l = lignes(groupe(d, /^BTA à remplacer/));
  assert.ok(l.includes('Section à déposer Nu < 22 mm² : 125 ml'), l.join(' | '));
  assert.ok(l.includes('Section à poser 3 x 70 + 54,6 : 120 ml'));
  assert.ok(l.includes('Fourniture 3 x 70 + 54,6 : 130 ml'));
  assert.equal(M.longueurDepose(t[1]), 40);
  assert.equal(M.longueurDepose(t[0]), 45);
});

essai('§4 HTA aérienne (× 1,08), façade (sans majoration), BT souterraine (+ 2 ml par extrémité), BRT sans fourniture saisie', () => {
  let r = chaineARemplacer('HTA', 'aerien', '54,6', '59,7', [100, 50, 50]);
  let l = lignes(groupe(generer(r.p), /^HTA aérienne à remplacer/));
  assert.deepEqual(l, ['HTA aérienne à remplacer de A1 à A4', 'Section à déposer 54,6 : 200 ml', 'Section à poser 59,7 : 200 ml', 'Fourniture 59,7 : 216 ml']);
  r = chaineARemplacer('BTS', 'facade', '3 x 35 + 54,6 Alu', '3 x 70 + 54,6');
  l = lignes(groupe(generer(r.p), /^BT façade à remplacer/));
  assert.ok(l.includes('Fourniture 3 x 70 + 54,6 : 120 ml'), l.join(' | '));
  r = chaineARemplacer('BTS', 'souterrain', '3 X 95 + 50 mm²', '3 X 150 + 70 mm² ou 3 x 150 + 95 mm²');
  l = lignes(groupe(generer(r.p), /^BTS à remplacer/));
  assert.ok(l.includes('Fourniture 3 X 150 + 70 mm² ou 3 x 150 + 95 mm² : 132 ml'), l.join(' | '));   // 120 + 3 × 2 × 2
  r = chaineARemplacer('BRT', 'aerien', '2 x 16', '4 x 25');
  const e = groupe(generer(r.p), /^BRT à remplacer/);
  l = lignes(e);
  assert.deepEqual(l, ['BRT à remplacer de A1 à A4', 'Section à déposer 2 x 16 : 120 ml', 'Section à poser 4 x 25 : 120 ml'], 'BRT : aucune ligne de fourniture sans saisie');
  e.champs.fourniture = '125';
  DS.mettreAJourDescriptif(r.p.plans[0], r.p);
  assert.ok(lignes(e).includes('Fourniture 4 x 25 : 125 ml'));
});

essai('§4 regroupement par section à déposer ET à poser ; ligne manuelle conservée', () => {
  const { p, t } = chaineARemplacer('BTS', 'aerien', '3 x 35 + 54,6 Alu', '3 x 70 + 54,6');
  remplacer(t[2], '3 x 150 + 70');
  const d = generer(p);
  const gr = entrees(d, 'troncons').filter((e) => /à remplacer/.test(DS.texteLigne(e.lignes[0])));
  assert.equal(gr.length, 2);
  const e = gr.find((x) => lignes(x).some((y) => /3 x 150 \+ 70 : 40 ml/.test(y)));
  const lp = e.lignes.find((l) => l.cle_auto === 'section_pose');
  DS.modifierLigne(lp, { segments: [[{ t: 'Section à poser 3 x 150 + 70 (texte saisi)' }]] });
  t[2].attributs.longueur_m = 42;
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.equal(DS.texteLigne(lp), 'Section à poser 3 x 150 + 70 (texte saisi)');
  assert.ok(e.alertes.includes('source_modifiee'));
});

/* ---------- §5 Indicateur de longueur ---------- */
essai('§5 longueur indicative : calibration, échelle déclarée « non vérifié », sans calibration ; jamais d\'écriture', () => {
  const pts = [pt(0, 0), pt(300, 400), pt(300, 500)];   // 600 unités
  const T = CHARTE.indicateur_longueur.textes;
  assert.equal(MC.longueurIndicative(pts, { code: 'CALIBREE', m_par_unite: 0.2 }, T).texte, '≈ 120 m');
  assert.equal(MC.longueurIndicative(pts, { code: 'NOMINALE', m_par_unite: MC.mParUniteNominal(500) }, T).texte, '≈ 106 m (non vérifié)');
  assert.equal(MC.longueurIndicative(pts, { code: 'AUCUNE', m_par_unite: null }, T).texte, '— m (plan non calibré)');
  assert.equal(MC.longueurIndicative([pt(0, 0), pt(10, 0)], { code: 'CALIBREE', m_par_unite: 0.53 }, T).texte, '≈ 5,3 m');
  const p = projet();
  p.echelle_plan = 500;
  p.plans[0].fond = { fond_id: 'x', type: 'pdf', page: 1, largeur: 1190, hauteur: 842 };
  const t = troncon(p, pts, C('BTS', 'aerien', 'a_poser'), { section: '3 x 70 + 54,6' });
  const avant = JSON.stringify(t);
  assert.equal(IL.texteLongueur(t.points), '≈ 106 m (non vérifié)');
  assert.equal(IL.mentionFiche(t), 'Mesure indicative sur plan : ≈ 106 m (non vérifié)');
  IL.afficherIndicateur(t.points, t.points[2], 'aerien');   // sans DOM (bulle absente) : sans effet
  assert.equal(JSON.stringify(t), avant, 'aucun attribut écrit');
  assert.equal(t.attributs.longueur_m, null);
  // Réglage par défaut : v1.7.1 — toutes poses (souterrain et fourreaux activés après validation), désactivable
  etat.prefs.indicateur_longueur = undefined;
  assert.equal(IL.indicateurActif('aerien'), true);
  assert.equal(IL.indicateurActif('facade'), true);
  assert.equal(IL.indicateurActif('souterrain'), true);
  assert.equal(IL.indicateurActif('aerien', 'fourreau'), true);
  t.pose = 'souterrain';
  assert.ok(IL.mentionFiche(t).startsWith('Mesure indicative'));
  etat.prefs.indicateur_longueur = { aerien: true, souterrain: false };
  assert.equal(IL.mentionFiche(t), '');
  etat.prefs.indicateur_longueur = undefined;
});

/* ---------- §6 §7 Raccourcis ---------- */
essai('§6 transformateurs en cabine 160 à 1000 kVA, jamais sur poteau ; descriptif au libellé', () => {
  const ids = RACCOURCIS_MATERIEL.poste.filter((e) => e.article && /^a03(8[1-9]|9[01])$/.test(e.article)).map((e) => e.article);
  assert.deepEqual(ids, ['a0381', 'a0382', 'a0383', 'a0384', 'a0385']);
  for (const id of ids) assert.equal(N.articleParId(id).attributs.implantation, 'CABINE');
  const p = projet();
  const ps = ponctuel(p, 'poste', 0, 0, C('HTA', 'souterrain', 'a_poser'), { sigle: 'PSS-A' }, { repere: 'P1', repere_manuel: true });
  N.ajouterOuIncrementerArticle(ps, 'a0383');
  const l = lignes(entrees(generer(p), 'ouvrages')[0]);
  assert.ok(l.includes('Pose 1 Transformateur en cabine 400 kVA'), l.join(' | '));
});

essai('§7 encastrement de coffret : matériel libre, quantité par appui, puce sur le plan, texte complet au descriptif', () => {
  const lib = RACCOURCIS_MATERIEL.coffret.filter((e) => e.libre);
  assert.deepEqual(lib.map((e) => e.puce), ['Encast. agglo / PS', 'Encast. béton', 'Encast. pierres maç.']);
  assert.ok(lib.every((e) => !e.article), 'jamais rattachés à un article');
  for (const e of lib) assert.ok(!/2-06[123]/.test(e.libre + e.puce), 'références BPU jamais affichées');
  const p = projet();
  const c = ponctuel(p, 'coffret', 0, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM450' }, { repere: 'C1', repere_manuel: true });
  N.ajouterOuIncrementerLibre(c, lib[1].libre);
  assert.deepEqual(c.materiel_associe, [{ source: 'LIBRE', ref_article: null, libelle: 'Encastrement coffret dans mur en béton', quantite: 1, quantite_saisie: false, unite: 'U', package: null }]);
  assert.equal(libelleEtiquetteMateriel(c.materiel_associe[0]), 'Encast. béton');
  let l = lignes(entrees(generer(p), 'ouvrages')[0]);
  assert.ok(l.includes('Encastrement coffret dans mur en béton'), l.join(' | '));
  N.ajouterOuIncrementerLibre(c, lib[1].libre);
  assert.equal(c.materiel_associe.length, 1);
  assert.equal(c.materiel_associe[0].quantite, 2);
  l = lignes(entrees(generer(p), 'ouvrages')[0]);
  assert.ok(l.includes('2 Encastrement coffret dans mur en béton'), l.join(' | '));
  assert.ok(!JSON.stringify(p).includes('2-06'), 'aucune référence BPU stockée dans le projet');
  assert.equal(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'), NOMENCLATURE_BRUTE);
});

/* ---------- §8 1/50 000 ---------- */
essai('§8 plan de situation au 1/50 000 : niveau ≥ zoom_min, indication, plafond cote_max_px', () => {
  assert.deepEqual(CHARTE.situation.echelles, [2500, 5000, 10000, 25000, 50000, 100000]);   // v1.7.1 : 1/100 000
  assert.equal(CHARTE.situation.echelle_defaut, 5000);
  for (const lat of [41.4, 42, 43]) {
    const r = SI.niveauPourEchelle(lat, 50000);
    assert.ok(r.zoom >= CHARTE.situation.zoom_min && r.atteint && r.pxParMm >= CHARTE.situation.px_par_mm_min);
  }
  assert.equal(SI.libelleEchelle(50000), 'Éch. 1/50\u00A0000');
  const c = SI.cartePourEchelle(42, 50000, 70, 52.5);
  assert.equal(c.depasse, false);
  const grand = SI.cartePourEchelle(42, 50000, 600, 400);
  assert.equal(grand.depasse, true, 'avertissement : carte trop grande');
  assert.equal(SI.echelleProposee(42, 50000, 600, 400), null, 'aucune échelle plus petite : réduire la carte');
  assert.equal(SI.echelleProposee(42, 25000, 600, 400), null);
});

/* ---------- §9 Cartouche au descriptif ---------- */
essai('§9 cartouche de repère : diamètre ≥ 1,25 × hauteur de ligne, élargi pour A10, couleur choisie, annexe sans chevauchement', () => {
  const K = CHARTE.descriptif;
  const hL = K.corps.taille * K.interligne;
  const g1 = geometrieCartouche('S1.');
  assert.equal(g1.texte, 'S1');
  assert.ok(Math.abs(g1.diametre - 1.25 * hL) < 1e-9);
  const g10 = geometrieCartouche('A10.');
  assert.ok(g10.diametre >= g1.diametre);
  const g12 = geometrieCartouche('BJ12');
  assert.ok(g12.diametre > g1.diametre, 'repère long : cercle élargi');
  assert.equal(geometrieCartouche('S1.', '#E30000').couleur, '#000000', 'ancien rouge par défaut lu comme non choisi');
  assert.equal(geometrieCartouche('S1.', '#14307d').couleur, '#14307D');
  assert.equal(geometrieCartouche(''), null);
  const p = projet();
  for (let i = 1; i <= 12; i++) ponctuel(p, 'support', i * 100, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 }, { repere: 'A' + i, repere_manuel: true });
  const d = generer(p);
  const prims = primitivesDescriptifPlan(p.plans[0], p);
  assert.ok(prims.some((x) => x.t === 'texte' && x.texte === 'A10' && x.couleur === '#000000'));
  d.sortie_pdf = 'annexe';
  for (const pg of pagesAnnexe(p.plans[0], p, 595.28, 841.89)) {
    const cercles = pg.filter((x) => x.t === 'cercle');
    const textes = pg.filter((x) => x.t === 'texte' && x.ancre !== 'milieu' && !/Descriptif/.test(x.texte));
    for (const c of cercles) {
      assert.ok(c.cy - c.r >= 10 * MM - 1e-6, 'cercle dans la marge haute');
      // aucun texte du corps à l'intérieur d'un cercle
      for (const t of textes) assert.ok(!(t.x > c.cx - c.r && t.x < c.cx + c.r && t.y > c.cy - c.r && t.y < c.cy + c.r), 'chevauchement ' + t.texte);
    }
    const tri = cercles.slice().sort((a, b) => a.cy - b.cy);
    for (let i = 1; i < tri.length; i++) if (Math.abs(tri[i].cx - tri[i - 1].cx) < 1e-6) assert.ok(tri[i].cy - tri[i].r >= tri[i - 1].cy + tri[i - 1].r - 1e-6, 'cartouches superposés');
  }
});

/* ---------- §10 Photos ---------- */
essai('§10 photos : références comptées par fondsReferences, remappées à l\'import, absentes retirées', () => {
  const p = projet();
  const s = ponctuel(p, 'support', 0, 0, C('BTS', 'aerien', 'existant'), { materiau: 'BOIS', classe: 'S', hauteur_m: 10 });
  const t = troncon(p, [pt(0, 0), pt(10, 0)], C('BTS', 'aerien', 'existant'), {});
  assert.deepEqual(s.photos, []); assert.deepEqual(t.photos, []);
  s.photos.push({ id: 'ph1', fond_id: 'P1', etat_photo: 'existant', legende: '', date: '2026-10-11T10:00:00.000Z', origine: 'appareil' });
  t.photos.push({ id: 'ph2', fond_id: 'P2', etat_photo: 'autre', legende: 'RD 81', date: '2026-10-11T10:01:00.000Z', origine: 'import' });
  assert.deepEqual([...PC.fondsReferences(p)].sort(), ['P1', 'P2']);
  const copie = JSON.parse(JSON.stringify(p));
  const n = PC.remapperImages(copie, { P1: 'Q1' }, { retirerAbsentes: true });
  assert.equal(n, 1);
  const os = copie.plans[0].objets;
  assert.equal(os.find((o) => o.type === 'support').photos[0].fond_id, 'Q1');
  assert.deepEqual(os.find((o) => o.type === 'troncon').photos, [], 'photo absente retirée, objet conservé');
  assert.equal(os.length, 2);
  assert.equal(M.nbPhotos(s), 1);
  assert.ok(M.porteurPhotos(s) && M.porteurPhotos(t) && !M.porteurPhotos({ type: 'note' }) && !M.porteurPhotos({ type: 'masque' }) && !M.porteurPhotos({ type: 'image' }));
});

essai('§10 nom de la copie de l\'original : {affaire}_{repère}_{AAAAMMJJ-HHMMSS}.jpg', () => {
  const d = new Date(2026, 9, 11, 14, 32, 5);
  assert.equal(PH.horodatage(d), '20261011-143205');
  assert.equal(PH.nomCopieOriginal('LOT FITELLE', 'A4', d), 'LOT-FITELLE_A4_20261011-143205.jpg');
  assert.equal(PH.nomCopieOriginal('Enf. Rue/Haute : n°3', '', d), 'Enf.-Rue-Haute-n°3_objet_20261011-143205.jpg');
  assert.equal(PH.etatPhotoParDefaut({ etat: 'a_reprendre' }), 'a_reprendre');
});

/* ---------- §12 Migration 14 → 15 ---------- */
essai('migration 14 → 15 : photos, longueur à déposer, côté ; clés « à remplacer » du descriptif recalculées sans perte', () => {
  const { p, t } = chaineARemplacer('BTS', 'aerien', '3 x 35 + 54,6 Alu', '3 x 70 + 54,6');
  remplacer(t[2], '3 x 150 + 70');
  const d = generer(p);
  // Projet v1.6.1 simulé : clé de groupe à 4 champs, une ligne manuelle, champs v15 absents
  const ancien = JSON.parse(JSON.stringify(p));
  ancien.version_schema = 14;
  const cle4 = 'BTS|aerien|a_reprendre|3 x 35 + 54,6 Alu';
  const ds = ancien.plans[0].descriptif;
  const tr = ds.sections.find((s) => s.cle === 'troncons');
  const e0 = tr.entrees.find((e) => /à remplacer/.test(DS.texteLigne(e.lignes[0])));
  tr.entrees = [e0];
  e0.source.cle_groupe = cle4;
  e0.lignes.push({ id: 'dl_x', cle_auto: null, origine: 'manuelle', segments: [[{ t: 'Ligne saisie en v1.6.1' }]], niveau: 0, puce: '', alignement: 'gauche' });
  ds.exclus = ['groupe:' + cle4];
  for (const o of ancien.plans[0].objets) { delete o.photos; if (o.type === 'troncon') { delete o.attributs.longueur_depose_m; delete o.attributs.cote_depose; } }
  const m = M.migrerProjet(ancien);
  assert.equal(m.version_schema, 18);   // v1.7.1 : 16 ; v1.7.3 : 17 ; v1.8.0 : 18
  for (const o of m.plans[0].objets) {
    assert.deepEqual(o.photos, []);
    if (o.type === 'troncon') { assert.equal(o.attributs.longueur_depose_m, null); assert.equal(o.attributs.cote_depose, 'droite'); }
  }
  const e = m.plans[0].descriptif.sections.find((s) => s.cle === 'troncons').entrees[0];
  assert.deepEqual(e.source.cle_groupe.split('\n').sort(), [cle4 + '|3 x 150 + 70', cle4 + '|3 x 70 + 54,6']);
  assert.ok(e.lignes.some((l) => DS.texteLigne(l) === 'Ligne saisie en v1.6.1'));
  assert.deepEqual(m.plans[0].descriptif.exclus.sort(), ['groupe:' + cle4 + '|3 x 150 + 70', 'groupe:' + cle4 + '|3 x 70 + 54,6']);
  // Rejouée sur un projet déjà v15 : rien ne change
  const avant = JSON.stringify(m);
  M.migrerProjet(m);
  assert.equal(JSON.stringify(m), avant);
  void d;
});

let n = 0;
for (const [nom, fn] of essais) {
  try { await fn(); n++; console.log('ok  ' + nom); }
  catch (e) { console.error('ÉCHEC  ' + nom); throw e; }
}
console.log(n + ' essais réussis');
