# 7. The log stores where a finding was, never what
Status: Accepted (2026-10-20)
## Context
The audit log is kept for months and read by more people than the traffic. A hash of a short value (PESEL, phone) can be brute-forced.
## Decision
A finding is logged as rule + JSON path, never the value or its hash. Model output in the log is masked by the same scanner; the client still gets the stream unchanged.
## Consequences
- The log cannot leak what it detected.
- Investigating a finding needs the original request, which the proxy does not keep.
