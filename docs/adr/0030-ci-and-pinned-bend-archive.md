# 30. CI runs every gate on Linux; Bend comes from its pinned release archive
Status: Accepted (2026-10-24). Supersedes the "installed with the official script" part of [0029](0029-proved-pure-core-in-bend.md).
## Context
- The repository has no CI. On macOS `npm test` skips 20 tests (no bwrap, no prlimit); `test/helpers.ts` says CI installs the tools and never skips them. `verify:bend`, `spec/run.sh` and the fuzzers run only by hand.
- ADR 0029 pins Bend 2.0.38 and installs it with the official script. That script serves only the newest version: on 2026-10-24 it installs 2.0.39, which `bend/run.sh` refuses. Nobody can install 2.0.38 that way any more.
- GitHub records a sha256 for each archive of the Bend v2.0.38 release. The darwin-arm64 archive with that sha256 holds the same binary that the official script installed and checked on this project's machine on 2026-10-21.
## Decision
- `.github/workflows/ci.yml` runs on each push to `main` and each pull request, on Ubuntu 24.04:
  - `npm test` on Node 22, 24 and 26 (the `engines` field), with tesseract, poppler, python3-pil, bubblewrap and util-linux installed, and unprivileged user namespaces allowed so that bwrap works;
  - `npm run verify:bend`;
  - `bash spec/run.sh`.
- `.github/workflows/fuzz.yml` runs each night: `npm run fuzz`, then Jazzer.js for 600 s per target. The corpus stays in the Actions cache; crash inputs and logs are uploaded when a run fails.
- `bend/install.sh` installs Bend 2.0.38 from its GitHub release archive. It refuses an archive whose sha256 is not the one in the script, and a binary that does not report 2.0.38. CI and developers use it. An upgrade stays deliberate: new version and sums in `bend/install.sh` and `bend/run.sh`, then `verify:bend` passes.
- Actions are pinned by commit SHA. The workflow token can only read the repository.
## Consequences
- The 20 Linux-only tests (sandbox, prlimit, attachment tools) run on every push, and so do the proofs, the mutants and the TLA+ models.
- The Bend binary is trusted through GitHub's recorded sha256 and the cross-check above, not through bend-lang.com's script.
- The TLA+ tools come from the v1.8.0 pre-release, which upstream rebuilds (v1.7.4 lacks `-noGenerateSpecTE`). The formal job can turn red with no change in this repository.
- GitHub disables scheduled workflows after 60 days without activity in the repository.
- The workflows are YAML without comments; the pinned action versions are in the commit message.
