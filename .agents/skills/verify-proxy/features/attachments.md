# Attachments
## Sub-features
PDF and image inspection and redaction (rasterized PDFs); uninspectable inputs (remote URL, file id, corrupt) get 422.
## How to get to it (user POV)
Send an image_url, or an Anthropic `document` or `image` block.
## Driving it with drive.mjs
`node drive.mjs attachments`. The remote URL case runs everywhere; the PDF case needs the tools.
## Gotchas
Without tesseract, poppler-utils and python3-PIL, `/readyz` is 503 and the PDF scenario skips (it fails when `CI` is set). Inside Docker, bwrap needs extra capabilities (see the README).
