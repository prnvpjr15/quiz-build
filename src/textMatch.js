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

// Two-row Levenshtein: O(min(a,b)) memory, which is all this needs since
// short answers are short by construction.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }

    [previous, current] = [current, previous];
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

  return 1 - levenshtein(left, right) / longest;
}

module.exports = { normalize, similarity, levenshtein };
