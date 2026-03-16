# ADR-0006 Kokoro Local TTS

- Date: 2026-03-13
- Status: Accepted

## Context

Cloud TTS improves quality but adds cost and remote-service dependency. The project also needs a low-cost voice path for development and testing.

At the same time, a local TTS path introduces model-loading latency, device variability, and language limitations.

## Decision

Support Kokoro as a local client-side TTS provider.

Current implementation characteristics:

- runs in the browser
- defaults to the stable `wasm` path unless explicitly overridden
- is primarily useful for development and cost-sensitive usage
- currently forces English coach language because of the selected voice setup

## Consequences

### Positive

- Development and testing no longer depend entirely on paid cloud TTS.
- The project gains a speech path that can run without a server-side TTS call.
- Provider choice becomes a product-level cost and reliability lever.

### Tradeoffs

- Kokoro introduces model warm-up time and client-device variability.
- The current language behavior is less flexible than the cloud path.
- The architecture now needs to document provider-specific fallback and language rules.
