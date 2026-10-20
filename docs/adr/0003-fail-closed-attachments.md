# 3. Fail-closed inspection of attachments
Status: Accepted; PDF default superseded by 0013
## Context
Images and PDFs can carry secrets and PII in pixels, metadata and text layers. Extraction runs untrusted parsers on untrusted input.
## Decision
- An attachment that cannot be inspected is rejected with 422.
- A PDF with a finding is rejected with 409 by default: text layers cannot be edited safely. `--allow-page-redaction` rebuilds a raster-only PDF and re-inspects it. Image findings are blacked out.
- Extraction runs in a worker (Node script + tesseract, poppler, python3-PIL) inside bwrap with prlimit: no network, `--data` 4 GiB (RLIMIT_DATA, not RLIMIT_AS, which kills pointer-compressed Node at start), killed after 60 s. On failure the worker returns neither stderr nor content.
- Results are cached in memory only (max 1000), keyed by sha256(profile, mime, bytes).
## Consequences
- Missing tools or a broken sandbox block traffic with attachments instead of leaking it. In Docker, bwrap needs extra capabilities.
- Only PNG/JPEG/WebP/GIF and PDF are inspected. The cache is lost on restart.
