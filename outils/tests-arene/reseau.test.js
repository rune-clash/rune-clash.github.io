/* Réseau : matchmaking et sessions hôte/invités avec une base en mémoire (même API que Firebase).  Lancer : node outils/tests-arene/reseau.test.js */
global.window = global; global.navigator = { onLine: true };
const fs = require('fs'), vm = require('vm');
const D = require('path').join(__dirname, '../../arene/') + '/';
['config.js', 'moteur.js', 'reseau.js'].forEach(f => vm.runInThisContext(fs.readFileSync(D + f, 'utf8')));
// base partagée en mémoire, même API que l'adaptateur du jeu, avec ~40 ms de latence
const db = {}, ls = [];
const parts = p => p.split('/').filter(Boolean);
const get = p => parts(p).reduce((o, k) => o && o[k], db);
const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
const set = (p, v) => { const k = parts(p); let o = db; k.slice(0, -1).forEach(x => { o[x] = o[x] && typeof o[x] === 'object' ? o[x] : {}; o = o[x]; }); if (v == null) delete o[k[k.length - 1]]; else o[k[k.length - 1]] = clone(v); notifier(); };
const notifier = () => setTimeout(() => ls.forEach(l => { const v = JSON.stringify(clone(get(l.p))); if (v !== l.last) { l.last = v; l.cb(JSON.parse(v)); } }), 40);
let n = 0;
const A = {
  set: (p, v) => (set(p, v), Promise.resolve()), update: (p, o) => { Object.keys(o).forEach(k => set(p + '/' + k, o[k])); return Promise.resolve(); },
  remove: p => (set(p, null), Promise.resolve()), get: p => Promise.resolve(clone(get(p))), key: () => 'k' + (n++) + Math.random().toString(36).slice(2, 6),
  on: (p, cb) => { const l = { p, cb, last: undefined }; ls.push(l); setTimeout(() => { l.last = JSON.stringify(clone(get(p))); cb(JSON.parse(l.last)); }, 10); return () => { const i = ls.indexOf(l); i >= 0 && ls.splice(i, 1); }; },
  top: (p, c, k) => { const o = get(p) || {}, out = {}; Object.keys(o).sort((a, b) => (o[b][c] || 0) - (o[a][c] || 0)).slice(0, k).forEach(x => out[x] = clone(o[x])); return Promise.resolve(out); },
  ts: () => Date.now(), onDisc: () => Promise.resolve()
};
const joueur = i => ({ ready: true, user: { uid: 'u' + i }, me: { pseudo: 'Joueur' + i }, db: () => A });
const R = window.ARENE_RESEAU, sessions = [], persos = ['rin', 'bram', 'hikari'];
function lancer(i) {
  global.NET = joueur(i);
  R.chercher({ moi: { nom: 'Joueur' + i, perso: persos[i], trophees: 100 * i, cadre: 'base' },
    onMaj: info => { if (info.etape !== 'recherche') last[i] = info.etape + ':' + info.joueurs.length; },
    onPret: s => { sessions[i] = s; console.log('joueur', i, 'prêt :', s.role, 'slot', s.moi, '| humains', s.participants.filter(p => p.humain).map(p => p.nom).join(',')); s.demarrer(); } });
}
const last = {};
lancer(0); setTimeout(() => lancer(1), 300); setTimeout(() => lancer(2), 700);
let tick = setInterval(() => sessions.forEach(s => s && s.role === 'invite' && s.maj(1 / 30)), 33);
setTimeout(() => {
  if (sessions.filter(Boolean).length < 3) { console.log('ÉCHEC : sessions', sessions.map(s => s && s.role), last); process.exit(1); }
  const hote = sessions.find(s => s.role === 'hote'), inv = sessions.filter(s => s.role === 'invite');
  const g = inv[0], fh = hote.sim.f[g.moi], x0 = fh.x;
  console.log('graines identiques :', inv.every(s => s.vue.carte.graine === hote.sim.carte.graine), '| invités ont reçu l\'état :', inv.map(s => s.vue.t.toFixed(1)).join(','));
  g.commandes({ mx: 1, my: 0 });
  setTimeout(() => {
    g.commandes({ mx: 0, my: 0 });
    console.log('déplacement de l\'invité vu par l\'hôte :', x0.toFixed(2), '→', fh.x.toFixed(2), '| prédiction invité :', g.vue.f[g.moi].x.toFixed(2));
    const mun0 = fh.charges; g.tirer({ a: 0, d: 5 });
    setTimeout(() => {
      console.log('tir de l\'invité appliqué par l\'hôte :', mun0.toFixed(2), '→', fh.charges.toFixed(2));
      /* esquive d'un invité : prédite tout de suite chez lui, exécutée par l'hôte */
      const xg = g.vue.f[g.moi].x; hote.evenements();
      g.esquiver({ a: 0 });
      setTimeout(() => {
        const ev1 = hote.evenements();
        console.log('esquive invité : hôte', ev1.some(e => e.k === 'esquive' && e.s === g.moi), '| prédiction locale', (g.vue.f[g.moi].x - xg).toFixed(2), 'm');
        /* rafale de 6 pressions : l'hôte en accepte au plus 3 */
        fh.charges = 3;
        let n = 0; const iv = setInterval(() => { g.tirer({ a: 0, d: 5 }); if (++n >= 6) clearInterval(iv); }, 40);
        setTimeout(() => {
          const ev2 = hote.evenements().filter(e => e.s === g.moi);
          console.log('rafale invité : attaques', ev2.filter(e => e.k === 'atk').length, '(max 3) | refus', ev2.filter(e => e.k === 'refus').length, '| refus vus par l\'invité', g.evenements().filter(e => e.k === 'refus' && e.s === g.moi).length);
      let finis = 0;
      sessions.forEach((s, i) => { s.onElimine(p => console.log('joueur', i, 'éliminé, place', p)); s.onFin(r => { finis++; const pl = r.places.slice().sort((a, b) => a - b).join(','); console.log('joueur', i, 'fin reçue', r.interrompue ? '(interrompue)' : '', 'places valides :', pl === '1,2,3,4,5,6,7,8,9,10'); }); });
      hote.finirVite();
      setTimeout(() => { console.log('fins reçues :', finis, '/ 3'); clearInterval(tick); process.exit(0); }, 2000);
        }, 1200);
      }, 500);
    }, 600);
  }, 1500);
}, 20000);
