/* THE DARK ROOM — narrativa. Cada pista encontrada revela um fragmento. */
(function () {
  const DR = window.DR;

  DR.story = {
    intro: [
      'Acordas às escuras e não sabes onde estás.',
      'Tens uma lanterna. Há números escondidos nas paredes e nos objetos.',
    ],
    demoEnd: 'A porta abriu. A demonstração fica por aqui.',
    levels: {
      1: {
        title: 'Nível 1 · O código',
        sub: 'Procura os números com a lanterna.',
        objective: 'Encontra os 4 números e escreve o código no teclado.',
        clues: [
          'Nota colada à parede: «Dia 1. Entrou por vontade própria.»',
          '«Dia 9. Já não pergunta pela luz.»',
          '«Dia 31. Pediu para sair. A porta tem código.»',
          '«Dia 40. O código é o que ele próprio escolheu.»',
        ],
        outro: 'A porta abriu.',
      },
      2: {
        title: 'Nível 2 · O puzzle',
        sub: 'Reúne os fragmentos e roda os cubos.',
        objective: 'Recolhe 4 fragmentos escondidos. Cada um mostra o símbolo certo de um cubo. Roda os cubos até acertares.',
        clues: [
          'Um fragmento de fotografia. Alguém riscou um símbolo por cima.',
          'Outro pedaço. Os traços por baixo parecem indicar uma ordem.',
          'Reconheces a caligrafia no verso. É a tua.',
          'A fotografia nunca foi do Dr. Vale. Foste tu que a tiraste.',
        ],
        outro: 'Os cubos encaixam. Algures, algo abre-se.',
      },
      3: {
        title: 'Nível 3 · A verdade',
        sub: 'Observa os símbolos. Descobre quem conduz quem.',
        objective: 'Encontra os símbolos e as setas que os ligam. Introduz a sequência no altar.',
        clues: [
          'Alguém gravou estes símbolos antes de ti.',
          'Não estão aqui por acaso. Cada um chama o seguinte.',
          'Procura as setas: dizem-te quem conduz quem.',
          'Um dos símbolos não pertence ao ritual. Mente.',
          'A tua mão tremia quando os desenhaste.',
          'Uma seta liga dois símbolos.',
          'Outra seta. O ritual tem uma ordem.',
          'A última seta. Agora só falta lembrares-te.',
        ],
        outro: 'A porta abre-se.',
      },
    },
    ending: [
      'Lá fora não há luz. Há apenas o resto da sala.',
      'Tu és o Sujeito 17. Foste tu que construíste esta sala — para esquecer.',
      'E agora lembraste.',
    ],
  };
})();
