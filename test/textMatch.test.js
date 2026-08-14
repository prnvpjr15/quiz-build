const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, similarity, levenshtein } = require('../src/textMatch');

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

test('levenshtein counts single-character edits', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('same', 'same'), 0);
  assert.equal(levenshtein('', 'abc'), 3);
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
