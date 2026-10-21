# Attachments
## Sub-features
PDF and image inspection and redaction (rasterized PDFs); uninspectable inputs (remote URL, file id, corrupt) get 422; with no usable bwrap, 422 `audit_sandbox_unavailable`; `--unsafe-no-sandbox` is recorded as `decision.sandbox: "disabled"` (ADR 0021).
## How to get to it (user POV)
Send an image_url, or an Anthropic `document` or `image` block.
## Driving it with drive.mjs
`node drive.mjs attachments sandbox`. The remote URL and sandbox cases run everywhere; the PDF case needs the tools. A no-bwrap host cannot be simulated from outside, so `test/sandbox.test.ts` covers the 422 with `sandboxAvailable: false`.
## Gotchas
Without tesseract, poppler-utils and python3-PIL, `/readyz` is 503 and the PDF scenario skips (it fails when `CI` is set). Inside Docker, bwrap needs extra capabilities (see the README).
