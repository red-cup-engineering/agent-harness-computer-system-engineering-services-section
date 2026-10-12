// A quote-aware reading of one shell command, so a guard can tell a real
// invocation from a mention of one inside a quoted argument. A naive split
// cuts a real invocation in half wherever its own argument text contains a
// separator -- a `git commit -m "fixes npm install"` message, a
// `grep -i "a|b"` alternation -- silently truncating away the very flags or
// prose a guard needs to read, and a naive substring match denies a command
// that runs nothing at all because its commit message argues against one.
//
// Nothing here executes anything: this is a reading of command text.

/**
 * Splits a shell command into its top-level segments at `&&`, `||`, `;` and
 * `|`, skipping any separator inside a quoted string or right after a
 * backslash.
 *
 * @param {string} command - the shell command text.
 * @returns {string[]} one entry per top-level segment.
 */
export function splitShellCommandTopLevel(command) {
  const segments = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (!inSingle && char === "\\") {
      current += char + (command[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      current += char;
      continue;
    }
    if (!inSingle && char === "\"") {
      inDouble = !inDouble;
      current += char;
      continue;
    }
    if (!inSingle && !inDouble) {
      if ((char === "&" || char === "|") && command[index + 1] === char) {
        segments.push(current);
        current = "";
        index += 1;
        continue;
      }
      if (char === ";" || char === "|") {
        segments.push(current);
        current = "";
        continue;
      }
    }
    current += char;
  }
  segments.push(current);
  return segments;
}

function tokenizeQuoted(segment) {
  const tokens = [];
  let current = "";
  let started = false;
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (!inSingle && char === "\\") {
      current += segment[index + 1] ?? "";
      index += 1;
      started = true;
      continue;
    }
    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      started = true;
      continue;
    }
    if (!inSingle && char === "\"") {
      inDouble = !inDouble;
      started = true;
      continue;
    }
    if (!inSingle && !inDouble && /\s/u.test(char)) {
      if (started) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

/**
 * Each top-level segment's tokens, quote-aware: a quoted argument's own text
 * never contributes a token of its own program name, so a caller matching on
 * `tokens[0]` never mistakes prose inside quotes for an invoked command.
 *
 * @param {string} command - the shell command text.
 * @returns {string[][]} one token list per top-level segment.
 */
export function shellCommandSegmentTokens(command) {
  return splitShellCommandTopLevel(command).map((segment) => tokenizeQuoted(segment));
}

/**
 * Every real invocation of `program` in a command's top-level segments --
 * `npm` in `npm install foo`, but never inside a quoted commit message that
 * merely mentions it. Each match is that segment's tokens after the program
 * name: its subcommand and arguments.
 *
 * @param {string} command - the shell command text.
 * @param {string} program - the program name to find.
 * @returns {string[][]} the arguments of each matching invocation.
 */
export function commandInvocations(command, program) {
  return shellCommandSegmentTokens(command)
    .filter((tokens) => tokens.includes(program))
    .map((tokens) => tokens.slice(tokens.indexOf(program) + 1));
}
