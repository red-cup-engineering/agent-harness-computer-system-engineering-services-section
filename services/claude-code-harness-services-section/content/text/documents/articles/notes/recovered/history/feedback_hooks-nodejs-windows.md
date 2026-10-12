---

name: Hooks must be Node.js on Windows
description: Python hooks with sys.stdin.read() hang on Windows in synchronous mode — always use Node.js for hooks
---

Python hooks using `sys.stdin.read()` hang indefinitely on Windows when run as synchronous PreToolUse hooks.

**Why:** Python's stdin reading blocks forever when the pipe isn't closed properly on Windows. Node.js event-based stdin handling works reliably. All hooks have been converted to JS.

**How to apply:** All hooks must be Node.js. Never add a Python hook, synchronous or async. The conversion is complete — no Python hooks remain in the harness.
