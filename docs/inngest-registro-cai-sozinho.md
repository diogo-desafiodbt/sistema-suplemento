# App stops receiving invocations, no deploy involved

**App:** `desafio-diabetes` · SDK `inngest@^4.4.0` · Next.js 16.2.6
**Hosting:** AWS ECS Fargate behind ALB + CloudFront (not Vercel)

## Symptom

Functions silently stop being invoked. No errors on our side — the SDK never
gets called, so there is nothing to log. Crons stop firing and events produce no
runs.

`curl -X PUT https://desafiodiabetes.com/api/inngest` restores it immediately
and always returns `{"message":"Successfully registered","modified":true}` —
`modified` is `true` on **every** call, including two consecutive calls seconds
apart, so we can't use it to tell whether anything actually changed.

## Occurrences

| # | Stopped | Detected | Duration |
|---|---|---|---|
| 1 | ~16 Aug | 19 Aug 11:45 | ~3 days |
| 2 | 19 Aug 21:45 UTC | 19 Aug 23:20 | 98 min |
| 3 | 20 Aug 17:00 UTC | 20 Aug 17:50 | 50 min |

Detection is from our own table: every function records start/finish in
Postgres, so "last execution" is exact. A 5-minute cron is the canary.

## What we have ruled out

- **No deploy between #2 and #3.** ECS reports `steady state` since 19 Aug
  17:23 for the core service and 18:54 for the second one. No task was replaced.
- **`serveOrigin` is set** to the public origin (`https://desafiodiabetes.com`),
  so the SDK never reports the container's internal hostname.
- **Routing is pinned.** An ALB rule at priority 1 sends `/api/inngest*` to the
  core service only. `/api/inngest` is reachable and returns 200.
- **App id is stable** (`desafio-diabetes`), never changed.

## What might be relevant

We run **two ECS services from the same image**, both containing the
`serve()` handler with the same app id. Only one of them ever receives
`/api/inngest` traffic (ALB rule above); the other exists to serve public API
routes with a lower-privilege database credential.

Occurrence #2 happened shortly after that second service was created — but #3
happened with no infrastructure change at all, so we don't think that is the
cause.

## Questions

1. Does an app registration expire or get invalidated server-side after some
   period or condition?
2. Can a second instance running `serve()` with the same app id affect the
   registration even if it never receives sync traffic?
3. What does `modified: true` mean on the PUT response? It is always `true`
   here, which makes it useless as a signal.
4. Is there a supported way to detect from our side that an app has stopped
   being invoked, other than instrumenting every function as we did?

## Current workaround

A scheduled task calls the PUT every 15 minutes, and an independent watchdog
alerts when no function has run for 20 minutes. Both are treatment of the
symptom.
