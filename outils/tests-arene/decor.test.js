/* Lancer : node outils/tests-arene/decor.test.js — Tests Phase 2 : décor destructible selon le mode, seuil, collisions, réseau, bots */
global.window = global;
const fs = require('fs'), vm = require('vm');
const D = require('path').join(__dirname, '../../arene/') + '/';
vm.runInThisContext(fs.readFileSync(D + 'config.js', 'utf8'));
vm.runInThisContext(fs.readFileSync(D + 'moteur.js', 'utf8'));
const M = window.ARENE_MOTEUR, C = window.ARENE_CONFIG, R = C.REGLES, DT = 1 / 30;
let ok = 0, ko = 0;
const verif = (c, n, i) => { if (c) ok++; else { ko++; console.log('  ÉCHEC :', n, i !== undefined ? JSON.stringify(i) : ''); } };
function labo(persos, mode, graine) {
  const parts = Array.from({ length: 10 }, (_, i) => ({ nom: 'H' + i, perso: persos[i] || 'bram', humain: true }));
  const S = M.creerSimulation({ graine: graine || 4242, participants: parts, mode });
  S.zone.r = 999;
  S.f.forEach((f, i) => { if (i > 1) { f.x = 22 - (i % 3); f.y = -22 + i; } });
  return S;
}
/* place le tireur face à un mur, à distance d */
function faceAuMur(S, slot, d) {
  const m = S.carte.murs.find(w => w.w > 2.5 && w.h < 1.5 && Math.abs(w.x) < 15 && Math.abs(w.y) < 15 && !M.dansObstacle(S.carte, w.x, w.y + w.h / 2 + d, 0.7));
  const f = S.f[slot]; f.x = m.x; f.y = m.y + m.h / 2 + d;
  return m;
}
function tirer(S, slot, a, n) {
  for (let i = 0; i < n; i++) {
    S.f[slot].charges = 3; S.f[slot].dernierAppuiA = -9; S.f[slot].combo = null;
    S.pas(DT, { [slot]: { appuis: [{ act: 'A', a }] } });
    for (let k = 0; k < 20; k++) S.pas(DT, {});
  }
}

/* 1. Runes des Trophées : un mur prend des dégâts, se brise et disparaît des collisions */
{
  const S = labo(['eldiablo'], 'runes');
  verif(S.destructible === true, 'mode runes : décor destructible');
  const m = faceAuMur(S, 0, 2), pv0 = m.pv;
  tirer(S, 0, -Math.PI / 2, 1);
  verif(m.pv < pv0, 'runes : le mur perd des PV', { pv0, pv: m.pv });
  let n = 0; while (m.pv > 0 && n++ < 40) tirer(S, 0, -Math.PI / 2, 1);
  verif(m.pv === 0 && S.carte.murs.indexOf(m) < 0, 'runes : mur brisé et retiré des collisions', { pv: m.pv, n });
  verif(!M.dansObstacle(S.carte, m.x, m.y, 0) || S.carte.murs.some(w => w !== m && Math.abs(w.x - m.x) < w.w / 2 && Math.abs(w.y - m.y) < w.h / 2), 'runes : on peut passer là où était le mur');
  verif(S.carte.detruits.indexOf(m.id) >= 0 && S.stats.decorDetruit >= 1, 'runes : destruction enregistrée', S.carte.detruits);
  /* un tir passe maintenant à travers l'emplacement */
  const f = S.f[0], c = S.f[1]; c.x = m.x; c.y = m.y - m.h / 2 - 2; c.hp = c.hpMax;
  tirer(S, 0, -Math.PI / 2, 1);
  verif(c.hp < c.hpMax, 'runes : après destruction, le tir atteint la cible derrière', c.hp);
}

/* 2. Autres modes : le même décor reste permanent */
{
  const S = labo(['eldiablo'], 'tour');
  verif(S.destructible === false, 'autre mode : décor permanent');
  const m = faceAuMur(S, 0, 2), pv0 = m.pv;
  tirer(S, 0, -Math.PI / 2, 30);
  S.f[0].ki = 100; S.pas(DT, { 0: { appuis: [{ act: 'S', a: -Math.PI / 2 }] } }); for (let k = 0; k < 40; k++) S.pas(DT, {});
  verif(m.pv === pv0 && S.carte.murs.indexOf(m) >= 0, 'autre mode : 30 tirs + projection, le mur est intact', m.pv);
  verif(S.stats.decorTouche > 0 && S.stats.decorDetruit === 0, 'autre mode : touché mais jamais détruit', S.stats);
  /* explosions et faisceaux non plus */
  const S2 = labo(['raimei', 'bram'], 'entrainement');
  const m2 = faceAuMur(S2, 0, 3), pv2 = m2.pv;
  for (let i = 0; i < 10; i++) { S2.f[0].ki = 100; S2.pas(DT, { 0: { appuis: [{ act: 'S', a: -Math.PI / 2, d: 3 }] } }); for (let k = 0; k < 45; k++) S2.pas(DT, {}); }
  verif(m2.pv === pv2, 'autre mode : zones de foudre sans effet sur le décor', m2.pv);
}

/* 3. Seuil : un coup trop faible n'abîme pas */
{
  const S = labo(['seren'], 'runes');
  const m = faceAuMur(S, 0, 2), pv0 = m.pv;
  tirer(S, 0, -Math.PI / 2, 4);
  verif(m.pv === pv0, `seuil : les petites étoiles (${C.PERSONNAGES.find(p => p.id === 'seren').attaque.degats} < ${m.seuil}) ne grignotent pas`, m.pv);
  const S2 = labo(['hikari'], 'runes');
  const m2 = faceAuMur(S2, 0, 3), p2 = m2.pv;
  tirer(S2, 0, -Math.PI / 2, 1);
  verif(m2.pv < p2, 'seuil : un rayon puissant abîme', m2.pv);
}

/* 4. Faisceau : ronge le mur qui l'arrête, puis passe à travers quand il cède */
{
  const S = labo(['hikari', 'bram'], 'runes');
  const m = faceAuMur(S, 0, 2), b = S.f[1];
  b.x = m.x; b.y = m.y - m.h / 2 - 1.5; m.pv = 200;
  S.f[0].ki = 100;
  S.pas(DT, { 0: { appuis: [{ act: 'S', a: -Math.PI / 2 }] } });
  for (let k = 0; k < 45; k++) S.pas(DT, {});
  verif(m.pv === 0, 'faisceau : le mur affaibli cède', m.pv);
  verif(b.hp < b.hpMax, 'faisceau : la cible derrière est ensuite touchée', b.hp);
}

/* 5. Cachettes : invisibilité, embuscade, fourré détruit */
{
  const S = labo(['abyssa', 'bram'], 'runes');
  const cb = S.carte.cachettes.find(c => Math.abs(c.x) < 18 && Math.abs(c.y) < 18 && !M.dansObstacle(S.carte, c.x, c.y + c.r + 1.5, 0.8));
  const a = S.f[0], b = S.f[1];
  a.x = cb.x; a.y = cb.y; b.x = cb.x; b.y = cb.y + cb.r + 2.5;
  S.pas(DT, {}); S.ev.length = 0;
  verif(a.cache && !M.visible(b, a), 'cachette : invisible pour un ennemi à plus de 3,2 m', { cache: a.cache, d: Math.hypot(a.x - b.x, a.y - b.y) });
  a.revele = 0;
  S.pas(DT, { 0: { appuis: [{ act: 'A', a: Math.PI / 2 }] } });
  for (let k = 0; k < 12; k++) S.pas(DT, {});
  const evs = S.ev.splice(0);
  verif(evs.some(e => e.k === 'embuscade' && e.s === 0), 'cachette : attaque depuis un fourré = embuscade (+20 %)');
  verif(M.visible(b, a), "cachette : repéré juste après avoir attaqué");
  let n = 0; const pv0 = cb.pv;
  while (cb.pv > 0 && n++ < 60) { b.charges = 3; b.dernierAppuiA = -9; S.pas(DT, { 1: { appuis: [{ act: 'A', a: -Math.PI / 2 }] } }); for (let k = 0; k < 18; k++) S.pas(DT, {}); }
  verif(cb.pv === 0 && S.carte.cachettes.indexOf(cb) < 0, 'cachette : le fourré se détruit et ne cache plus', { pv0, pv: cb.pv, n });
  S.pas(DT, {});
  verif(!a.cache || !a.vivant, 'cachette : plus de dissimulation après destruction');
}

/* 6. Réseau : l'état transmis contient le décor abîmé / détruit, et un invité le reproduit */
{
  const S = labo(['eldiablo'], 'runes', 777);
  const m = faceAuMur(S, 0, 2);
  let n = 0; while (m.pv > 0 && n++ < 40) tirer(S, 0, -Math.PI / 2, 1);
  const snap = S.instantane();
  verif(snap.dc.some(([id, pv]) => id === m.id && pv === 0), "réseau : l'état contient le mur détruit", snap.dc.slice(0, 3));
  const carteInvite = M.genererCarte(777);
  snap.dc.forEach(([id, pv]) => { const o = carteInvite.parId[id]; if (o && o.pv > 0) { o.pv = pv; if (pv <= 0) M.retirerDecor(carteInvite, o); } });
  verif(carteInvite.murs.length === S.carte.murs.length && carteInvite.murs.every((w, i) => w.id === S.carte.murs[i].id), "réseau : la carte de l'invité est identique à celle de l'hôte");
}

/* 7. Parties de bots complètes en mode Runes : le décor évolue, tout se termine, pas de fuite */
{
  const t0 = Date.now(); let detruits = 0, embusc = 0, durees = [];
  for (let g = 1; g <= 30; g++) {
    const parts = C.PERSONNAGES.map((p, i) => ({ nom: 'B' + i, perso: p.id, humain: false, niveau: [0, 300, 1000, 5000][g % 4] }));
    const S = M.creerSimulation({ graine: g * 31337, participants: parts, mode: 'runes' });
    let maxP = 0;
    while (!S.fini) { S.pas(DT, null); S.ev.length = 0; maxP = Math.max(maxP, S.p.length); }
    verif(S.f.map(f => f.place).sort((a, b) => a - b).join(',') === '1,2,3,4,5,6,7,8,9,10', `bots ${g} : classement complet`);
    verif(maxP < 400, `bots ${g} : projectiles bornés`, maxP);
    /* aucun combattant coincé dans un mur restant */
    verif(S.f.every(f => !f.vivant || !M.dansObstacle(S.carte, f.x, f.y, -0.1)), `bots ${g} : aucun combattant dans un mur`);
    detruits += S.stats.decorDetruit; embusc += S.stats.embuscades; durees.push(S.t);
  }
  verif(detruits > 30, 'bots : le décor est réellement détruit en partie', detruits);
  console.log(`  30 parties : ${detruits} éléments détruits, ${embusc} embuscades, durée moyenne ${(durees.reduce((a, b) => a + b) / durees.length).toFixed(1)} s, ${Date.now() - t0} ms`);
}
console.log(`\n${ok} vérifications réussies, ${ko} échecs`);
process.exit(ko ? 1 : 0);
