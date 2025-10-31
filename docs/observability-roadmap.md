# Observability & Resilience Follow-ups

The initial pass added request validation on bid endpoints and structured logging across the API. To continue building long-term reliability, plan the following iterations:

1. **Expand Validation Coverage**
   - Apply Zod schemas to remaining routes (jobs, public intake, messaging) and enforce consistent error shapes.
   - Add a shared middleware to short-circuit invalid query string parameters.

2. **Deeper Telemetry**
   - Emit business metrics (queue size, bid latency, SLA breaches) via a metrics library such as Prometheus.
   - Attach trace/span metadata to outbound calls (SMS, push, OpenAI) to measure external dependency health.
   - Track public intake throughput, validation failures, and media-upload error rates to catch regressions early.
   - Add dashboards for the new `serviceops_bid_*` and `serviceops_public_job_*` Prometheus metrics, with alerts on sustained validation or error spikes.

3. **Persistence Safeguards**
   - Add unique indexes for phone numbers/tokens where appropriate and backfill conflicting records.
   - Implement transactional flows (with MongoDB sessions) when mutating multiple collections like jobs + bids.

4. **Testing & Deployment**
   - Stand up automated integration tests that exercise bid submission/selection and Mission Control dashboards.
   - Gate deployments through CI with linting, tests (`npm test`), and a smoke run of the new `npm run backfill:bids` script.

5. **Resilience Enhancements**
   - Queue outbound notifications for retry instead of executing inline.
   - Add circuit breakers/timeouts around third-party APIs to prevent cascading failures.

Logging defaults to `LOG_LEVEL=warn`; raise to `info`/`debug` temporarily when you need richer traces without touching code.

SMS notifications now use a timeout/retry/circuit-breaker wrapper. Adjust behaviour with env vars:
`SMS_TIMEOUT_MS`, `SMS_MAX_RETRIES`, `SMS_BREAKER_THRESHOLD`, `SMS_BREAKER_COOLDOWN_MS`.
Mirror the pattern for push notifications and AI calls next.

Push notifications mirror the same resilience controls: tune via `PUSH_TIMEOUT_MS`, `PUSH_MAX_RETRIES`, `PUSH_BREAKER_THRESHOLD`, `PUSH_BREAKER_COOLDOWN_MS`. Extend the circuit breaker pattern to AI requests afterwards.

Documenting these steps keeps the roadmap explicit as the system scales.
