/** Bungkus handler async agar error-nya masuk ke error middleware Express 4. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
