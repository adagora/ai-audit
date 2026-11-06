# Findings from FVK trial: `redact`

1. **Proof capability gap / unresolved semantics.** `redact` depends on JavaScript lookbehind, character classes, word boundaries, and global regex replacement. The kit's mini-language recipe does not provide JavaScript RegExp semantics. A custom approximate recognizer would prove a different program. No K claim was asserted.
2. **Underspecified intent.** The available test establishes one email and phone example, not the full accepted pattern, overlapping matches, Unicode behavior, replacement priority, or exact PESEL behavior. The implementation's third PESEL replacement lacks independent intent evidence in the material reviewed.
3. **Keep tests.** The example test and fuzz/performance test are not subsumed by any machine-checked proof. Do not remove them.
