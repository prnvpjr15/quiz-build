function isCorrect(question, userAnswer) {
  switch (question.type) {
    case 'multiple-choice':
      return Number(userAnswer) === question.correctAnswerIndex;
    case 'true-false':
      return Boolean(userAnswer) === question.correctAnswer;
    case 'short-answer':
      return String(userAnswer).trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
    default:
      return false;
  }
}

function gradeQuiz(quiz, answers) {
  const answersByQuestionId = new Map(answers.map((a) => [a.questionId, a.answer]));

  const results = quiz.questions.map((question) => {
    const userAnswer = answersByQuestionId.get(question.id);
    const correct = userAnswer !== undefined && isCorrect(question, userAnswer);

    return {
      questionId: question.id,
      question: question.question,
      correct,
      userAnswer: userAnswer ?? null,
      correctAnswer: question.type === 'multiple-choice' ? question.correctAnswerIndex : question.correctAnswer,
      explanation: question.explanation,
    };
  });

  const score = results.filter((r) => r.correct).length;

  return { score, total: results.length, results };
}

module.exports = { gradeQuiz };
