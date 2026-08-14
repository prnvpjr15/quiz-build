const $ = (id) => document.getElementById(id);

const views = {
  builder: $('builder'),
  loading: $('loading'),
  quiz: $('quiz'),
  results: $('results'),
};

let currentQuiz = null;

function show(name) {
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function clearError(el) {
  el.hidden = true;
  el.textContent = '';
}

// Surfaces the server's message rather than a generic failure — the API
// distinguishes 400 (bad input) from 503 (model under load), and that
// difference is exactly what the user needs to know.
async function readError(response) {
  try {
    const body = await response.json();
    if (response.status === 503) {
      return 'The model is busy right now. Wait a moment and try again.';
    }
    return body.error || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

/**
 * Renders question text, splitting a trailing code sample into its own block.
 * Uses textContent throughout: model output is untrusted and must never be
 * injected as HTML.
 */
function renderQuestionText(target, text) {
  const [intro, ...rest] = text.split('\n\n');
  const remainder = rest.join('\n\n');
  const looksLikeCode = /[{};()=>]|^\s{2,}/m.test(remainder);

  target.textContent = intro;

  if (remainder && looksLikeCode) {
    const code = document.createElement('code');
    code.textContent = remainder;
    target.appendChild(code);
  } else if (remainder) {
    target.textContent = text;
  }
}

function optionRow(name, value, labelText) {
  const label = document.createElement('label');
  label.className = 'opt';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;

  const span = document.createElement('span');
  span.textContent = labelText;

  label.append(input, span);
  return label;
}

function renderQuiz(quiz) {
  $('quiz-title').textContent = quiz.title;
  $('quiz-meta').textContent = `${quiz.questions.length} questions · ${quiz.difficulty}`;

  const container = $('questions');
  container.replaceChildren();

  quiz.questions.forEach((q, index) => {
    const card = document.createElement('div');
    card.className = 'q';

    const num = document.createElement('span');
    num.className = 'q-num';
    num.textContent = `Question ${index + 1}`;

    const text = document.createElement('p');
    text.className = 'q-text';
    renderQuestionText(text, q.question);

    card.append(num, text);

    if (q.type === 'multiple-choice') {
      q.options.forEach((opt, i) => card.appendChild(optionRow(q.id, String(i), opt)));
    } else if (q.type === 'true-false') {
      card.appendChild(optionRow(q.id, 'true', 'True'));
      card.appendChild(optionRow(q.id, 'false', 'False'));
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.name = q.id;
      input.placeholder = 'Your answer';
      card.appendChild(input);
    }

    container.appendChild(card);
  });
}

// Converts form state into the types the grader expects: an option index for
// multiple-choice, a boolean for true-false, a trimmed string otherwise.
function collectAnswers() {
  const form = $('answers-form');
  const answers = [];
  let unanswered = 0;

  currentQuiz.questions.forEach((q) => {
    const field = form.elements[q.id];

    if (q.type === 'short-answer') {
      const value = field.value.trim();
      if (!value) { unanswered += 1; return; }
      answers.push({ questionId: q.id, answer: value });
      return;
    }

    const picked = form.querySelector(`input[name="${q.id}"]:checked`);
    if (!picked) { unanswered += 1; return; }

    answers.push({
      questionId: q.id,
      answer: q.type === 'multiple-choice' ? Number(picked.value) : picked.value === 'true',
    });
  });

  return { answers, unanswered };
}

// Turns a stored answer back into display text using the question it belongs to.
function answerLabel(question, value) {
  if (value === null || value === undefined) return 'Not answered';
  if (question.type === 'multiple-choice') return question.options[value] ?? String(value);
  if (question.type === 'true-false') return value ? 'True' : 'False';
  return String(value);
}

function renderResults(graded) {
  const pct = Math.round((graded.score / graded.total) * 100);

  $('score-value').textContent = `${graded.score}/${graded.total}`;
  $('score-headline').textContent =
    pct === 100 ? 'Perfect score.' : pct >= 60 ? 'Nice work.' : 'Room to review.';
  $('score-sub').textContent = `You answered ${graded.score} of ${graded.total} correctly (${pct}%).`;

  const ring = $('score-ring');
  const tone = pct >= 60 ? 'var(--ok)' : 'var(--bad)';
  ring.style.background = `conic-gradient(${tone} ${pct}%, var(--border) 0)`;
  ring.style.boxShadow = 'inset 0 0 0 8px var(--surface)';

  const review = $('review');
  review.replaceChildren();

  graded.results.forEach((r, index) => {
    const question = currentQuiz.questions[index];

    const card = document.createElement('div');
    card.className = `result ${r.correct ? 'correct' : 'wrong'}`;

    const badge = document.createElement('span');
    badge.className = `verdict ${r.correct ? 'correct' : 'wrong'}`;
    badge.textContent = r.correct ? 'Correct' : 'Incorrect';

    const text = document.createElement('p');
    text.className = 'q-text';
    text.style.marginTop = '10px';
    renderQuestionText(text, r.question);

    const answers = document.createElement('div');
    answers.className = 'answers';

    const yours = document.createElement('div');
    const yoursKey = document.createElement('span');
    yoursKey.className = 'k';
    yoursKey.textContent = 'Your answer: ';
    yours.append(yoursKey, document.createTextNode(answerLabel(question, r.userAnswer)));
    answers.appendChild(yours);

    if (!r.correct) {
      const right = document.createElement('div');
      const rightKey = document.createElement('span');
      rightKey.className = 'k';
      rightKey.textContent = 'Correct answer: ';
      right.append(rightKey, document.createTextNode(answerLabel(question, r.correctAnswer)));
      answers.appendChild(right);
    }

    const why = document.createElement('p');
    why.className = 'explanation';
    why.textContent = r.explanation;

    card.append(badge, text, answers, why);
    review.appendChild(card);
  });
}

$('quiz-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError($('builder-error'));
  show('loading');

  const payload = {
    prompt: $('prompt').value.trim(),
    questionCount: Number($('questionCount').value),
    difficulty: $('difficulty').value,
    questionType: $('questionType').value,
  };

  try {
    const response = await fetch('/api/quiz/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      showError($('builder-error'), await readError(response));
      show('builder');
      return;
    }

    currentQuiz = await response.json();
    renderQuiz(currentQuiz);
    show('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showError($('builder-error'), `Could not reach the server: ${err.message}`);
    show('builder');
  }
});

$('answers-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError($('quiz-error'));

  const { answers, unanswered } = collectAnswers();
  if (unanswered > 0) {
    showError($('quiz-error'), `${unanswered} question${unanswered > 1 ? 's are' : ' is'} unanswered.`);
    return;
  }

  const button = $('submit-btn');
  button.disabled = true;
  button.textContent = 'Scoring…';

  try {
    const response = await fetch(`/api/quiz/${currentQuiz.quizId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });

    if (!response.ok) {
      showError($('quiz-error'), await readError(response));
      return;
    }

    renderResults(await response.json());
    show('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showError($('quiz-error'), `Could not reach the server: ${err.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Submit answers';
  }
});

function reset() {
  currentQuiz = null;
  $('answers-form').reset();
  clearError($('quiz-error'));
  clearError($('builder-error'));
  show('builder');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('restart-btn').addEventListener('click', reset);
$('again-btn').addEventListener('click', reset);
