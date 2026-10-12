// settling : potential-scott-continuous-posit-cell -> finite-settlement-cell
//
// Resolves a posited cell to a finite-step algebraic outcome by stamping settled=true. This is the
// strict-finite regime (kappa < omega) -- the textbook-algebra shadow. Rejects "bottom": there is
// nothing to settle until evidence has been posited.

const SETTLEABLE = ["true", "false", "top"];

export default function settling(cell) {
  if (!cell || !SETTLEABLE.includes(cell.value))
    throw new TypeError(`settling: input.value must be one of ${SETTLEABLE.join(", ")}`);
  return { ...cell, settled: true };
}
