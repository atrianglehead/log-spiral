// ES module: log-spiral helpers
export const TAU = Math.PI * 2;
export const log2 = (x) => Math.log(x) / Math.log(2);

// r(θ) = x * 2^(θ / 2π)
export const radiusAt = (xBase, theta) => xBase * Math.pow(2, theta / TAU);

// For integer multiple k: θ_k = 2π log2(k)
export const thetaForMultiple = (k) => TAU * log2(k);
