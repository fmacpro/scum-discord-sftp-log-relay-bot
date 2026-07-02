---
name: run-tests
description: 'Run the SCUM bot test suite and interpret results. Use when: asked to run tests, check test output, debug failing tests, or verify code changes.'
argument-hint: 'Test file or pattern to run (optional)'
---

# Run Tests

## When to Use
- Asked to run the test suite
- Need to verify code changes don't break existing tests
- Debugging a failing test
- Adding new tests and need to confirm they pass

## Procedure

1. **Run all tests:**
   ```bash
   npm test
   ```

2. **Run a specific test file:**
   ```bash
   node --test test/players.test.js
   ```

3. **Run tests with a specific name pattern:**
   ```bash
   node --test --test-name-pattern="registration" test/discord.test.js
   ```

4. **Interpret results:**
   - Tests use Node's built-in test runner (`node:test`) and `node:assert/strict`.
   - Passing tests show ✅ / ✔️ indicators.
   - Failing tests include a diff of the expected vs actual values.
   - If a test fails, read the error message and the relevant source file, then fix and re-run.

## Notes
- Test files live in `test/` and mirror controller names (e.g., `test/players.test.js` tests `controllers/players.js`).
- Test fixtures are in `test/fixtures/players.json`.
