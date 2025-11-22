module.exports.verifyFace = async function verifyFace({ selfieBuffer, docBuffer }) {
  // ⚠️ This is a DEMO / FAKE face recognition
  // It lets your app work without real AI

  // LIVENESS estimation (fake)
  function variance(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const mean = sum / buf.length;

    let sq = 0;
    for (let i = 0; i < buf.length; i++) {
      const diff = buf[i] - mean;
      sq += diff * diff;
    }
    return sq / buf.length;
  }

  const liveScore = Math.tanh(variance(selfieBuffer) / 5000);
  const livePassed = liveScore > 0.35;

  // FAKE similarity
  function checksum(buf) {
    let x = 0;
    for (let i = 0; i < buf.length; i += Math.max(1, Math.floor(buf.length / 100))) {
      x = (x + buf[i]) % 100000;
    }
    return x;
  }

  const cs1 = checksum(selfieBuffer);
  const cs2 = checksum(docBuffer || Buffer.alloc(1));

  const diff = Math.abs(cs1 - cs2);
  const similarity = Math.max(0, 1 - diff / 100000);

  const matched = similarity > 0.42 && livePassed;

  return {
    score: Number(similarity.toFixed(3)),
    matched,
    liveness: {
      score: Number(liveScore.toFixed(3)),
      passed: livePassed,
    },
  };
};
