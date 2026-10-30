# 58. A log line verifies only byte for byte as the writer wrote it
Status: Accepted (2026-10-30). Narrows what [0002](0002-hash-chained-log-with-anchors.md) calls a verified record.
## Context
Each record's hash covers its parsed content in canonical form, not the bytes of its line. A new fuzz target that changes a real log found that a line with an extra, earlier copy of a key (`{"previous":"x",…,"previous":{…}}`) still verified: `JSON.parse` keeps the last key, so the hash matched. A reader whose parser keeps the first key reads other content from a log that `verify` accepts. The same holds for any other spelling of the same JSON (`1.0` for `1`, `-` for `-`, spaces) and for bytes that are not UTF-8, which decode to U+FFFD like the character itself. ADR 0009 rejects duplicate keys in request bodies for the same reason.
## Decision
- `verify`, `verifyChain`, `verifySeries` and the anchor check accept a line only if it is valid UTF-8 and equals `JSON.stringify` of the record it parses to, which is how `append` and `rotate` write every line. Otherwise the line fails with `not UTF-8` or `not as written`, after the existing checks, so a changed field still reports `hash mismatch`.
- Reading the log (`read`, the console, `report`, `stats`) keeps its tolerant decoding; only verification is strict.
## Consequences
- Every byte of a verified line is fixed by its hash; two tools that read a verified log see the same content, whatever their JSON parser does with duplicate keys, number spellings or escapes.
- Logs written by ai-audit verify as before. A log that something reformatted (another JSON writer, CRLF line ends, a BOM) no longer verifies, even if its content is unchanged.
- Verification serializes each record once more; it stays linear in the log size.
