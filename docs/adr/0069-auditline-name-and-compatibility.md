# 69. The project is called Auditline, and the old names keep working
Status: Accepted (2026-11-05). Extends [0068](0068-correlation-and-the-application-cockpit.md).

## Context
`ai-audit` says what the project is about but not what it does, and the three applications around it (the help-desk application, the evaluation engine and this gateway) had names that did not describe their jobs. A web search found other projects named Auditgate, Proofrail and Tracegate in this same area, so those names were dropped. It found none named Auditline. A search is not a trademark check.

## Decision
**Name.** The project is Auditline: the audit line for AI agents. The repository is `adagora/auditline`, the package is `auditline`, and the command is installed as both `auditline` and `ai-audit`.

**Variables.** The command also reads `AUDITLINE_*` for every `AI_AUDIT_*` variable it reads. When both are set, the `AUDITLINE_` one wins. Nothing else changes: the `x-audit-*` headers, the `ai_audit_*` metric names, the log record fields and the file formats keep their names, so no log, dashboard or client breaks.

**Related names.** The help-desk application is Deskhand (repository `adagora/deskhand`). The evaluation engine keeps the name IntentGauge.

## Consequences
GitHub redirects the old repository address, but links in older text and in accepted ADRs still say `ai-audit` and `help-desk-agent`; they are not edited. The helper scripts under `scripts/` still read the `AI_AUDIT_*` names only. Retiring the old names would break users and needs its own ADR. A local folder keeps whatever name its owner gave it.
