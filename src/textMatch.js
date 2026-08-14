// Cheap, deterministic text comparison used as the first two stages of
// short-answer grading, before falling back to a model call.

const COMBINING_MARKS = /[̀-ͯ]/g;
const LEADING_ARTICLE = /^(?:a|an|the)\s+/;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}\s]/gu;

// Folds away the differences that never change whether an answer is right:
// case, accents, punctuation, spacing, and a leading article.
function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_ARTICLE, '');
}

// Damerau-Levenshtein (optimal string alignment): like Levenshtein, but a
// transposition costs one edit rather than two. Adjacent-character swaps are
// the most common typing error, and plain Levenshtein double-charges them —
// which pushed real typos like "cosnt" and "serach" below the match threshold.
function editDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Three rows rather than two, because a transposition looks back two.
  let twoBack = new Array(b.length + 1);
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], twoBack[j - 2] + 1);
      }
    }

    [twoBack, previous, current] = [previous, current, twoBack];
  }

  return previous[b.length];
}

// 1 = identical, 0 = nothing in common. Compares normalized forms, so callers
// get typo and pluralization tolerance without doing their own cleanup.
function similarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);

  if (left === right) return 1;

  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;

  return 1 - editDistance(left, right) / longest;
}

// A ratio threshold is harsh on short answers: one wrong character in a
// five-letter word costs 20% of the score, so "cosnt" for "const" fails a
// threshold that "binary serach" passes. Below, a single edit is also accepted
// outright for short answers.
//
// The window starts at 4 characters so genuinely different three-letter
// answers ("cat"/"cut") are not swept in, and stops at 8 because longer
// answers are already served well by the ratio.
const SHORT_ANSWER_MIN = 4;
const SHORT_ANSWER_MAX = 8;

function isFuzzyMatch(a, b, threshold) {
  if (similarity(a, b) >= threshold) return true;

  const left = normalize(a);
  const right = normalize(b);
  const longest = Math.max(left.length, right.length);

  if (longest < SHORT_ANSWER_MIN || longest > SHORT_ANSWER_MAX) return false;

  return editDistance(left, right) <= 1;
}

module.exports = { normalize, similarity, isFuzzyMatch, editDistance };
