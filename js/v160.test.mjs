/* v160.test.mjs — essais v1.6.0 : repères en gras au descriptif (§1), marges de la page annexe (§2), couleur automatique
 * du texte des désignations (§3), pointes de flèches nettes (§4), raccourcis du matériel associé et garde-fou ERAS HTA
 * (§5), pages du projet (§6), plan de situation à l'échelle (§7), schéma 14.
 * Lancer : node js/v160.test.mjs   (non précaché par le service worker, comme les autres essais)
 * Mesure du texte : largeur approchée 0,55 × taille par caractère (pas de canvas sous Node). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Bouchon minimal du DOM : notifications et taille de la zone de plan (plans.js, vue.js, fond.js)
const zoneFactice = { clientWidth: 1200, clientHeight: 800, style: {}, appendChild() {}, querySelector() { return null; } };
globalThis.document = { getElementById: (id) => (id === 'zone-plan' ? zoneFactice : null), createElement: () => ({ getContext: () => null, style: {} }) };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };

const { etat } = await import('./etat.js');
const { definirMesureur, mesurerTexte } = await import('./primitives.js');
const { CHARTE, MM, couleurTexteBloc, couleurTexteAutoDesignation, RACCOURCIS_MATERIEL, ABREVIATIONS_ETIQUETTE, ALERTE_ERAS_HTA_DOUBLE } = await import('./charte.js');
const M = await import('./modele.js');
const { actualiserDesignation } = await import('./designation.js');
const DS = await import('./descriptif.js');
const { pagesAnnexe, zoneUtileAnnexe } = await import('./descriptif-rendu.js');
const SY = await import('./symboles.js');
const N = await import('./nomenclature.js');
const PC = await import('./plans-calcul.js');
const SI = await import('./situation.js');
const { etenduePlan } = await import('./vue.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

let n = 0;
const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
const pt = (x, y) => ({ x, y });
function projet(infos = {}) { const p = M.nouveauProjet({ nom: 'LOT FITELLE', commune: 'Ghisonaccia', ...infos }); etat.projet = p; etat.plan = p.plans[0]; return p; }
function ponctuel(p, type, x, y, courant, attributs = {}, extra = {}) { const o = M.nouvelObjetPonctuel(type, x, y, courant, attributs); Object.assign(o, extra); actualiserDesignation(o); p.plans[0].objets.push(o); return o; }
function troncon(p, pts, courant, attributs = {}, extra = {}) { const o = M.nouveauTroncon(pts, courant, attributs); Object.assign(o, extra); actualiserDesignation(o); p.plans[0].objets.push(o); return o; }
const generer = (p) => { for (const o of p.plans[0].objets) actualiserDesignation(o); DS.genererDescriptif(p.plans[0], p); return p.plans[0].descriptif; };
const entrees = (d, cle) => d.sections.find((s) => s.cle === cle).entrees;
const proche = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/* LOT FITELLE (Ghisonaccia) : S1 existant puis coffrets A1 à A9, BT souterraine à poser de S1 à A9. */
function lotFitelle() {
  const p = projet();
  ponctuel(p, 'support', 0, 0, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 }, { repere: 'S1', repere_manuel: true });
  for (let i = 1; i <= 9; i++) ponctuel(p, 'coffret', i * 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM450' }, { repere: 'A' + i, repere_manuel: true });
  const L = [2, 34, 12, 30, 125, 38, 20, 15, 18];
  for (let i = 0; i < 9; i++) troncon(p, [pt(i * 100, 0), pt((i + 1) * 100, 0)], C('BTS', 'souterrain', 'a_poser'), { section: '3x240+95 mm²', longueur_m: L[i] });
  return p;
}
const ligneDe = (e, re) => e.lignes.find((l) => re.test(DS.texteLigne(l)));

/* ---------- §1 Descriptif : rappels d'ouvrages en gras ---------- */
essai('§1 appliquerFormatSegments : même texte que appliquerFormat, jetons de repère en gras', () => {
  const F = CHARTE.descriptif.formats.troncon;
  const cas = [
    [F.a_poser_souterrain, { reseau: 'BT', section: '3x240+95 mm²', tranchee: '0,40 x 1,00', debut: 'A4', fin: 'A9' }],
    [F.a_poser_souterrain, { reseau: 'BT', section: '3x240+95 mm²', tranchee: '', debut: 'A4', fin: '' }],
    [F.detail, { a: 'a4', b: 'A5', longueur: '125 ml', nature: '' }],
    [F.a_deposer, { reseau: 'HTA/S', section: '', total: '30 ml', debut: 'P2', fin: 'BJ3' }]
  ];
  for (const [f, v] of cas) for (const majuscule of [false, true]) {
    const segs = DS.appliquerFormatSegments(f, v, { majuscule, gras: ['debut', 'fin', 'a', 'b'] });
    assert.equal(DS.texteSegments(segs), DS.appliquerFormat(f, v, { majuscule }));
    for (const s of segs.filter((x) => x.g)) assert.ok(['A4', 'A9', 'a4', 'A5', 'P2', 'BJ3'].includes(s.t), 'gras : ' + s.t);
  }
  const s = DS.appliquerFormatSegments(F.a_poser_souterrain, cas[0][1], { gras: ['debut', 'fin'] });
  assert.equal(DS.texteSegments(s), 'BT à construire : 3x240+95 mm² (0,40 x 1,00) de A4 à A9');
  assert.deepEqual(s.filter((x) => x.g).map((x) => x.t), ['A4', 'A9']);
  assert.ok(s.every((x) => !x.c), 'aucune couleur : texte courant (noir)');
  // majuscule appliquée à la valeur en gras quand le texte commence par elle
  assert.deepEqual(DS.appliquerFormatSegments('{a} puis', { a: 'a4' }, { majuscule: true, gras: ['a'] }), [{ t: 'A4', g: true }, { t: ' puis' }]);
});

essai('§1 LOT FITELLE : « de A1 à A9 » et « De A4 à A5 : 125 ml » avec repères en gras, repère d\'entrée rouge inchangé', () => {
  const p = lotFitelle();
  const d = generer(p);
  const e = entrees(d, 'troncons').find((x) => /construire/.test(DS.texteLigne(x.lignes[0])));
  const tete = e.lignes[0];
  assert.match(DS.texteLigne(tete), /BTS à construire : 3x240\+95 mm² de S1 à A9/);
  assert.deepEqual(tete.segments[0].filter((x) => x.g).map((x) => x.t), ['S1', 'A9']);
  assert.ok(tete.segments[0].every((x) => !x.c));
  const det = ligneDe(e, /^De A4 à A5/);
  assert.equal(DS.texteLigne(det), 'De A4 à A5 : 125 ml');
  assert.deepEqual(det.segments[0], [{ t: 'De ' }, { t: 'A4', g: true }, { t: ' à ' }, { t: 'A5', g: true }, { t: ' : 125 ml' }]);
  // repère d'entrée (« A5. ») : v1.7.0 §9 — plus de rouge stocké, rendu dans le cartouche (texte noir)
  const ouv = entrees(d, 'ouvrages').find((x) => DS.texteSegments(x.repere) === 'A5.');
  assert.deepEqual(ouv.repere, [{ t: 'A5.', g: true }]);
});

essai('§1 mentions : mot entier égal à un repère du projet en gras, rien d\'autre ; ligne manuelle jamais retouchée', () => {
  const p = lotFitelle();
  p.plans[0].objets.find((o) => o.type === 'troncon').mention = 'Traversée vers A4, pas A45 ni a4 ni RT10';
  const d = generer(p);
  const e = entrees(d, 'troncons').find((x) => /construire/.test(DS.texteLigne(x.lignes[0])));
  const m = ligneDe(e, /^Traversée/);
  assert.deepEqual(m.segments[0], [{ t: 'Traversée vers ' }, { t: 'A4', g: true }, { t: ', pas A45 ni a4 ni RT10' }]);
  // Une ligne modifiée à la main n'est jamais retouchée
  const det = ligneDe(e, /^De A4 à A5/);
  det.origine = 'manuelle';
  det.segments = [[{ t: 'De A4 à A5 : 125 ml (corrigé)' }]];
  const avant = JSON.stringify(det);
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.equal(JSON.stringify(e.lignes.find((l) => l.id === det.id)), avant);
  // Descriptif v1.5.4 (lignes sans gras) : le gras arrive à la prochaine mise à jour, sans fausse alerte
  const d2 = generer(lotFitelle());
  const e2 = entrees(d2, 'troncons').find((x) => /construire/.test(DS.texteLigne(x.lignes[0])));
  for (const l of e2.lignes) l.segments = [[{ t: DS.texteLigne(l) }]];
  DS.mettreAJourDescriptif(etat.plan, etat.projet);
  assert.ok(e2.lignes[0].segments[0].some((x) => x.g));
  assert.ok(!e2.alertes.includes('source_modifiee'));
});

/* ---------- §2 Page annexe ---------- */
essai('§2 page annexe A4 : marges 15 / 10 mm, aucun texte hors de la zone utile (1 à 3 colonnes, échelle 1 à 4)', () => {
  assert.equal(CHARTE.descriptif.annexe.marge_laterale_mm, 15);
  assert.equal(CHARTE.descriptif.annexe.marge_verticale_mm, 10);
  assert.equal(CHARTE.descriptif.annexe.marge_mm, undefined);
  const [W, H] = CHARTE.descriptif.annexe.format_pt;
  const Z = zoneUtileAnnexe(W, H);
  assert.ok(proche(Z.x, 15 * MM) && proche(Z.l, W - 30 * MM) && proche(Z.y, 10 * MM) && proche(Z.h, H - 20 * MM));
  for (const colonnes of [1, 2, 3]) for (const echelle of [1, 2, 4]) {
    const p = lotFitelle();
    for (let i = 0; i < 40; i++) ponctuel(p, 'support', i * 50, 500, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'D', hauteur_m: 12, effort_daN: 800 }, { repere: 'P' + (i + 1), repere_manuel: true, mention: 'Mention longue de contrôle de la coupure des lignes dans la colonne Ghisonaccia' });
    const d = generer(p);
    Object.assign(d, { sortie_pdf: 'annexe', colonnes, echelle });
    const pages = pagesAnnexe(p.plans[0], p, W, H);
    assert.ok(pages.length >= 1);
    for (const pg of pages) for (const x of pg) if (x.t === 'texte') {
      // v1.7.7 (H-368) : folio « n/N » dans la marge basse, sous la zone utile et dans la feuille — contrôlé à part
      if (x.ancre === 'milieu' && /^\d+\/\d+$/.test(x.texte) && x.y > Z.y + Z.h) { assert.ok(x.y - x.taille >= Z.y + Z.h - 1e-6 && x.y + 0.3 * x.taille <= H + 1e-6, 'folio ' + colonnes + '/' + echelle); continue; }
      const l = mesurerTexte(x.texte, x.taille, { gras: x.gras });
      assert.ok(x.x >= Z.x - 1e-6, 'gauche ' + colonnes + '/' + echelle);
      assert.ok(x.x + l <= Z.x + Z.l + 0.01, 'droite ' + colonnes + '/' + echelle + ' : ' + x.texte);
      assert.ok(x.y >= Z.y - 1e-6 && x.y <= Z.y + Z.h + 1e-6, 'haut / bas ' + colonnes + '/' + echelle);
    }
  }
});

/* ---------- §3 Couleur du texte des désignations ---------- */
essai('§3 couleur automatique : table du §3.1 complète, lue dans la charte', () => {
  projet();
  const R = CHARTE.reseaux, TPC = CHARTE.fourreau.couleur.TPC.a_poser, NOIR = CHARTE.texte.couleur_texte_defaut;
  const cas = [
    ['HTA', 'souterrain', R.HTA.couleur.a_poser], ['HTA', 'aerien', R.HTA.couleur.a_poser],
    ['BTS', 'souterrain', R.BTS.couleur.a_poser], ['BTS', 'aerien', R.BTS.couleur.a_poser], ['BTS', 'facade', R.BTS.couleur.a_poser],
    ['BRT', 'souterrain', R.BRT.couleur.a_poser], ['BRT', 'aerien', R.BRT.couleur.a_poser], ['BRT', 'facade', R.BRT.couleur.a_poser],
    ['EP', 'souterrain', R.EP.couleur.a_poser], ['EP', 'aerien', R.EP.couleur.a_poser], ['EP', 'facade', R.EP.couleur.a_poser]
  ];
  assert.deepEqual([R.HTA.couleur.a_poser, R.BTS.couleur.a_poser, R.BRT.couleur.a_poser, R.EP.couleur.a_poser, TPC], ['#E2001A', '#171AEB', '#FF6A00', '#FF2D95', '#E2001A']);
  for (const [dom, pose, attendu] of cas) {
    const t = M.nouveauTroncon([pt(0, 0), pt(100, 0)], C(dom, pose, 'a_poser'), { section: '' });
    assert.equal(t.etiquette.couleur_texte, null, 'création : automatique');
    assert.equal(couleurTexteBloc(t, 'etiquette'), attendu, dom + ' ' + pose);
    for (const e of ['existant', 'a_deposer', 'a_reprendre']) { t.etat = e; assert.equal(couleurTexteBloc(t, 'etiquette'), NOIR, dom + ' ' + pose + ' ' + e); }
  }
  for (const matiere of ['TPC', 'ACIER']) {
    const f = M.nouveauFourreau(C('BTS', 'souterrain', 'a_poser'), { points: [pt(0, 0), pt(50, 0)], attributs: { matiere } });
    assert.equal(f.etiquette.couleur_texte, null);
    assert.equal(couleurTexteBloc(f, 'etiquette'), TPC, 'fourreau ' + matiere);
    f.etat = 'existant'; assert.equal(couleurTexteBloc(f, 'etiquette'), NOIR);
  }
  // Blocs matériel et cartouche, ouvrages ponctuels : noirs
  const s = M.nouvelObjetPonctuel('support', 0, 0, C('BTS', 'aerien', 'a_poser'));
  assert.equal(couleurTexteBloc(s, 'etiquette'), NOIR);
  assert.equal(couleurTexteBloc(s, 'materiel'), NOIR);
});

essai('§3 rendu : texte bleu à poser, noir dès « existant » ; couleur manuelle du câble suivie ; couleur choisie conservée', () => {
  const p = projet();
  const t = troncon(p, [pt(0, 0), pt(200, 0)], C('BTS', 'souterrain', 'a_poser'), { section: '3x240+95 mm²', longueur_m: 20 });
  const couleursTexte = () => [...new Set(SY.primitivesEtiquette(t, p.reglages).prims.filter((x) => x.t === 'texte').map((x) => x.couleur))];
  assert.deepEqual(couleursTexte(), [CHARTE.reseaux.BTS.couleur.a_poser]);
  t.etat = 'existant';
  assert.deepEqual(couleursTexte(), ['#000000']);
  t.etat = 'a_poser'; t.couleur_manuelle = '#00AA44';
  assert.deepEqual(couleursTexte(), ['#00AA44'], 'couleur effective du câble, manuelle comprise');
  t.etiquette.couleur_texte = '#000000';
  assert.deepEqual(couleursTexte(), ['#000000'], 'noir choisi à la main : jamais recalculé');
  // Projets existants : aucune migration (le noir v1.5.4 reste noir)
  const ancien = JSON.parse(JSON.stringify(p));
  ancien.version_schema = 13;
  ancien.plans[0].objets[0].etiquette.couleur_texte = '#000000';
  assert.equal(M.migrerProjet(ancien).plans[0].objets[0].etiquette.couleur_texte, '#000000');
});

/* ---------- §4 Flèches ---------- */
const sommetEtBase = (prims, p2, tete) => {
  const tri = prims.filter((x) => x.t === 'poly' && x.ferme);
  const hampe = prims.find((x) => x.t === 'ligne');
  return { tri, hampe };
};
essai('§4 flèches simple et double : sommet = p2 (et p1), hampe arrêtée à la base, bout net, triangle sans contour', () => {
  const p1 = pt(10, 20), p2 = pt(110, 20), tete = 5.7;
  const s = SY.primitivesFleche(p1, p2, '#000000', 1.2, tete, false);
  const { tri, hampe } = sommetEtBase(s, p2, tete);
  assert.equal(tri.length, 1);
  assert.deepEqual(tri[0].points[0], p2);
  assert.equal(tri[0].couleur, null); assert.equal(tri[0].epaisseur, 0);
  assert.ok(proche(hampe.x2, p2.x - tete) && proche(hampe.y2, p2.y), 'hampe à la base');
  assert.ok(proche(hampe.x1, p1.x));
  assert.equal(hampe.extremite, 'nette');
  assert.ok(s.some((x) => x.t === 'cercle' && x.cx === p1.x && proche(x.r, 0.6)), 'départ arrondi conservé');
  const largeur = Math.hypot(tri[0].points[1].x - tri[0].points[2].x, tri[0].points[1].y - tri[0].points[2].y);
  assert.ok(proche(largeur, 2 * 0.42 * tete), 'proportions inchangées');
  const d = SY.primitivesFleche(p1, p2, '#000000', 1.2, tete, true);
  const td = d.filter((x) => x.t === 'poly');
  assert.deepEqual(td.map((x) => x.points[0]), [p2, p1]);
  const hd = d.find((x) => x.t === 'ligne');
  assert.ok(proche(hd.x1, p1.x + tete) && proche(hd.x2, p2.x - tete));
  assert.ok(!d.some((x) => x.t === 'cercle'));
});

essai('§4 annotations : flèche, flèche double, avec texte, nord, cotation, trait « pointe » — sommets nets', () => {
  projet();
  const pts = [pt(0, 0), pt(80, 60)];
  for (const st of ['fleche', 'fleche_double', 'fleche_texte', 'fleche_double_texte', 'cotation']) {
    const o = M.nouvelleAnnotation(st, { points: pts, texte: '12 m' });
    const prims = SY.primitivesAnnotation(o, { echelle_symbole: 1, taille_texte: 1 });
    const tri = prims.filter((x) => x.t === 'poly' && x.ferme && x.remplissage);
    assert.ok(tri.some((x) => proche(x.points[0].x, 80) && proche(x.points[0].y, 60)), st + ' : sommet en p2');
    const hampe = prims.find((x) => x.t === 'ligne');
    assert.equal(hampe.extremite, 'nette', st);
    assert.ok(Math.hypot(hampe.x2 - 80, hampe.y2 - 60) > 1, st + ' : hampe hors de la pointe');
  }
  const trait = M.nouvelleAnnotation('trait', { points: [pt(0, 0), pt(50, 0), pt(50, 50)] });
  trait.attributs.extremites = 'pointe';
  const pr = SY.primitivesAnnotation(trait, { echelle_symbole: 1, taille_texte: 1 });
  const corps = pr.find((x) => x.t === 'poly' && !x.ferme);
  assert.equal(corps.extremite, 'nette');
  const t = CHARTE.annotations.trait.tete;
  assert.ok(proche(corps.points[0].x, t) && proche(corps.points[2].y, 50 - t), 'polyligne arrêtée aux bases');
  const tetes = pr.filter((x) => x.t === 'poly' && x.ferme);
  assert.deepEqual(tetes.map((x) => x.points[0]), [pt(0, 0), pt(50, 50)]);
  const nord = M.nouvelleAnnotation('nord', { x: 100, y: 100 });
  const pn = SY.primitivesAnnotation(nord, { echelle_symbole: 1, taille_texte: 1 });
  assert.equal(pn.find((x) => x.t === 'ligne').extremite, 'nette');
});

/* ---------- §5 Raccourcis, garde-fou ERAS HTA ---------- */
essai('§5 raccourcis : ordre des puces par type, libellés, abréviations ajoutées', () => {
  const lib = (t) => N.raccourcisMateriel(t).map((e) => e.malt ? 'MALT:' + e.malt : e.libre ? 'LIBRE=' + e.puce : e.article + '=' + e.puce);
  // v1.7.0 §7 : trois raccourcis d'encastrement en matériel libre à la suite des puces de la v1.6.0
  assert.deepEqual(lib('coffret'), ['MALT:ex', 'MALT:confection', 'a0358=Racc. BT coffret exist.', 'a0327=RAC 240 G3', 'a0328=RAC 35 G3', 'a0329=BR 60M G3', 'a0333=CIBE 1', 'a0334=CIBE 2', 'LIBRE=Encast. agglo / PS', 'LIBRE=Encast. béton', 'LIBRE=Encast. pierres maç.']);
  assert.deepEqual(lib('support'), ['MALT:ex', 'MALT:confection', 'a0351=Dériv. torsadé/torsadé DPH4', 'a0353=Jonct. torsadé/torsadé DPG4', 'a0378=ERAS HTA', 'a0355=EAJSE T 70/3x150+70', 'a0356=EAJSE T 150/3x150+70', 'a0357=EAJSE T 150/3x240+95', 'a0377=RAS BRT', 'a0380=RAS EP', 'a0333=CIBE 1', 'a0334=CIBE 2']);
  // v1.7.0 §6 : transformateurs en cabine à la suite des puces de la v1.6.0
  assert.deepEqual(lib('poste'), ['MALT:ex', 'MALT:confection', 'a0419=Départ monobloc', 'a0421=Racc. câble BT tableau', 'a0373=CSE 95²', 'a0374=CSE 150²', 'a0426=Fusibles HTA 3x16 A', 'a0427=Fusibles HTA 3x43 A', 'a0428=Fusibles HTA 3x63 A', 'a0381=Transfo cab. 160', 'a0382=Transfo cab. 250', 'a0383=Transfo cab. 400', 'a0384=Transfo cab. 630', 'a0385=Transfo cab. 1000']);
  assert.deepEqual(N.raccourcisMateriel('boite_jonction'), []);
  assert.equal(ABREVIATIONS_ETIQUETTE.a0377, 'Remontée aéro-souterraine de branchement', 'libellé d\'étiquette imposé inchangé');
  // Tous les articles des raccourcis sont au BPU
  for (const l of Object.values(RACCOURCIS_MATERIEL)) for (const e of l) if (e.article) assert.equal(N.articleParId(e.article).statut, 'BPU', e.article);
});

essai('§5 raccourcis : incrément de quantité (« Pose 2 BR 60M G3 »), article introuvable non proposé', () => {
  const p = projet();
  const c = ponctuel(p, 'coffret', 0, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM450' }, { repere: 'A1', repere_manuel: true });
  N.ajouterOuIncrementerArticle(c, 'a0329');
  assert.equal(c.materiel_associe.length, 1);
  assert.equal(c.materiel_associe[0].quantite_saisie, false);
  N.ajouterOuIncrementerArticle(c, 'a0329');
  assert.equal(c.materiel_associe.length, 1);
  assert.deepEqual([c.materiel_associe[0].quantite, c.materiel_associe[0].quantite_saisie], [2, true]);
  const d = generer(p);
  assert.ok(entrees(d, 'ouvrages')[0].lignes.some((l) => DS.texteLigne(l) === 'Pose 2 BR 60M G3'));
  const sauve = etat.nomenclature.articles;
  etat.nomenclature.articles = sauve.filter((a) => a.id !== 'a0329');
  try { assert.ok(!N.raccourcisMateriel('coffret').some((e) => e.article === 'a0329')); }
  finally { etat.nomenclature.articles = sauve; }
});

essai('§5.5 ERAS HTA comptée deux fois : support « à compléter », avertissement, une seule ligne au descriptif', () => {
  const p = projet();
  const s = ponctuel(p, 'support', 0, 0, C('HTA', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'D', hauteur_m: 12, effort_daN: 800 }, { repere: 'P1', repere_manuel: true });
  N.ajouterOuIncrementerArticle(s, 'a0378');
  const r = ponctuel(p, 'eras', 2, 0, C('HTA', 'aerien', 'a_poser'), {}, { repere: 'R1', repere_manuel: true });
  assert.equal(r.attributs.sous_type, 'HTA');
  assert.equal(M.estComplet(s, p.plans[0].objets), false);
  assert.ok(M.motifsACompleter(s, p.plans[0].objets).includes(ALERTE_ERAS_HTA_DOUBLE));
  const d = generer(p);
  const txt = entrees(d, 'ouvrages').find((e) => DS.texteSegments(e.repere) === 'P1.').lignes.map((l) => DS.texteLigne(l));
  assert.equal(txt.filter((t) => /ERAS HTA/.test(t)).length, 1, txt.join(' / '));
  // ERAS existante (pas une pose) ou ERAS éloignée : pas de doublon
  r.etat = 'existant';
  assert.equal(M.erasHtaCompteeDeuxFois(s, p.plans[0].objets), false);
  r.etat = 'a_poser'; r.x = 500;
  assert.equal(M.erasHtaCompteeDeuxFois(s, p.plans[0].objets), false);
  assert.equal(M.estComplet(s, p.plans[0].objets), true);
});

/* ---------- §6 Pages ---------- */
essai('§6 formats, ordre, insertion après la page courante, migration A3 paysage (rendu inchangé), schéma 14', () => {
  const P = CHARTE.plans.papiers;
  assert.deepEqual(PC.dimensionsFormat({ papier: 'A4', orientation: 'portrait' }, P), { l: 595.28, h: 841.89 });
  assert.deepEqual(PC.dimensionsFormat({ papier: 'A3', orientation: 'portrait' }, P), { l: 841.89, h: 1190.55 });
  assert.deepEqual(PC.dimensionsFormat({ papier: 'A3', orientation: 'paysage' }, P), { l: 1190.55, h: 841.89 });
  assert.deepEqual(PC.dimensionsFormat({ papier: 'A3', orientation: 'paysage', historique: true }, P), { l: 1190, h: 842 });
  assert.equal(PC.formatChoisi('A5', 'portrait'), null);
  assert.deepEqual(PC.deplacerDansListe(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(PC.deplacerDansListe(['a', 'b', 'c'], 0, 9), ['b', 'c', 'a']);
  assert.equal(PC.indiceApres(['a', 'b', 'c'], 'a'), 1);
  assert.equal(PC.indiceApres(['a', 'b', 'c'], 'z'), 3);
  // Migration : plan sans fond d'un projet v13 → A3 paysage historique (1190 × 842, comme export-pdf.js v1.5.4)
  const p = projet();
  const ancien = JSON.parse(JSON.stringify(p));
  ancien.version_schema = 13;
  delete ancien.plans[0].format;
  const m = M.migrerProjet(ancien);
  assert.equal(M.VERSION_SCHEMA, 18);   // v1.7.1 : 16 ; v1.7.3 : 17 (angle de piquetage) ; v1.8.0 : 18 (reportage photo)
  assert.equal(m.version_schema, 18);   // v1.7.3 : 17 ; v1.8.0 : 18
  assert.deepEqual(m.plans[0].format, { papier: 'A3', orientation: 'paysage', historique: true });
  assert.deepEqual(etenduePlan(m.plans[0]), { x: 0, y: 0, l: 1190, h: 842 });
  // Page avec fond : étendue du fond, format ignoré
  m.plans[0].fond = { fond_id: 'x', type: 'pdf', largeur: 2000, hauteur: 1000 };
  assert.deepEqual(etenduePlan(m.plans[0]), { x: 0, y: 0, l: 2000, h: 1000 });
});

essai('§6 opérations de pages : page vierge après la courante, ordre, suppression refusée sur la dernière, Annuler / Rétablir', async () => {
  const PL = await import('./plans.js');
  const H = await import('./historique.js');
  const p = projet();
  H.reinitialiserHistorique();
  assert.equal(await PL.supprimerPlan(p.plans[0].id), false, 'dernière page : refus');
  assert.equal(p.plans.length, 1);
  const a = p.plans[0];
  const b = await PL.ajouterPageVierge('A4', 'portrait');
  assert.deepEqual(p.plans.map((x) => x.id), [a.id, b.id]);
  assert.deepEqual(b.format, { papier: 'A4', orientation: 'portrait' });
  assert.equal(etat.plan, b, 'la nouvelle page est affichée');
  await PL.changerPlanId(a.id);
  const c = await PL.ajouterPageVierge('A3', 'portrait');
  assert.deepEqual(p.plans.map((x) => x.id), [a.id, c.id, b.id], 'insérée après la page courante (a)');
  assert.ok(PL.deplacerPage(c.id, -1));
  assert.deepEqual(p.plans.map((x) => x.id), [c.id, a.id, b.id], 'page de garde en première position');
  assert.ok(PL.changerFormatPage(c.id, 'A3', 'paysage'));
  assert.deepEqual(etenduePlan(c), { x: 0, y: 0, l: 1190.55, h: 841.89 });
  const attendre = () => new Promise((r) => setTimeout(r, 20));
  H.annuler(); await attendre();
  assert.deepEqual(c.format, { papier: 'A3', orientation: 'portrait' }, 'format annulé');
  H.annuler(); await attendre();
  assert.deepEqual(p.plans.map((x) => x.id), [a.id, c.id, b.id], 'ordre annulé');
  H.retablir(); await attendre();
  assert.deepEqual(p.plans.map((x) => x.id), [c.id, a.id, b.id], 'ordre rétabli');
  // Suppression de la page affichée : bascule sur la voisine, annulable
  await PL.changerPlanId(a.id);
  assert.ok(await PL.supprimerPlan(a.id));
  assert.deepEqual(p.plans.map((x) => x.id), [c.id, b.id]);
  assert.equal(etat.plan, c);
  H.annuler(); await attendre();
  assert.deepEqual(p.plans.map((x) => x.id), [c.id, a.id, b.id], 'suppression annulée, à sa place');
  // Une modification d'objets après une opération de pages est annulée en premier (ordre chronologique)
  await PL.changerPlanId(c.id);
  const n0 = c.objets.length;
  c.objets.push(M.nouvelleNote(10, 10, 'Page de garde'));
  H.valider('Note');
  H.annuler(); await attendre();
  assert.equal(c.objets.length, n0);
  assert.deepEqual(p.plans.map((x) => x.id), [c.id, a.id, b.id], 'la liste des pages n\'a pas bougé');
});

/* ---------- §7 Plan de situation ---------- */
essai('§7 niveau de tuiles par échelle à 42° N (≥ 6 px/mm, plafond 18) et dimensions de la carte', () => {
  const lat = 42;
  const attendu = { 2500: 18, 5000: 18, 10000: 17, 25000: 15, 50000: 14, 100000: 13 };   // v1.7.0 : 1/50 000 ; v1.7.1 : 1/100 000
  for (const e of CHARTE.situation.echelles) {
    const r = SI.niveauPourEchelle(lat, e);
    assert.equal(r.zoom, attendu[e], '1/' + e);
    if (r.zoom > 0 && r.atteint) assert.ok(e / (1000 * SI.metresParPixel(lat, r.zoom - 1)) < 6, 'plus petit niveau suffisant');
  }
  assert.equal(SI.niveauPourEchelle(lat, 2500).atteint, false, '1/2 500 : 6 px/mm hors d\'atteinte au niveau 18 (H-319)');
  assert.ok(SI.niveauPourEchelle(lat, 2500).pxParMm > 5.5);
  const c = SI.cartePourEchelle(lat, 5000, 70, 52.5);
  assert.ok(proche((c.largeurPx * SI.metresParPixel(lat, c.zoom)), 350, 0.5), 'emprise = 70 mm × 5 000 = 350 m');
  assert.equal(c.depasse, false);
  const g = SI.cartePourEchelle(lat, 5000, 380, 260);
  assert.equal(g.depasse, true);
  assert.equal(SI.echelleProposee(lat, 5000, 380, 260), 25000);
});

essai('§7 indication d\'échelle : calculée sur les dimensions effectives, « ≈ » au-delà de 1 %, titre au-dessus du cadre', () => {
  const lat = 42.1;
  const c = SI.cartePourEchelle(lat, 5000, 70, 52.5);
  const o = M.nouvelleImage(100, 200, 70 * MM, 52.5 * MM, 'fd_x', 'Plan de situation (IGN)');
  o.situation = { lat, lon: 9.2, zoom: c.zoom, largeur_px: c.largeurPx, diametre_mm: 6, echelle: 5000, titre: CHARTE.situation.titre.defaut, titre_visible: true };
  assert.ok(Math.abs(SI.echelleReelle(o) - 5000) / 5000 < 0.01);
  assert.equal(SI.libelleEchelle(SI.echelleReelle(o)), 'Éch. 1/5\u00A0000');
  assert.equal(SI.echelleListe(o), 5000);
  // Poignée de taille : +3 % → valeur approchée arrondie à la dizaine ; rognage / rotation : sans effet
  o.largeur *= 1.03; o.hauteur *= 1.03;
  const e = SI.echelleReelle(o);
  assert.match(SI.libelleEchelle(e), /^Éch\. ≈\u00A01\/4\u00A0\d{2}0$/);
  assert.equal(SI.echelleListe(o), null);
  o.rotation = 30; o.recadrage = { g: 0.2, h: 0, d: 0.1, b: 0 };
  assert.equal(SI.echelleReelle(o), e);
  const prims = SY.primitivesSituation(o);
  assert.equal(prims[1].t, 'cercle', 'rond en 2e position (inchangé)');
  const textes = prims.filter((x) => x.t === 'texte');
  assert.ok(textes.some((x) => x.texte === SI.libelleEchelle(e) && proche(x.taille, 2 * MM)));
  const titre = textes.find((x) => x.texte === 'PLAN DE SITUATION');
  assert.ok(titre && titre.gras && proche(titre.taille, 3.2 * MM) && titre.rotation === 30);
  o.situation.titre_visible = false;
  assert.ok(!SY.primitivesSituation(o).some((x) => x.texte === 'PLAN DE SITUATION'));
  // Carte posée en v1.5.4 (sans largeur_px) : 1200 px ; titre masqué par la migration (aucun changement d'aspect)
  const v154 = { type: 'image', largeur: 70 * MM, situation: { lat, lon: 9.2, zoom: 15, diametre_mm: 6 } };
  assert.ok(proche(SI.echelleReelle(v154), 1200 * SI.metresParPixel(lat, 15) * 1000 / 70, 1e-6));
  const p = projet();
  const ancien = JSON.parse(JSON.stringify(p));
  ancien.version_schema = 13;
  ancien.plans[0].objets.push({ ...M.nouvelleImage(0, 0, 100, 75, 'fd', 'x'), situation: { lat, lon: 9.2, zoom: 15, diametre_mm: 6 } });
  assert.equal(M.migrerProjet(ancien).plans[0].objets.at(-1).situation.titre_visible, false);
});

for (const [nom, fn] of essais) { await fn(); n++; console.log('ok  ' + nom); }
console.log(n + ' essais réussis');
