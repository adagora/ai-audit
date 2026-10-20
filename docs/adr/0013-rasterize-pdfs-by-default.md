# 13. PDFs with findings are rasterized by default in redact mode
Status: Accepted (2026-10-20)
## Context
ADR 0003 rejected a PDF with a finding with 409 unless `--allow-page-redaction` was set. In `redact` mode text and images are cleaned and forwarded, so PDFs were the one inconsistent case: an agent workflow that attaches a contract with an e-mail address in it stopped dead instead of getting a redacted copy. The rebuild path (raster-only PDF, findings blacked out, re-inspected) already existed and was tested.
## Decision
- In `redact` mode a PDF with findings is rebuilt from page images with findings blacked out; pages with a text-layer finding but no OCR box are blanked whole.
- The rebuilt PDF is inspected again. A surviving finding or an unmappable result → 409; an inspection failure → 422 (ADR 0003 stays fail-closed).
- The log records the attachment path in `decision.rasterized`, so an auditor knows the model got images, not text (ADR 0007: paths only).
- `--no-page-redaction` (config `"pageRedaction": false`) restores 409. `--allow-page-redaction` is removed, not kept as a no-op: the project was published the same day and the CLI rejects unknown flags loudly.
- `no-go` still blocks, `advisory` still forwards the original.
## Consequences
- The model loses the text layer: more tokens per page, answer quality depends on rendering/OCR, tables and small print may read worse; whole-page blanking can drop context.
- Deployments that want the model to see either the exact document or nothing must set the opt-out.
