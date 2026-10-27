# Contributing to OnThread

Thanks for helping. OnThread aims to stay **small, quiet and dependency-free**.

## Development

Fork or download the repository from GitHub, then, in its folder:

```bash
npm test                     # unit + integration tests, no install needed (Node 18+)
claude --plugin-dir .        # try your changes in a real Claude Code session
```

Optional, it uses your Claude Code quota:

```bash
npm run eval                 # live evaluation: runs claude -p on fictional scenarios
```

The live evaluation writes `docs/EVAL-RESULTS.md`. Set `CLAUDE_BIN` if `claude` is not the binary you want.

## Ground rules

- **No runtime dependencies** and no network access in `scripts/`. A test enforces this.
- **Hooks must fail open.** Never throw out of a hook, never exit non-zero, never block a prompt on an internal error.
- **Never store prompts or answers.** The registry holds only the fields shown in `examples/registry`.
- **Quiet beats clever.** A change that makes OnThread interrupt more often needs evaluation results showing it is worth it.
- **Document limits honestly.** If something cannot be done with documented Claude Code interfaces, say so in `docs/LIMITATIONS.md` rather than working around it with internal files.
- Add a test for every behavior change, run `claude plugin validate . --strict`, and update `CHANGELOG.md`.

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Reporting issues

Please include your OS, `claude --version`, `node --version`, what you typed, and what OnThread did. Remove any private content first.
