# Signed evidence showcase

All values in this folder are synthetic. The reviewer is a demo label, and the demo public key is not a real person's identity. The private signing key and audit log are intentionally absent.

- [signed-workbench.html](signed-workbench.html) links fake proxy calls, sessions, context sizes, scan signals, Quinelings observations and a signed decision checkpoint.
- [decision.svg](decision.svg) is the portable Quinelings calculation and visual receipt. Its XML metadata contains the exact fake policy source and inputs.
- [decision.attestation.json](decision.attestation.json) signs the receipt digest, latest fake review record and 27-record log checkpoint.
- [demo-public.pem](demo-public.pem) is the public verification key for this example.
- [report.md](report.md) is the aggregate audit report after the synthetic review.

From the repository root, after `npm ci && npm run build`:

```sh
node dist/src/cli.js verify-receipt --input examples/monitoring/showcase/decision.svg
node dist/src/cli.js verify-attestation --input examples/monitoring/showcase/decision.svg --attestation examples/monitoring/showcase/decision.attestation.json --public-key examples/monitoring/showcase/demo-public.pem
```

The second command should report `reproduced: true`, `presentation: matched`, `origin: signed-checkpoint` and `approval: signed-review-record`. It proves that this public key signed the claim and that the receipt replays. Trusting a real signer requires receiving their public key through a separate trusted channel. The signature does not prove a person's identity, the truth of the review or the claimed time.
