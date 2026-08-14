const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, similarity, isFuzzyMatch, editDistance } = require('../src/textMatch');

const THRESHOLD = 0.85;

test('normalize folds case, punctuation, and surrounding whitespace', () => {
  assert.equal(normalize('  Lexical Environment!  '), 'lexical environment');
  assert.equal(normalize('event-loop'), 'event loop');
});

test('normalize strips accents so equivalent spellings compare equal', () => {
  assert.equal(normalize('café'), normalize('cafe'));
  assert.equal(normalize('naïve'), 'naive');
});

test('normalize drops a leading article', () => {
  assert.equal(normalize('the call stack'), 'call stack');
  assert.equal(normalize('a closure'), 'closure');
  assert.equal(normalize('An event loop'), 'event loop');
});

test('normalize keeps an article that is not leading', () => {
  assert.equal(normalize('top of the stack'), 'top of the stack');
});

test('normalize collapses runs of whitespace', () => {
  assert.equal(normalize('lexical    environment'), 'lexical environment');
});

test('editDistance counts single-character edits', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('same', 'same'), 0);
  assert.equal(editDistance('', 'abc'), 3);
});

// The reason for Damerau over plain Levenshtein: a swap is one typing mistake,
// and charging it as two pushed real typos below the match threshold.
test('editDistance charges a transposition as one edit, not two', () => {
  assert.equal(editDistance('cosnt', 'const'), 1);
  assert.equal(editDistance('serach', 'search'), 1);
  assert.equal(editDistance('ab', 'ba'), 1);
});

test('isFuzzyMatch accepts typos and inflections in longer answers', () => {
  assert.equal(isFuzzyMatch('binary serach', 'binary search', THRESHOLD), true);
  assert.equal(isFuzzyMatch('lexical environments', 'lexical environment', THRESHOLD), true);
});

// A ratio threshold alone is too harsh here: one wrong character in a
// five-letter word costs 20%.
test('isFuzzyMatch accepts a single edit in a short answer below the ratio', () => {
  assert.ok(similarity('cosnt', 'const') < THRESHOLD, 'ratio alone would reject this');
  assert.equal(isFuzzyMatch('cosnt', 'const', THRESHOLD), true);
});

test('isFuzzyMatch still rejects genuinely different short answers', () => {
  assert.equal(isFuzzyMatch('let', 'const', THRESHOLD), false);
  assert.equal(isFuzzyMatch('queue', 'stack', THRESHOLD), false);
  assert.equal(isFuzzyMatch('post', 'put', THRESHOLD), false);
  assert.equal(isFuzzyMatch('heap', 'stack', THRESHOLD), false);
});

// The short-answer allowance deliberately starts at 4 characters so that
// three-letter words a single edit apart are not swept in.
test('isFuzzyMatch does not apply the short-answer allowance to tiny answers', () => {
  assert.equal(isFuzzyMatch('cat', 'cut', THRESHOLD), false);
  assert.equal(isFuzzyMatch('10', '11', THRESHOLD), false);
});

test('isFuzzyMatch rejects a two-edit difference in a short answer', () => {
  assert.equal(isFuzzyMatch('pots', 'put', THRESHOLD), false);
});

test('similarity is 1 for answers that differ only in formatting', () => {
  assert.equal(similarity('The Call Stack.', 'call stack'), 1);
});

test('similarity stays high for plurals and typos', () => {
  assert.ok(similarity('lexical environments', 'lexical environment') >= 0.85);
  assert.ok(similarity('lexcial environment', 'lexical environment') >= 0.85);
});

test('similarity is low for genuinely different answers', () => {
  assert.ok(similarity('call stack', 'lexical environment') < 0.5);
  assert.ok(similarity('heap', 'stack') < 0.85);
});

test('similarity treats two empty answers as identical without dividing by zero', () => {
  assert.equal(similarity('', '   '), 1);
});
