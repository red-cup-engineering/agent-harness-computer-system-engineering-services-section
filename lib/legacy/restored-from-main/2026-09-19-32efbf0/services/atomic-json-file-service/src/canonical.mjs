/**
 * Canonicalizes a JSON-compatible value into a key-sorted string, so two
 * values compare structurally equal regardless of object key order.
 *
 * @param {*} value A JSON-compatible value (object, array, or primitive).
 * @returns {string} The key-sorted canonical string form of the value.
 */
export function canonicalizeJsonValue(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalizeJsonValue).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeJsonValue(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
