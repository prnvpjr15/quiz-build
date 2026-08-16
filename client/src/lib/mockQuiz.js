// Placeholder question bank. Shapes match what the real endpoint will return
// so the swap in mockApi.js is the only change needed to go live.
const BANK = [
  {
    type: 'multiple-choice',
    question: 'Which event is generally considered the start of World War II in Europe?',
    options: [
      'The invasion of Poland',
      'The attack on Pearl Harbor',
      'The Munich Agreement',
      'The Battle of Britain',
    ],
    correctAnswer: 'The invasion of Poland',
    explanation: 'Germany invaded Poland on 1 September 1939, prompting Britain and France to declare war.',
  },
  {
    type: 'true-false',
    question: 'The Battle of Stalingrad ended in a decisive Soviet victory.',
    correctAnswer: true,
    explanation: 'The encircled German Sixth Army surrendered in February 1943.',
  },
  {
    type: 'fill-in-blank',
    question: 'The Allied invasion of Normandy on 6 June 1944 is known as ______.',
    correctAnswer: 'D-Day',
    explanation: 'Operation Overlord began with the Normandy landings, commonly called D-Day.',
  },
  {
    type: 'short-answer',
    question: 'Which conference divided post-war Germany into occupation zones?',
    correctAnswer: 'Yalta Conference',
    explanation: 'The February 1945 Yalta Conference set out the occupation zones.',
  },
  {
    type: 'multiple-choice',
    question: 'Which country remained officially neutral throughout the war?',
    options: ['Switzerland', 'Belgium', 'Norway', 'Greece'],
    correctAnswer: 'Switzerland',
    explanation: 'Switzerland maintained armed neutrality for the duration of the conflict.',
  },
  {
    type: 'true-false',
    question: 'The United States entered the war before the attack on Pearl Harbor.',
    correctAnswer: false,
    explanation: 'The US declared war the day after the 7 December 1941 attack.',
  },
  {
    type: 'fill-in-blank',
    question: 'The intelligence operation that broke the German Enigma cipher was based at ______ Park.',
    correctAnswer: 'Bletchley',
    explanation: 'Bletchley Park housed the British codebreaking effort.',
  },
  {
    type: 'short-answer',
    question: 'Name the operation that was the German invasion of the Soviet Union.',
    correctAnswer: 'Operation Barbarossa',
    explanation: 'Launched in June 1941, it was the largest land invasion in history.',
  },
  {
    type: 'multiple-choice',
    question: 'Which battle is regarded as the turning point of the Pacific theatre?',
    options: ['Midway', 'Iwo Jima', 'Guadalcanal', 'Leyte Gulf'],
    correctAnswer: 'Midway',
    explanation: 'The June 1942 battle cost Japan four fleet carriers and the initiative.',
  },
  {
    type: 'true-false',
    question: 'The Marshall Plan was a programme of post-war economic aid to Europe.',
    correctAnswer: true,
    explanation: 'It provided over $13 billion to rebuild Western European economies.',
  },
  {
    type: 'short-answer',
    question: 'In which year did the war in Europe end?',
    correctAnswer: '1945',
    explanation: 'Germany surrendered unconditionally in May 1945.',
  },
  {
    type: 'fill-in-blank',
    question: 'The Allied airlift that supplied a blockaded city in 1948 was the ______ Airlift.',
    correctAnswer: 'Berlin',
    explanation: 'The Berlin Airlift supplied West Berlin for nearly a year.',
  },
];

function shuffle(items) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

// Builds a quiz of the requested size from the requested types, cycling the
// bank when more questions are asked for than it holds.
export function buildMockQuiz({ topic, difficulty, types, questionCount }) {
  const wanted = types.includes('mixed')
    ? BANK
    : BANK.filter((question) => types.includes(question.type));

  const pool = wanted.length > 0 ? wanted : BANK;
  const picked = [];

  while (picked.length < questionCount) {
    picked.push(...shuffle(pool));
  }

  return {
    quizId: `mock-${Date.now()}`,
    title: topic.trim(),
    topic: topic.trim(),
    difficulty,
    questions: picked.slice(0, questionCount).map((question, index) => ({
      id: `q-${index + 1}`,
      ...question,
    })),
  };
}
