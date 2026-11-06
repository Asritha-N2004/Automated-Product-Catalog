# Implementation checklist

- [x] FastAPI backend, SQLAlchemy persistence, SQLite fallback, PostgreSQL configuration
- [x] Immutable Alembic migration; seed with 110 products and 11 categories
- [x] Argon2/JWT authentication, profile/preferences endpoints and user ownership checks
- [x] Catalog/search, transactional basket CRUD, locks, required quantities and checkout
- [x] Eight deterministic agents with shared state, concurrent independent analysis, retries, timeouts and execution logs
- [x] Hybrid personal/content/co-occurrence recommendation ranking and grounded explanations
- [x] SciPy MILP optimization, five modes, budget/availability/diet/allergen constraints and conservative fallback
- [x] Revision-safe explicit apply/reject; no silent basket changes
- [x] Authorized WebSocket events, browser request debounce/cancellation, server-triggered debounced analysis
- [x] Redis pub/sub + expiring event state adapter (service verification still outstanding)
- [x] Responsive React views: authentication, dashboard, catalog/details, basket, recommendations, optimization, analytics, history, settings
- [x] Analytics derived from real persisted sample checkouts
- [x] 18 backend + 9 frontend tests pass; frontend build and TypeScript pass
- [x] Browser shopping workflow exercised end-to-end
- [x] Setup, architecture, API, schema, agent, provider and verification documentation
- [x] Dockerfiles, Compose, env example, Nginx and GitHub Actions configuration
- [ ] Docker build and Compose startup verified (Docker unavailable on host)
- [ ] PostgreSQL and Redis runtime integration verified (services unavailable on host)

## Explicit implementation choices / remaining extensions

The app uses a modular Python orchestrator rather than LangGraph; CSS and reusable React controls rather than Tailwind/shadcn; JSON aggregate documents rather than a table for each preference/session/proposal field. These are documented design choices. It does not claim a trained collaborative ML model, verified nutrient-gap optimization, real external inventory/pricing, or LLM execution. Nutrition data remains unknown. Individual proposed changes can be checked or unchecked before application; partial acceptance revalidates the complete combined basket. Additional provider integrations, normalized catalog audit/history tables and production distributed scheduling are follow-on work rather than fake completed features.

## Vercel production deployment
- [x] Verified CLI identity and ownership of resum-projects.
- [x] Created and linked freshwise-grocery in resum-projects.
- [x] Provisioned a separate free Neon database and connected it to Production and Preview.
- [x] Configured a private signing secret and deployed successfully.
- [x] Verified public health, registration, login, 110 products, eight agents, optimization, apply, checkout and persisted analytics.
- [x] Opened https://freshwise-grocery-topaz.vercel.app in the browser.
