# Verification report — 6 November 2026

Story: create an account → load backend catalog → add product → execute agents → inspect proposed substitution → explicitly apply → checkout → see persisted history, stock and analytics.

## Verified locally

| Boundary | Evidence |
| --- | --- |
| Database | SQLite schema initialized and 110 products in 11 categories seeded; idempotent startup |
| Migrations | Fresh upgrade, schema drift check (`No new upgrade operations detected.`), downgrade and second upgrade |
| Backend APIs | 18 pytest tests pass |
| Frontend interactions | 9 Vitest/Testing Library tests pass |
| Build | TypeScript checking and Vite production build pass |
| Authentication UI | Local browser test account registered and entered dashboard |
| Catalog → basket | Browser searched Harvest Select Apple and added one at ₹175 |
| Agent execution | All eight statuses completed; SciPy returned a valid Everyday Apple substitute at ₹160 |
| Explicit apply | Browser clicked Apply; persisted basket then displayed Everyday Apple ×1 and ₹160 |
| Checkout → analytics | Browser completed sample checkout; basket emptied; analytics displayed ₹160 spending, one checkout, ₹5 list-price offer savings, 100% decided optimization acceptance |
| Live updates | Authorized browser displayed Live connection; WebSocket integration test receives basket_updated; automatic API-only reevaluation test receives recommendations_updated and optimization_completed |
| Responsive UI | Desktop and 390px mobile layouts inspected; hidden chart tooltip overflow identified and fixed |

Tests cover wrong credentials, catalog search, invalid quantities, duplicate aggregation, user ownership isolation, authorized sockets, empty baskets, stock change before application, required minima, locked items, over-budget baskets, dietary and allergen conflicts, stale proposals, reject/apply replay, conservative solver fallback, anonymous collaborative inputs, parallel writes, partial agent failure, individual change acceptance, rejection of over-budget partial acceptance, checkout stock and savings accounting.

## Limits

- Docker is not installed on this host, so image builds and Compose startup were not executed.
- PostgreSQL and Redis service integration were not run. Their configuration and adapters are present; local verification used SQLite and the in-process real-time fallback.
- Tests and the browser workflow use sample prices/stock and unknown nutrition, not a real grocery provider or payment service.
- This is a local application implementation. Distributed queue scheduling, shared rate limiting, session revocation, nutrient-target optimization and external provider adapters remain production extensions.
- Backend tests emit one dependency deprecation warning about Starlette's httpx test adapter. Assertions pass; it is not a runtime application error.

Backend tests on this managed Windows host require local sockets because Windows asyncio creates a loopback socket pair. The restricted sandbox prevented that OS operation; tests passed when executed with local socket permission. No test assertion was bypassed.

## Cloud verification update
The production deployment at https://freshwise-grocery-topaz.vercel.app in resum-projects now uses Neon PostgreSQL. Public health, registration, login, catalog, eight agents, substitution/apply, checkout and persisted analytics passed. PostgreSQL is now runtime-verified; Redis and Docker remain unverified. See vercel_deployment.md.
