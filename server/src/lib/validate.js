// server/src/lib/validate.js (ESM)

export function requireFields(obj, fields) {
  const missing = fields.filter(
    (f) => obj[f] === undefined || obj[f] === null || obj[f] === ""
  );
  if (missing.length) {
    const err = new Error("Missing required fields: " + missing.join(", "));
    err.status = 400;
    throw err;
  }
}

export function expectNumber(x, name) {
  if (typeof x !== "number" || Number.isNaN(x)) {
    const err = new Error(`${name} must be a number`);
    err.status = 400;
    throw err;
  }
}
