/* Équilibrage : N parties de bots, éliminations / top 3 / victoires par personnage.  Lancer : node outils/tests-arene/equilibrage.js 160 */
global.window = global; const fs = require('fs'), vm = require('vm'), D = require('path').join(__dirname, '../../arene/') + '/';
vm.runInThisContext(fs.readFileSync(D + 'config.js', 'utf8')); vm.runInThisContext(fs.readFileSync(D + 'moteur.js', 'utf8'));
const M = ARENE_MOTEUR, C = ARENE_CONFIG, kills = {}, top3 = {}, wins = {}; let T = 0; const N = +process.argv[2] || 80;
for (let g = 1; g <= N; g++) {
  const parts = C.PERSONNAGES.map((p, i) => ({ nom: 'B' + i, perso: p.id, humain: false, niveau: [0, 300, 1000, 5000][g % 4] }));
  const S = M.creerSimulation({ graine: g * 104729, participants: parts });
  while (!S.fini) { S.pas(1 / 30, null); S.ev.length = 0; }
  T += S.t; S.f.forEach(f => { kills[f.perso] = (kills[f.perso] || 0) + f.kills; if (f.place <= 3) top3[f.perso] = (top3[f.perso] || 0) + 1; if (f.place === 1) wins[f.perso] = (wins[f.perso] || 0) + 1; });
}
console.log('durée moyenne', (T / N).toFixed(1), 's');
C.PERSONNAGES.forEach(p => console.log(p.id.padEnd(9), 'élim', String(kills[p.id] || 0).padStart(4), ' top3', String(top3[p.id] || 0).padStart(3), ' victoires', wins[p.id] || 0));
