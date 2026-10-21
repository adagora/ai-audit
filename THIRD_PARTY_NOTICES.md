# Third-party notices

- **ghuntley/preflight** — MIT License, https://github.com/ghuntley/preflight. Inspection design, modes, error model and the default detection profile were adapted (ported to TypeScript, no code copied verbatim). Attachment worker resource limits in `src/attachments.ts` and `src/worker.ts` use preflight's values (`src/bin/preflight-worker.rs`, `src/attachments.rs` at eb13fc0): CPU 90 s, file size 64 MiB, 128 open files, address space 1.5 GiB (native tools only), 120 s wall clock, 16 MiB output caps, `OMP_THREAD_LIMIT=1`, and the worker exits if its limits are not in place.
- **Gitleaks** — MIT License, Copyright (c) 2019 Zachary Rice, https://github.com/gitleaks/gitleaks. Secret-detection regex patterns in `src/scan.ts` are derived from Gitleaks rules (via preflight).
- **Quinelings** (`@quinelings/agent-sdk`) — Apache License 2.0, https://github.com/CharlesHoskinson/quinelings. An unmodified package tarball is redistributed in `vendor/` as an optional dependency; the full license text is in `vendor/QUINELINGS-LICENSE`.

The MIT license text applying to preflight and Gitleaks:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
