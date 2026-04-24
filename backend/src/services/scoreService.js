const DEFAULT_WEIGHTS = { w1: 0.35, w2: 0.35, w3: 0.30 };

function calcScore(conflict, disaster, food, weights = DEFAULT_WEIGHTS) {
  const { w1, w2, w3 } = weights;
  return w1 * conflict + w2 * disaster + w3 * food;
}

module.exports = { calcScore, DEFAULT_WEIGHTS };
