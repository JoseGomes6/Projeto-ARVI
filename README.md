# THE DARK ROOM — Adaptive Escape Room (A-Frame / WebXR)

Protótipo de um Escape Room em realidade aumentada/mista para a UC *Ambientes Interativos de Realidade Virtual*.
Esta versão tem só o nível 1. A sala **não é fixa**: adapta-se ao espaço físico (AR hit-test), às dimensões definidas pelo utilizador (modo manual) ou
é gerada proceduralmente (modo DEMO). Tudo está às escuras; só a lanterna revela as pistas.

## Como correr

Sem *build*: HTML + CSS + JS e A-Frame 1.6 incluído em `vendor/`.

```bash
python3 -m http.server 8000      # ou: npx serve .
# abrir http://localhost:8000
```

* **DEMO (PC)** — escolher *DEMO* e `START GAME`. Clicar no ecrã captura o rato.
  `WASD` mover · `Shift` correr · `E`/clique interagir · `F` lanterna · roda do rato foca o feixe · `Q` fecha painéis · `H` ajuda.
  Em telemóvel sem WebXR, a orientação do dispositivo controla a lanterna (toque = interagir).
* **WebXR (Quest / Chrome Android)** — exige **HTTPS** (ou `localhost` via `adb reverse tcp:8000 tcp:8000`).
  Opções: `ngrok http 8000`, `npx local-ssl-proxy`, ou GitHub Pages.
  * **AR**: marca paredes/mesas/chão com a mira (toque / gatilho). A sala real fica quase preta, exceto onde o feixe passa.
  * **VR**: sala virtual à medida. Comando direito = lanterna · gatilho interagir · grip liga/desliga · A/X ajuda · B/Y fecha painel · stick esquerdo move.
* `?reveal` no URL mostra todas as pistas (debug); `?autostart` salta o menu.

## Arquitetura

```
index.html                 cena A-Frame + todo o DOM de UI dentro de #overlay (funciona com WebXR DOM overlay)
css/style.css              estética: preto/cinzento, detalhes vermelhos, grão e vinheta
js/core/                   módulos (namespace global DR, sem dependências de build)
  util.js  state.js        utilitários + barramento de eventos (DR.bus) · estado global do jogo
  layout.js                ★ geração adaptativa: superfícies (pos+normal+tipo) a partir de sala virtual OU âncoras reais
  levels.js                progressão e lógica dos níveis (spawn de pistas/estações, conclusão, final)
  panels.js                painéis 3D interativos: teclado, mesa de montagem, altar de símbolos
  story.js  ui.js          narrativa (legendas + diário) · HUD, menus, cartões de título
  input.js  audio.js       entradas unificadas (teclado/rato/toque/XR) · som sintetizado (WebAudio)
  textures.js              texturas procedurais (paredes, números riscados, símbolos, sigilo e peças do puzzle)
js/components/             componentes A-Frame
  flashlight.js            SpotLight + cone volumétrico; sistema `torch` expõe o feixe (origem, direção, ângulo)
  hidden-clue.js           ★ pista invisível; revela-se progressivamente só sob luz direta (cone + alcance + orientação + oclusão)
  interaction.js           raio de pontaria vs `interactable` e vs geometria sólida (interação + colisão/oclusão)
  dark-veil.js             AR: esfera negra com máscara cónica => escuridão sobre a sala real
  anchor-placer.js         AR hit-test (e fallbacks) para marcar superfícies
  room-builder.js          sala virtual (DEMO/MANUAL) com adereços e texturas; oculta em AR
  locomotion.js            WASD com colisões / stick VR
  vr-hud.js  ui-button.js  HUD 3D para headsets · botões/etiquetas 3D desenhados em canvas
  props.js                 glifos, terminais, LED, porta
js/main.js                 menu, deteção WebXR, escolha de modo e espaço, arranque
```

### Fluxo do espaço adaptável
1. **AR + automático**: `anchor-placer` usa `XRHitTestSource`; cada toque guarda `{pos, normal}` → `Layout.fromAnchors`
   classifica (parede/mesa/chão/teto), escolhe a porta e completa com pontos sintéticos se faltarem.
2. **Manual / DEMO / VR**: `Layout.virtual` cria uma sala com dimensões (aleatórias ou introduzidas), porta e adereços
   (mesas, caixotes, estantes…) sem sobreposições; o jogador pode ainda marcar âncoras que passam a ter prioridade.
3. `Layout.pick()` escolhe superfícies com **amostragem de máxima dispersão**, por isso as pistas ficam espalhadas e a
   disposição muda em cada partida (códigos, sequências e sigilo também são aleatórios).

### Mecânica da lanterna
O feixe (`torch.beam`) é um cone matemático partilhado. Cada `hidden-clue` calcula o ângulo ao eixo do feixe (descontando
o tamanho angular do objeto), alcance, se a superfície olha para o jogador e se há oclusão (raycast). Sob luz direta o
valor `r` sobe (≈1 s) e a opacidade cresce com cintilação; sem luz volta a desvanecer. Em AR o `dark-veil` aplica a mesma
máscara a uma esfera preta, deixando ver a sala real apenas dentro do feixe.

## Nível disponível
**Nível 1 · O código:** 4 números escondidos (parede, mesa ou objeto, perto da porta, chão ou objeto). Cada um tem traços que indicam a posição. O código escreve-se num teclado 3D e abre a porta.

## Notas e limitações
* Testado em Chromium desktop (modo DEMO, manual e o nível 1 até ao final). O código WebXR (hit-test, controladores, véu AR,
  HUD 3D) está implementado mas **precisa de ser validado em dispositivo** (Quest 3 / Android Chrome).
* O hit-test deteta o que o dispositivo expõe; paredes só são detetadas em dispositivos com *scene understanding*.
  Em caso de falha há fallback para marcação por olhar e para o modo manual.
* A orientação dos controladores usa `laser-controls` (targetRaySpace); se o aparelho for diferente pode ser preciso ajustar `flashlight.js`.
