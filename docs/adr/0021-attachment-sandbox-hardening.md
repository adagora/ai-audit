# 21. Attachment sandbox: fail closed, minimal mounts, explicit opt-out
Status: Accepted (2026-10-21). Supersedes the sandbox parts of ADR 0003.
## Context
ADR 0003 says attachment inspection fails closed, but the code did not. When `bwrap` was missing, `SANDBOX` silently became `"none"` and the worker ran as the proxy user with the proxy's view of the filesystem. With bwrap, `--ro-bind / /` exposed the whole host read-only: the audit log, `<log>.session-key`, the `--config` file, the home directory and the repository. A parser exploit in tesseract, poppler or PIL could read them, and the unsandboxed worker could also read `/proc/<proxy pid>/environ`, which holds `AI_AUDIT_UPSTREAM_*` keys. The worker's own environment was already cleared to `PATH`, so keys were not passed directly.

preflight (ghuntley/preflight, eb13fc0) solves the same problem as follows:
- It uses Bubblewrap with `--die-with-parent --unshare-all --new-session`. The only host mount is `/nix/store` (read-only); it adds an empty `/proc` dir, `/dev`, a tmpfs `/tmp`, the worker binary at `/worker`, and a per-job dir bound read-write (`src/attachments.rs:222-240`).
- It sets `env_clear` with only `PATH` and `OMP_THREAD_LIMIT` (`src/attachments.rs:247-253`). It caps stdout at 16 MiB and has a 120 s wall clock with kill on drop (`:256-279`).
- The worker sets `RLIMIT_AS` 1.5 GiB, `RLIMIT_CPU` 90 s, `RLIMIT_FSIZE` 64 MiB and `RLIMIT_NOFILE` 128 on itself (`src/bin/preflight-worker.rs:505-521`).
- It has no seccomp, no landlock and no capability drop; the systemd unit adds `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp` and similar (`nixos/module.nix:40-49`).
- `sandbox = true` is the default. `sandbox = false` is an explicit config that runs the worker directly. There is no silent fallback: startup runs the worker through the sandbox (`check()`, `src/attachments.rs:30-34`, `src/main.rs:277`) and refuses to start if that fails.
- Inspection errors become 422 `inspection_incomplete` (`src/main.rs:498`).
- On Ubuntu CI it grants the pinned bwrap a scoped AppArmor user-namespace profile (its ADR 0004).
## Decision
- At startup the proxy probes bwrap with the real mount set (`bwrap … /usr/bin/true`). If the probe fails, the sandbox is `unavailable`:
  - every request with an attachment is refused with 422 `audit_sandbox_unavailable`, logged with `decision.sandbox: "unavailable"`, and counted in `ai_audit_sandbox_unavailable_total`;
  - `/readyz` returns 503 with the same code;
  - a `sandbox_unavailable` event is written to stderr at startup.
  Text-only traffic is unaffected. We do not refuse to start, unlike preflight, because the proxy is still useful for text and ADR 0003 already blocks only what cannot be inspected.
- `--unsafe-no-sandbox` (or `AI_AUDIT_UNSAFE_NO_SANDBOX=1`) is the only way to run workers without bwrap. It is development-only and loud:
  - a `sandbox_disabled_unsafe` startup event;
  - `ai_audit_sandbox_disabled 1`;
  - `decision.sandbox: "disabled"` on every record with attachments.
  Records with attachments carry `decision.sandbox: "bwrap"` otherwise.
- Mounts are minimal and read-only:
  - `/usr` (tesseract, poppler, python3 and PIL, tessdata and their libraries);
  - the merged-usr symlinks `/bin`, `/lib`, `/lib64`, `/sbin` (or binds, where they are real directories);
  - `/etc/ld.so.cache`, `/etc/fonts` and `/etc/alternatives` when present;
  - the Node installation directory when it is outside `/usr`;
  - only `dist/src/worker.js`, bound to `/opt/ai-audit/worker.mjs`.
  Nothing else is mounted: no `/home`, no repository, no log dir, no config, no `/etc/passwd`. Kept from before: `--unshare-all` (no network), `--die-with-parent`, `--new-session`, a fresh `/proc` in the new PID namespace, `/dev` and tmpfs `/tmp`.
- Resource limits take preflight's values. Soft and hard limits are equal, as in its `setrlimit` calls:
  - The worker gets RLIMIT_DATA 4 GiB, RLIMIT_CPU 90 s, RLIMIT_FSIZE 64 MiB and RLIMIT_NOFILE 128. The data limit stays instead of preflight's RLIMIT_AS (ADR 0003, ADR 0022). The native tools inherit these limits.
  - Every native tool (tesseract, pdftotext, pdfinfo, pdftoppm, python3) also gets RLIMIT_AS 1.5 GiB.
  - The parent enforces a 120 s wall clock, SIGKILL on timeout or on overflow, and a 16 MiB cap on worker stdout. Each tool's stdout is capped at 16 MiB.
  - `OMP_THREAD_LIMIT=1`.
  - Mechanism: Node has no `setrlimit` without a native dependency, so `prlimit` (util-linux) applies the limits before exec. preflight's worker sets them on itself. To keep its "exit if a limit cannot be set" behaviour, the worker reads `/proc/self/limits` at start and exits with status 1 and no output when any expected value is missing. The request then fails closed with 422 `audit_inspection_failed`. Added: `--cap-drop ALL`, `--clearenv` with only `PATH`, `HOME=/tmp` and `OMP_THREAD_LIMIT`, and `--chdir /tmp`.
- Files go through a per-job directory, as in preflight (`/job`, `src/bin/preflight-worker.rs:382-397`). Added 2026-10-21. The host creates it with `mkdtemp` (0700), writes the attachment (`in`) and the pages to black out (`in-N`), and binds it read-write as `/job`; with `--unsafe-no-sandbox` the worker gets the host path. The worker writes rendered pages (`pg-N.png`) and the rebuilt file (`out`) there, and stdout carries only a JSON manifest with relative names. The host accepts only those names (regular files, one link, no paths), reads at most 500 files and 256 MiB in total, and removes the directory in `finally`. Any violation is 422 `audit_inspection_failed`. The 16 MiB stdout cap and the rlimits are unchanged; page images no longer count against it, so large PDFs no longer fail with `worker_output_limit`.
- No seccomp filter for now. bwrap takes a compiled BPF program (`--seccomp FD`), which needs a native build step or a hand-written filter, and zero runtime dependencies rule out libseccomp bindings. preflight does not use one either. Namespaces, the empty filesystem view and dropped capabilities remove most of what a filter would protect, but the kernel attack surface stays: a kernel bug reachable from an unprivileged process is not mitigated.
## Alternatives considered
- **nsjail:** namespaces, seccomp-bpf (Kafel policy language), cgroups and rlimits in one tool, with a stronger default policy than bwrap. Costs: one more native binary that is less often packaged (Debian and Ubuntu have it, Alpine and Docker slim images do not), a config format to maintain, and root or setuid for cgroup limits. A good next step if seccomp becomes a requirement.
- **gVisor (runsc):** a user-space kernel, so parser exploits face a much smaller host kernel surface. It is a heavy dependency, needs container plumbing (OCI bundle per job), adds about 100+ ms per start and costs performance on file and CPU work. It is reasonable when the proxy already runs on a gVisor-enabled container platform.
- **Firecracker microVM per job:** the strongest isolation, with a separate kernel. It needs KVM (often unavailable in VMs and CI), a guest image with the toolchain, and about 125 ms+ boot per job unless pooled. Far too much operational weight for a local proxy.
- **A container per request (Docker or Podman):** familiar, but needs a daemon or rootless setup and seconds of overhead per job, and the default container is weaker than our bwrap profile unless seccomp and AppArmor are tuned. The proxy itself already runs in a container in the Docker deploy.
- **WASM builds of tesseract and pdfium (or pdf.js):** memory-safe capability isolation inside the Node process, with no namespaces needed and the same behaviour on every OS. Costs: tesseract.js and pdfium WASM are several MB, slower (2-5x for OCR), memory limits are per instance, and they would be runtime dependencies (ADR 0001). PIL rendering would need a replacement. This is the most attractive long-term option if zero dependencies is relaxed, because it also removes the bwrap-in-Docker capability requirements.
- **Landlock (with or without seccomp) applied by the worker on itself:** an unprivileged filesystem allowlist, available since Linux 5.13 and composable with bwrap. Node has no binding, so it needs a small native helper. A useful extra layer, deferred for the same native-build reason as seccomp.
## Consequences
- A host without working user namespaces (Ubuntu 24.04 AppArmor restriction, Docker without the flags in the README) now gets 422 for attachments instead of unsandboxed parsing. Operators see it at startup, in `/readyz` and in metrics.
- A worker escape now reaches only system files under `/usr`, not audit data, keys or the repository. `test/sandbox.test.ts` checks this when bwrap works (always in CI).
- Distributions that keep the toolchain outside `/usr` (for example Nix) need the mount list extended. The startup probe catches a missing mount only for the probe binary, so a missing tool shows up as `audit_inspection_failed`.
