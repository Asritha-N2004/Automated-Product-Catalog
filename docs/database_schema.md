# Database schema

SQLAlchemy models are in `backend/app/database.py`. Alembic migration `0001` is a static snapshot, not a dynamic import of the live model metadata. `alembic upgrade head` creates the schema; `alembic check` verifies drift. Automatic `create_all` on startup supports a fresh local environment; it is not a substitute for migrations when changing an existing schema.

| Table | Purpose / constraints |
| --- | --- |
| users | Unique indexed normalized email, Argon2 hash, profile name, created timestamp, preference JSON, monotonic basket/context revision |
| products | Indexed name/brand/category/kind, integer price/original_price, unit, nonnegative stock, dietary tags, allergens, source-qualified nutrition, image URL |
| basket_items | User/product foreign keys, unique user-product pair, positive quantity, minimum between zero and quantity, lock flag |
| optimization_results | UUID primary key, owner FK, revision, decision status, immutable calculation JSON, timestamp |
| shopping_history | Owner FK, integer total/savings/budget, immutable checkout item snapshots, timestamp |
| agent_execution_logs | Owner FK, indexed execution UUID, agent name, status, duration, detail and timestamp |

## Aggregate design rationale

For this implementation, `user_preferences` lives in `users.preferences`; the current shopping session and basket are identified by the owner and revision. Catalog categories and inventory live on products. Recommendation and optimization items are saved together in the proposal JSON; applied/rejected status is the recommendation feedback. Checkout item JSON preserves the exact prices and names at checkout even if catalog data changes later. These are deliberate aggregate boundaries, not disconnected empty tables added only to match a table-name list.

A production catalog with external updates should normalize categories, inventory reservations and price-history events and add an append-only audit stream. Those external-feed tables are not present in this local sample implementation. No historical prices are invented.

All monetary calculations are integer paise; SQL integer storage avoids floating arithmetic. Sample quantity constraints and foreign keys are active in both database backends. SQLite enables foreign keys and WAL. Products and users are not hard-deleted by the public API.
