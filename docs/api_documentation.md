# API documentation

Start the backend and open `/docs` for Pydantic request schemas and generated OpenAPI. All `/api` routes except auth register/login, health and product catalog reads require `Authorization: Bearer <access_token>`. An authenticated identity is always used; client user IDs are never trusted. Monetary values use integer paise; ratings use tenths (45 = 4.5/5).

| Area | Endpoints | Contract |
| --- | --- | --- |
| Auth | `POST /api/auth/register`, `POST /api/auth/login` | email, password (10–128 chars), optional name; returns token and user |
| Identity | `GET /api/auth/me`, `GET /api/users/profile`, `PUT /api/users/profile` | update accepts name only |
| Preferences | `PUT /api/users/preferences` | full preference document: budget, monthly_budget, dietary, allergies, household_size, preferred_brands, preferred_categories, frequency, context |
| Catalog | `GET /api/products`, `/api/products/search`, `/api/products/categories`, `/api/products/{id}` | q, category, brand, min_price, max_price, available; sort=name/price/price_desc/rating |
| Basket | `GET /api/basket`, `POST /api/basket/items` | add product_id, quantity, minimum, locked; existing line quantity increments |
| Basket line | `PUT /api/basket/items/{id}`, `DELETE /api/basket/items/{id}` | update supplies quantity, minimum, locked; IDs are basket-line IDs |
| Recommendation | `GET /api/recommendations`, `GET /api/recommendations/explanations`, `POST /api/recommendations/generate` | GET runs analysis and returns explained ranked products; POST accepts mode and returns full analysis |
| Optimization | `POST /api/optimization/run`, `GET /api/optimization/results/{id}` | run accepts mode; returns feasible, items, conflicts, totals, savings, solver, agents, explanations, recommendations, nutrition, errors, revision |
| Decision | `POST /api/optimization/apply`, `/api/optimization/reject` | body `{"optimization_id":"uuid"}`; apply optionally accepts `accepted_item_ids` (input basket-line IDs) for individual changes, returns the combined validated basket; reject leaves it unchanged |
| Checkout | `GET /api/history`, `POST /api/history/checkout` | persists a sample transaction and updates inventory; no payment |
| Analytics | `GET /api/analytics/overview`, `/spending`, `/categories`, `/savings` | unified analytics envelope with monthly/category/frequent arrays |
| Agents | `GET /api/agents/status`, `POST /api/agents/execute` | latest eight persisted statuses; execute accepts optimization mode |
| Socket ticket | `POST /api/auth/ws-ticket` | ticket and authorized session_id |
| Socket | `/ws/basket/{session_id}?ticket=...` | basket_updated, optimization_started, agent_status_updated, recommendations_updated, optimization_completed, inventory_updated, budget_warning |

Modes: `Balanced`, `Budget Saver`, `Nutrition Focus`, `Preference Focus`, `Essentials First`.

A basket response contains `items`, `total`, `revision`. Each line contains line `id`, nested `product`, `quantity`, `minimum`, `locked`. An optimization line need not have a persisted line ID until applied. An optimization result is owner-scoped. Replayed decisions, stale revisions, or stock conflicts return 409; invalid input, dietary conflicts, infeasible application and checkout over budget return 422. Missing/foreign objects return 404 to avoid leaking ownership. Invalid tokens return 401; missing authentication returns the framework's authentication error. Rate limits return 429. Database integrity conflicts return 409.

The recommendation score is relevance, not a calibrated probability or a medical confidence estimate. The optimization utility score excludes unknown nutrient values. Analytics savings is actual sample list-price discount at checkout; it is separate from hypothetical optimization savings.
