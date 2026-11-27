/* THE DARK ROOM — estado global do jogo */
(function () {
  const DR = window.DR;

  // Níveis disponíveis nesta versão (1 a 3). Os restantes ficam inacessíveis.
  DR.config = { maxLevel: 3 };

  DR.state = {
    mode: 'demo',          // 'demo' | 'xr'
    space: 'auto',         // 'auto' (hit-test / sala procedural) | 'manual'
    xrKind: null,          // 'ar' | 'vr' quando em sessão XR
    phase: 'menu',         // menu | placing | playing | ended
    modal: false,          // painel 3D aberto
    level: 0,
    startedAt: 0,
    dims: { w: 5.5, d: 5, h: 2.7 },
    randomRoom: true,
    // progresso
    levelClues: { 1: 0, 2: 0, 3: 0 },
    levelTotals: { 1: 4, 2: 4, 3: 8 },
    code: [],              // nível 1
    codeFound: [null, null, null, null],
    piecesCollected: [],   // nível 2
    sequence: [],          // nível 3 (nomes de símbolos)
    symbolsFound: [],
    relationsFound: [],    // [{a,b}]
    journal: [],           // mensagens de narrativa

    foundTotal() { let n = 0; for (let i = 1; i <= DR.config.maxLevel; i++) n += this.levelClues[i]; return n; },
    totalClues() { let n = 0; for (let i = 1; i <= DR.config.maxLevel; i++) n += this.levelTotals[i]; return n; },

    reset() {
      this.phase = 'menu';
      this.modal = false;
      this.level = 0;
      this.levelClues = { 1: 0, 2: 0, 3: 0 };
      this.code = [];
      this.codeFound = [null, null, null, null];
      this.piecesCollected = [];
      this.sequence = [];
      this.symbolsFound = [];
      this.relationsFound = [];
      this.journal = [];
    },
  };
})();
