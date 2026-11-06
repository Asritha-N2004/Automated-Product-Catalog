# Architecture

The React client uses React Router for eight application views, TanStack Query for server state, Zustand for the browser session, Axios for requests, Lucide icons and Recharts analytics. The Vite proxy and production Nginx proxy keep REST and WebSocket traffic on the same origin.

FastAPI validates request DTOs and authenticates JWT identity before accessing user-owned records. SQLAlchemy persists to SQLite locally or PostgreSQL through psycopg. A single user row coordinates basket writes and revision numbers. PostgreSQL uses row locks; SQLite takes its write lock before reading mutable basket state. Checkout conditionally decrements stock and commits history and basket removal together. Exceptions roll back when the request session closes.

The orchestrator constructs a snapshot containing preferences, history, catalog, basket and budget. Agents return patches rather than racing on shared keys. After recommendations and nutrition run concurrently, budget, inventory, optimization and explanation execute in dependency order. Logs are persisted only by the main execution coroutine. A revision-stamped proposal is saved for explicit acceptance/rejection; it does not mutate the basket.

Browser basket/preference changes debounce and cancel obsolete HTTP requests. A generation counter discards old responses. Backend basket writes also schedule analysis after 600 ms for headless API clients; newer writes cancel superseded scheduled analysis. Cancellation of a worker-thread call does not terminate the thread, but it cannot write a basket or database state. Applying a proposal revalidates the revision and hard constraints.

WebSocket authentication uses a one-minute `ws`-scoped JWT ticket minted from an authenticated API request. The session ID must match the ticket subject and an existing user. Connected sockets are grouped by identity, and clients reconnect with a fresh ticket. Redis, when configured, broadcasts events across processes and caches each user's latest event for five minutes. Local operation uses an in-memory transport. Inventory change events contain only a generic sample-provider signal and can be broadcast globally.

## Scaling boundaries

The sample application does not claim unlimited scaling. PostgreSQL is the intended shared database. Redis event delivery is implemented; Redis needs a running-service integration check before deployment. In-process debouncing and rate limiting should move to a queue/shared limiter for multi-worker production. Large catalogs require paginated queries and precomputed co-occurrence indices; the current 110-product catalog is small enough for a reproducible full scan. Authentication uses bearer tokens, not cookies, so CSRF cookies are not involved. Browser sessionStorage limits token lifetime to the tab session; public production should add HTTPS, operational monitoring and a defined session-revocation strategy.
