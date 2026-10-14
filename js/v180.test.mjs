/* v180.test.mjs — essais v1.8.0 : reportage photo automatique (H-369 à H-382).
 * Lancer : node js/v180.test.mjs   (non précaché par le service worker, comme les autres essais)
 * Mesure du texte : largeur approchée 0,55 × taille par caractère (pas de canvas sous Node).
 * Non vérifiable ici (navigateur, tablette) : interface, opérations de pages (annuler / rétablir d'une commande), export
 * PDF réel (le calcul de la réduction est vérifié, l'encodage JPEG non). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const SY = await import('./symboles.js');
const RP = await import('./reportage.js');
const RR = await import('./reportage-rendu.js');
const H = await import('./historique.js');
const IL = await import('./indicateur-longueur.js');
const { entreesLegende } = await import('./legende.js');
const PC = await import('./plans-calcul.js');
const FC = await import('./forme-calcul.js');

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

const essais = [];
const essai = (nom, fn) => essais.push([nom, fn]);
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
const pt = (x, y) => ({ x, y });
const K = CHARTE.reportage;
const dims = () => ({ l: 3000, h: 4000 });   // photos portrait 3 × 4
let nPhoto = 0;
const photo = (date = '2026-10-01T10:00:00Z', extra = {}) => ({ id: 'ph' + (++nPhoto), fond_id: 'f' + nPhoto, etat_photo: 'existant', legende: '', date, origine: 'import', ...extra });

function projet() {
  const p = M.nouveauProjet({ nom: 'Enfouissement BT poste CASALTA', commune: 'CASALTA', num_sieep: '4535' });
  etat.projet = p; etat.plan = p.plans[0];
  return p;
}
function ponctuel(plan, type, x, y, courant, attributs = {}, extra = {}) {
  const o = M.nouvelObjetPonctuel(type, x, y, courant, attributs);
  Object.assign(o, extra);
  actualiserDesignation(o);
  plan.objets.push(o);
  return o;
}
function troncon(plan, pts, courant, attributs = {}, extra = {}) {
  const o = M.nouveauTroncon(pts, courant, attributs);
  Object.assign(o, extra);
  actualiserDesignation(o);
  plan.objets.push(o);
  return o;
}
/* Jeu d'essai inspiré de l'étude 4535 : enveloppes REMBT à poser, coffrets S300 existants, RAS, un tronçon. */
function casalta() {
  const p = projet();
  const pl = p.plans[0];
  const R1 = ponctuel(pl, 'coffret', 100, 100, C('BTS', 'facade', 'a_poser'), {}, { repere: 'R1', repere_manuel: true, ref_article: 'a0320' });
  R1.materiel_associe.push({ source: 'LIBRE', libelle: 'Mise à la terre du neutre', quantite: 1 });
  const CE1 = ponctuel(pl, 'coffret', 160, 100, C('BTS', 'facade', 'existant'), { sigle: 'S300' }, { repere: 'CE1', repere_manuel: true });
  const R2 = ponctuel(pl, 'coffret', 220, 100, C('BTS', 'facade', 'a_poser'), {}, { repere: 'R2', repere_manuel: true, ref_article: 'a0320' });
  const T = troncon(pl, [pt(100, 100), pt(220, 100)], C('BTS', 'souterrain', 'a_poser'), { section: '3 x 150 + 70', longueur_m: 37 });
  R1.photos = [photo('2026-10-01T10:00:00Z'), photo('2026-10-01T09:00:00Z')];
  CE1.photos = [photo()];
  R2.photos = [photo()];
  T.photos = [photo()];
  for (const o of pl.objets) for (const ph of o.photos || []) ph.au_reportage = M.auReportageParDefaut(o);
  return { p, pl, R1, CE1, R2, T };
}
const vignettes = (p) => RP.vignettesProjet(p);
const bloc0 = (v) => v.reportage.blocs[0];
const textes = (b) => b.lignes.filter((l) => !l.supprimee).map((l) => l.texte);

/* ---------- 1. Migration ---------- */
essai('1. migration 17 → 18 : idempotente, aucune page de reportage, aspect inchangé', () => {
  const { p, pl } = casalta();
  // Projet « v1.7.7 » : sans type de page, sans réglages de reportage, photos sans au_reportage
  const ancien = JSON.parse(JSON.stringify(p));
  ancien.version_schema = 17;
  delete ancien.reportage;
  for (const x of ancien.plans) delete x.type;
  for (const o of ancien.plans[0].objets) for (const ph of o.photos || []) delete ph.au_reportage;
  const avant = ancien.plans[0].objets.map((o) => JSON.stringify(SY.primitivesObjet(o, ancien.reglages)));
  const m = M.migrerProjet(JSON.parse(JSON.stringify(ancien)));
  assert.equal(m.version_schema, 18);
  assert.equal(M.VERSION_SCHEMA, 18);
  assert.equal(m.reportage, null);
  assert.ok(m.plans.every((x) => x.type === 'plan'));
  assert.equal(RP.pagesReportage(m).length, 0);
  const apres = m.plans[0].objets.map((o) => JSON.stringify(SY.primitivesObjet(o, m.reglages)));
  assert.deepEqual(apres, avant, 'aucun changement d’aspect');
  const deux = M.migrerProjet(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(deux, m, 'idempotente');
  void pl;
});

/* ---------- 2. Photos retenues par défaut ---------- */
essai('2. au_reportage par défaut : ponctuels cochés, tronçons et fourreaux décochés', () => {
  const { R1, T } = casalta();
  assert.equal(M.auReportageParDefaut(R1), true);
  assert.equal(M.auReportageParDefaut(T), false);
  assert.equal(M.auReportageParDefaut({ type: 'fourreau' }), false);
  const m = M.migrerProjet(JSON.parse(JSON.stringify({ ...etat.projet, version_schema: 17, plans: etat.projet.plans.map((x) => ({ ...x, objets: x.objets.map((o) => ({ ...o, photos: (o.photos || []).map((ph) => { const c = { ...ph }; delete c.au_reportage; return c; }) })) })) })));
  const tr = m.plans[0].objets.find((o) => o.type === 'troncon');
  assert.ok(tr.photos.every((ph) => ph.au_reportage === false));
  assert.ok(m.plans[0].objets.filter((o) => o.type === 'coffret').every((o) => o.photos.every((ph) => ph.au_reportage === true)));
});

/* ---------- 3. Ordre ---------- */
essai('3. ordre : descriptif existant, plan sans descriptif (aucun écrit), photos chronologiques, plusieurs plans', () => {
  const { p, pl, R1, CE1, R2 } = casalta();
  // Sans descriptif : ordre calculé, rien n'est écrit dans le plan
  const s0 = RP.photosRetenues(p);
  assert.equal(pl.descriptif, null, 'aucun descriptif écrit');
  const ordre0 = s0.map((s) => s.objet.repere);
  assert.equal(s0.filter((s) => s.objet === R1).length, 2);
  const iR1 = s0.findIndex((s) => s.objet === R1);
  assert.ok(s0[iR1].photo.date < s0[iR1 + 1].photo.date, 'photos d’un ouvrage dans l’ordre chronologique');
  assert.ok(!s0.some((s) => s.objet.type === 'troncon'), 'tronçon non retenu par défaut');
  // Avec descriptif dont l'ordre a été changé à la main : R2 en tête
  DS.genererDescriptif(pl, p);
  const ouv = pl.descriptif.sections.find((s) => s.cle === 'ouvrages');
  const iR2 = ouv.entrees.findIndex((e) => e.source.objet_ids.includes(R2.id));
  const [eR2] = ouv.entrees.splice(iR2, 1); ouv.entrees.unshift(eR2);
  assert.equal(RP.photosRetenues(p)[0].objet, R2, 'ordre du descriptif suivi');
  // Ouvrage exclu du descriptif : en fin
  pl.descriptif.sections.forEach((s) => { s.entrees = s.entrees.filter((e) => !e.source.objet_ids.includes(CE1.id)); });
  const s2 = RP.photosRetenues(p);
  assert.equal(s2[s2.length - 1].objet, CE1);
  // Second plan : ses photos après celles du premier
  const pl2 = M.nouveauPlan('Plan 2'); p.plans.push(pl2);
  const A1 = ponctuel(pl2, 'support', 0, 0, C('BTS', 'aerien', 'a_deposer'), { materiau: 'BOIS' }, { repere: 'A1', repere_manuel: true });
  A1.photos = [photo()];
  const s3 = RP.photosRetenues(p);
  assert.equal(s3[s3.length - 1].objet, A1);
  void ordre0;
});

/* ---------- 4. Mise en page ---------- */
essai('4. grilles 2 / 4 / 6 / 8, A3 et A4 : vignettes dans leur cellule, sans chevauchement, titre et folio hors zone', () => {
  for (const format of ['A3', 'A4']) for (const n of K.par_page) {
    const p = projet();
    const pl = p.plans[0];
    for (let i = 0; i < n + 1; i++) { const o = ponctuel(pl, 'coffret', i * 30, 0, C('BTS', 'facade', i % 2 ? 'existant' : 'a_poser'), {}, { repere: 'R' + (i + 1), repere_manuel: true }); o.photos = [photo('2026-10-01T10:00:00Z', { au_reportage: true })]; }
    const r = RP.creerReportage(p, (id) => (id.endsWith('3') ? { l: 4000, h: 3000 } : dims()), { par_page: n, format });
    assert.ok(!r.erreur, r.erreur);
    const pages = RP.pagesReportage(p);
    assert.equal(pages.length, 2, format + ' ' + n + ' : ' + (n + 1) + ' photos sur 2 pages');
    const cells = RP.cellulesGrille(format, n);
    const { l: W, h: Hp } = RP.dimensionsPage(format);
    assert.ok(pages.every((pg) => pg.format.papier === format && pg.format.orientation === 'paysage' && pg.legende.visible === false));
    const eps = 0.01;
    for (const pg of pages) {
      const vs = pg.objets.filter(RP.estVignette);
      vs.forEach((v, i) => {
        const c = cells[i];
        const bp = RR.boitePhoto(v);
        const bl = RR.disposerBlocsVignette(v).boite;
        assert.ok(bp.x >= c.x - eps && bp.x + bp.l <= c.x + c.l + eps && bp.y >= c.y - eps, 'photo dans sa cellule');
        assert.ok(bl.x >= c.x - eps && bl.x + bl.l <= c.x + c.l + eps && bl.y + bl.h <= c.y + c.h + eps, format + ' ' + n + ' : blocs dans la cellule');
      });
      const titre = pg.objets.find((o) => o.reportage_role === 'titre');
      const folio = pg.objets.find((o) => o.reportage_role === 'folio');
      assert.ok(titre && folio);
      assert.ok(titre.y + titre.taille * 1.22 <= cells[0].y + eps, 'titre au-dessus de la grille');
      assert.ok(folio.y >= cells[cells.length - 1].y + cells[cells.length - 1].h - eps && folio.y + folio.taille <= Hp, 'folio sous la grille, dans la feuille');
      assert.ok(Math.abs(titre.x + (titre.texte.length * titre.taille * 0.55 * 1.1) / 2 - W / 2) < 1 || titre.x > 0);
    }
  }
});

/* ---------- 5. Texte des blocs = descriptif ---------- */
essai('5. bloc : équipement et description identiques aux lignes du descriptif', () => {
  const { p, pl, R1, CE1 } = casalta();
  RP.creerReportage(p, dims);
  DS.genererDescriptif(pl, p);
  const ouv = pl.descriptif.sections.find((s) => s.cle === 'ouvrages');
  const lignesDe = (o) => ouv.entrees.find((e) => e.source.objet_ids.includes(o.id)).lignes.map((l) => DS.texteLigne(l));
  const vR1 = vignettes(p).find((v) => v.reportage.source.objet_id === R1.id);
  const ld = lignesDe(R1);
  assert.deepEqual(textes(bloc0(vR1)), ld.slice(1), 'description = lignes du descriptif sans la première');
  assert.equal(bloc0(vR1).equipement, ld[0].replace(/^Pose\s+/, '').replace(/^./, (c) => c.toUpperCase()));
  assert.equal(bloc0(vR1).repere, 'R1');
  assert.equal(bloc0(vR1).etat, 'a_poser');
  const vCE1 = vignettes(p).find((v) => v.reportage.source.objet_id === CE1.id);
  assert.equal(bloc0(vCE1).equipement, lignesDe(CE1)[0]);
  assert.equal(bloc0(vCE1).etat, 'existant');
  // Rendu : bandeau d'état, repère, équipement présents dans les primitives
  const tx = SY.primitivesObjet(vR1, p.reglages).corps.filter((x) => x.t === 'texte').map((x) => x.texte);
  assert.ok(tx.includes(K.bandeaux.a_poser) && tx.includes('R1'));
});

/* ---------- 6. Mise à jour ---------- */
essai('6. mettre à jour : lignes manuelles intactes, alerte, nouvelles photos en fin, rien de redisposé', () => {
  const { p, R1, R2 } = casalta();
  RP.creerReportage(p, dims);
  const vR1 = vignettes(p).find((v) => v.reportage.source.objet_id === R1.id);
  const b = bloc0(vR1);
  b.lignes.push({ id: 'man1', cle_auto: null, origine: 'manuelle', texte: 'Goulotte ivoire' });
  const poses = vignettes(p).map((v) => JSON.stringify(RP.poseVignette(v)));
  R1.materiel_associe.push({ source: 'LIBRE', libelle: 'Pose 2 module branchement protégé mono', quantite: 1 });
  R2.photos.push(photo('2026-10-02T10:00:00Z', { au_reportage: true }));
  const r = RP.mettreAJourReportage(p, dims);
  assert.equal(r.ajoutees, 1);
  assert.ok(textes(b).includes('Goulotte ivoire'), 'ligne manuelle conservée');
  assert.ok(textes(b).some((t) => /module branchement/.test(t)), 'nouvelle ligne générée');
  assert.ok(b.alertes.includes('source_modifiee'));
  const vs = vignettes(p);
  assert.deepEqual(vs.slice(0, poses.length).map((v) => JSON.stringify(RP.poseVignette(v))), poses, 'vignettes existantes non redisposées');
  assert.equal(vs[vs.length - 1].reportage.source.photo_id, R2.photos[1].id, 'nouvelle photo en fin de reportage');
  // Seconde mise à jour : rien de nouveau
  assert.equal(RP.mettreAJourReportage(p, dims).ajoutees, 0);
});

/* ---------- 7. Redisposer ---------- */
essai('7. redisposer tout : manuel, blocs ajoutés, rognage et objets rattachés conservés', () => {
  const { p, R1, CE1 } = casalta();
  RP.creerReportage(p, dims, { par_page: 2 });
  const page = RP.pagesReportage(p)[0];
  const v = vignettes(p).find((x) => x.reportage.source.objet_id === R1.id);
  bloc0(v).lignes.push({ id: 'm', cle_auto: null, origine: 'manuelle', texte: 'Goulotte grise' });
  RP.ajouterOuvrage(v, p, p.plans[0].id, CE1.id);
  v.recadrage = { g: 0.1, h: 0.05, d: 0, b: 0.2 };
  // Objet illustratif posé sur la photo (page du reportage affichée)
  const pageV = RP.pagesReportage(p).find((pg) => pg.objets.includes(v));
  etat.plan = pageV;
  const vis = FC.rectangleVisible(v);
  const t = M.nouveauTroncon([pt(vis.cx, vis.cy), pt(vis.cx + 10, vis.cy + 10)], C('BTS', 'facade', 'a_poser'), {});
  pageV.objets.push(t);
  RP.synchroniserPage(pageV);
  assert.equal(t.vignette_id, v.id);
  const rel = (q) => { const r = FC.rectangleVisible(v); return [(q.x - r.cx) / r.l, (q.y - r.cy) / r.h]; };
  const avant = rel(t.points[0]);
  p.reportage.par_page = 4;
  const r = RP.redisposerReportage(p);
  assert.ok(!r.erreur);
  const v2 = vignettes(p).find((x) => x.id === v.id);
  assert.ok(textes(bloc0(v2)).includes('Goulotte grise'));
  assert.equal(v2.reportage.blocs.length, 2);
  assert.deepEqual(v2.recadrage, { g: 0.1, h: 0.05, d: 0, b: 0.2 });
  const pg2 = RP.pagesReportage(p).find((pg) => pg.objets.includes(v2));
  assert.ok(pg2.objets.includes(t), 'l’objet rattaché suit sa vignette de page en page');
  const apres = rel(t.points[0]);
  assert.ok(Math.abs(avant[0] - apres[0]) < 1e-9 && Math.abs(avant[1] - apres[1]) < 1e-9, 'objet aligné sur la photo');
  assert.equal(RP.pagesReportage(p).length, 1, '4 photos par page : une seule page, page vidée retirée');
  void page;
});

/* ---------- 8. Plusieurs ouvrages ---------- */
essai('8. plusieurs ouvrages sous une photo : ajout, ordre, suppression du bloc d’origine', () => {
  const { p, R1, CE1 } = casalta();
  RP.creerReportage(p, dims);
  const v = vignettes(p).find((x) => x.reportage.source.objet_id === R1.id);
  const b = RP.ajouterOuvrage(v, p, p.plans[0].id, CE1.id);
  assert.equal(b.repere, 'CE1');
  assert.equal(v.reportage.blocs.length, 2);
  v.reportage.blocs.reverse();
  v.reportage.blocs.splice(1, 1);   // bloc d'origine retiré
  RP.mettreAJourReportage(p, dims);
  assert.equal(v.reportage.blocs.length, 1);
  assert.equal(v.reportage.blocs[0].repere, 'CE1');
  assert.equal(v.reportage.source.objet_id, R1.id, 'la photo reste rattachée à son ouvrage');
  assert.ok(RP.ouvragesProposes(p).some((x) => x.objet === CE1));
});

/* ---------- 9. Objets illustratifs ---------- */
essai('9. illustratifs : hors descriptif, légende, contrôles ; ni repère automatique, ni indicateur de longueur', () => {
  const { p } = casalta();
  RP.creerReportage(p, dims);
  const page = RP.pagesReportage(p)[0];
  etat.plan = page;
  const compteurs = JSON.stringify(p.compteurs);
  const s = M.nouvelObjetPonctuel('support', 50, 50, C('BTS', 'aerien', 'a_poser'), {});
  M.attribuerRepere(p, s);
  assert.equal(s.repere, '', 'aucun repère automatique');
  assert.equal(JSON.stringify(p.compteurs), compteurs);
  page.objets.push(s);
  const t = M.nouveauTroncon([pt(10, 10), pt(80, 10)], C('BTS', 'aerien', 'a_poser'), {});
  page.objets.push(t);
  H.reinitialiserHistorique();
  H.valider('pose');
  assert.ok(s.illustratif && t.illustratif);
  assert.equal(M.porteurPhotos(s), false);
  assert.equal(M.estComplet(s, page.objets), true);
  assert.deepEqual(M.motifsACompleter(s, page.objets), []);
  assert.equal(entreesLegende(page.objets).length, 0);
  DS.genererDescriptif(page, p);
  assert.equal(DS.toutesEntrees(page.descriptif).length, 0);
  assert.equal(IL.indicateurActif('aerien'), false);
  etat.plan = p.plans[0];
  assert.equal(IL.indicateurActif('aerien'), true);
  // Les illustratifs ne comptent pas dans les doublons ni dans la numérotation
  s.repere = 'R1';
  assert.ok(!RP.doublonsReperes(p).has('R1'));
  M.recalculerCompteurs(p);
});

/* ---------- 10. Suivi de la photo ---------- */
essai('10. objets rattachés : alignés après déplacement, taille, rotation ; rognage sans effet', () => {
  const { p } = casalta();
  RP.creerReportage(p, dims);
  const page = RP.pagesReportage(p)[0];
  etat.plan = page;
  H.reinitialiserHistorique();
  const v = page.objets.find(RP.estVignette);
  const vis = FC.rectangleVisible(v);
  const coffret = M.nouvelObjetPonctuel('coffret', vis.cx - vis.l / 4, vis.cy + vis.h / 5, C('BTS', 'facade', 'a_poser'), {});
  const note = M.nouvelleNote(vis.cx + 5, vis.cy - 5, 'RAS');
  page.objets.push(coffret, note);
  H.valider('pose');
  assert.equal(coffret.vignette_id, v.id);
  assert.equal(note.vignette_id, v.id);
  const loc = (q) => { const L = FC.versLocal(q, { x: v.x, y: v.y }, v.rotation || 0); return [(L.x - v.x) / v.largeur, (L.y - v.y) / v.hauteur]; };
  const a0 = loc(coffret), n0 = loc(note);
  v.x += 120; v.y -= 40; v.largeur *= 1.3; v.hauteur *= 1.3; v.rotation = 90;
  H.valider('déplacement');
  const a1 = loc(coffret), n1 = loc(note);
  for (let i = 0; i < 2; i++) { assert.ok(Math.abs(a0[i] - a1[i]) < 1e-9); assert.ok(Math.abs(n0[i] - n1[i]) < 1e-9); }
  assert.equal(coffret.rotation, 90, 'symbole tourné avec la photo');
  const x = coffret.x;
  v.recadrage = { g: 0.2, h: 0, d: 0, b: 0 };
  H.valider('rognage');
  assert.equal(coffret.x, x, 'le rognage ne déplace pas le contenu de la photo');
  // Suppression de la vignette : ses objets rattachés partent avec elle (même étape)
  page.objets = page.objets.filter((o) => o !== v);
  H.valider('suppression');
  assert.ok(!page.objets.includes(coffret) && !page.objets.includes(note));
  assert.ok(page.objets.some((o) => o.reportage_role === 'titre'), 'titre conservé');
  H.annuler();
  assert.ok(etat.plan.objets.some((o) => o.id === coffret.id), 'annuler rétablit la vignette et ses objets');
});

/* ---------- 11. Cohérence avec les sources ---------- */
essai('11. § 8 : source supprimée, photo retirée, décochée, repère modifié ; binaire protégé', () => {
  const { p, pl, R1, CE1, R2 } = casalta();
  RP.creerReportage(p, dims);
  const vDe = (o) => vignettes(p).find((x) => x.reportage.source.objet_id === o.id);
  R1.repere = 'R10';
  const phCE1 = CE1.photos[0];
  CE1.photos = [];
  R2.photos[0].au_reportage = false;
  const vR2 = vDe(R2);
  const fondR2 = vR2.fond_id;
  pl.objets = pl.objets.filter((o) => o !== R2);
  RP.mettreAJourReportage(p, dims);
  assert.equal(bloc0(vDe(R1)).repere, 'R10');
  assert.ok(vDe(CE1).reportage.alertes.includes('photo_retiree'));
  assert.ok(PC.fondsReferences(p).has(phCE1.fond_id), 'binaire protégé tant qu’une vignette le référence');
  assert.ok(vR2.reportage.alertes.includes('source_supprimee'));
  assert.ok(bloc0(vR2).alertes.includes('source_supprimee'));
  assert.equal(bloc0(vR2).repere, 'R2', 'bloc figé');
  assert.ok(PC.fondsReferences(p).has(fondR2));
  assert.ok(vignettes(p).includes(vR2), 'jamais supprimée automatiquement');
  // Photo décochée (source présente)
  const { p: p2, R1: S1 } = casalta();
  RP.creerReportage(p2, dims);
  S1.photos[0].au_reportage = false;
  RP.mettreAJourReportage(p2, dims);
  assert.ok(RP.vignettesProjet(p2).some((v) => v.reportage.alertes.includes('photo_non_retenue')));
  assert.ok(RP.libellesAlertes(vR2).some((t) => /supprimé/.test(t)));
});

/* ---------- 12. Doublons ---------- */
essai('12. doublons de repère : détection sur tout le projet, illustratifs ignorés', () => {
  const { p, pl } = casalta();
  ponctuel(pl, 'coffret', 300, 0, C('BTS', 'facade', 'a_poser'), {}, { repere: 'RASB14', repere_manuel: true });
  const pl2 = M.nouveauPlan('Plan 2'); p.plans.push(pl2);
  ponctuel(pl2, 'coffret', 0, 0, C('BTS', 'facade', 'a_poser'), {}, { repere: 'RASB14.', repere_manuel: true });
  const d = RP.doublonsReperes(p);
  assert.equal(d.get('RASB14'), 2);
  assert.equal(RP.texteDoublon('RASB14', 2), 'Repère RASB14 utilisé 2 fois dans le projet');
  assert.ok(!d.has('R1'));
});

/* ---------- 13. Export ---------- */
essai('13. export : réduction à 300 dpi à la taille imprimée, jamais de suréchantillonnage', () => {
  const l100 = 100 * MM;   // photo imprimée sur 100 mm
  assert.equal(RP.largeurPxExport(l100, 2400), Math.ceil(100 / 25.4 * 300));   // 1 182 px
  assert.equal(RP.largeurPxExport(l100, 1000), 0, 'photo stockée plus petite : embarquée telle quelle');
  assert.equal(RP.largeurPxExport(300 * MM, 2400), 0);
  const { p } = casalta();
  RP.creerReportage(p, dims);
  const v = vignettes(p)[0];
  const prims = SY.primitivesObjet(v, p.reglages).corps;
  assert.equal(prims[0].t, 'image');
  assert.equal(prims[0].reportage, true, 'photo de reportage marquée pour la réduction');
  // Image libre ordinaire : primitive inchangée (pas de marque)
  const img = M.nouvelleImage(0, 0, 100, 80, 'fx');
  assert.equal(SY.primitivesObjet(img, p.reglages).corps[0].reportage, undefined);
});

/* ---------- Titre, folio, titre manuel ---------- */
essai('titre et folio : automatique, manuel, folio retiré sur une page unique', () => {
  const { p } = casalta();
  RP.creerReportage(p, dims);
  const pg = RP.pagesReportage(p);
  assert.equal(pg.length, 1);
  assert.equal(pg[0].objets.find((o) => o.reportage_role === 'titre').texte, 'REPORTAGE PHOTO — Commune CASALTA — Opération SIEEP HC 4535');
  assert.ok(!pg[0].objets.some((o) => o.reportage_role === 'folio'), 'une seule page : pas de folio');
  p.reportage.titre = 'REPORTAGE PHOTO — CASALTA';
  p.reportage.par_page = 2;
  RP.redisposerReportage(p);
  const pages = RP.pagesReportage(p);
  assert.ok(pages.length >= 2);
  pages.forEach((x, i) => {
    assert.equal(x.objets.find((o) => o.reportage_role === 'titre').texte, 'REPORTAGE PHOTO — CASALTA');
    assert.equal(x.objets.find((o) => o.reportage_role === 'folio').texte, (i + 1) + '/' + pages.length);
  });
  const p2 = M.nouveauProjet({ nom: 'x' });
  assert.equal(RP.titreAutomatique(p2), 'REPORTAGE PHOTO');
  assert.equal(RP.creerReportage(p2, dims).erreur.startsWith('Aucune photo'), true);
});

let ok = 0;
for (const [nom, fn] of essais) {
  try { fn(); ok++; console.log('ok ', nom); }
  catch (e) { console.error('ÉCHEC', nom); console.error(e); process.exitCode = 1; }
}
console.log(ok + ' / ' + essais.length + ' essais réussis');
