import os, asyncio, time, uuid, logging, math
from collections import defaultdict, deque, Counter
from contextlib import asynccontextmanager
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    Request,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, delete, update, text
from sqlalchemy.orm import Session as DB
from sqlalchemy.exc import IntegrityError
from .database import (
    Base,
    engine,
    Session,
    get_db,
    User,
    Product,
    BasketItem,
    Optimization,
    History,
    AgentLog,
)
from .schemas import (
    Credentials,
    Preferences,
    ItemInput,
    ItemUpdate,
    RunInput,
    Decision,
    Profile,
)
from .security import current, token, decode, hasher
from .seed import seed
from . import realtime
from .agents import execute, total, compatible

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app):
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            # Serialize schema initialization and seeding across cold starts.
            connection.execute(text("SELECT pg_advisory_xact_lock(19485801)"))
        Base.metadata.create_all(connection)
        seed(connection)
    await realtime.start()
    yield
    for task in list(pending_analysis.values()):
        task.cancel()
    await realtime.stop()


app = FastAPI(
    title="Freshwise Grocery Intelligence", version="1.0.0", lifespan=lifespan
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:8080"
    ).split(","),
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
limits = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    key = (
        request.client.host if request.client else "local",
        "auth" if "/auth/" in request.url.path else "api",
    )
    now = time.monotonic()
    q = limits[key]
    while q and q[0] < now - 60:
        q.popleft()
    if len(q) >= (30 if key[1] == "auth" else 300):
        return JSONResponse(
            {"detail": "Too many requests; retry in a minute"}, status_code=429
        )
    q.append(now)
    return await call_next(request)


@app.exception_handler(IntegrityError)
async def integrity_error(request, exc):
    logger.warning("Constraint conflict on %s", request.url.path)
    return JSONResponse(
        {"detail": "Concurrent or conflicting update. Refresh and try again."},
        status_code=409,
    )


connections = realtime.connections
locks = defaultdict(asyncio.Lock)
pending_analysis = {}


async def emit(uid, event, data):
    await realtime.emit(uid, event, data)


def schedule_analysis(uid):
    previous = pending_analysis.get(uid)
    if previous and not previous.done():
        previous.cancel()

    async def reevaluate():
        try:
            await asyncio.sleep(0.6)
            with Session() as db:
                user = db.get(User, uid)
                if user:
                    await run_optimization(RunInput(), user, db)
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Automatic reevaluation failed for user %s", uid)

    pending_analysis[uid] = asyncio.create_task(reevaluate())


def product(p):
    return {
        k: getattr(p, k)
        for k in [
            "id",
            "name",
            "brand",
            "category",
            "kind",
            "price",
            "original_price",
            "unit",
            "stock",
            "rating",
            "tags",
            "allergens",
            "nutrition",
            "image_url",
        ]
    }


def profile(u):
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "preferences": {**Preferences().model_dump(), **u.preferences},
        "revision": u.revision,
    }


def basket(db, uid):
    return [
        {
            "id": i.id,
            "product": product(p),
            "quantity": i.quantity,
            "minimum": i.minimum,
            "locked": i.locked,
        }
        for i, p in db.execute(
            select(BasketItem, Product).join(Product).where(BasketItem.user_id == uid)
        ).all()
    ]


def locked_user(db, uid):
    # Row lock serializes all writes and revision changes on PostgreSQL.
    # SQLite also acquires a write lock before reading the basket.
    db.execute(update(User).where(User.id == uid).values(revision=User.revision))
    return db.scalar(
        select(User)
        .where(User.id == uid)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def changed(db, u):
    u.revision += 1
    db.commit()


async def updated(db, u):
    schedule_analysis(u.id)
    items = basket(db, u.id)
    await emit(
        u.id,
        "basket_updated",
        {"items": items, "total": total(items), "revision": u.revision},
    )
    return {"items": items, "total": total(items), "revision": u.revision}


@app.get("/api/health")
def health():
    return {"status": "ok", "sample_data": True, "money_unit": "paise"}


@app.post("/api/auth/register", status_code=201)
def register(body: Credentials, db: DB = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(409, "Email already registered")
    u = User(
        email=body.email,
        name=body.name,
        password=hasher.hash(body.password),
        preferences=Preferences().model_dump(),
    )
    db.add(u)
    db.commit()
    return {"access_token": token(u.id), "token_type": "bearer", "user": profile(u)}


@app.post("/api/auth/login")
def login(body: Credentials, db: DB = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email))
    try:
        if not u or not hasher.verify(u.password, body.password):
            raise ValueError()
    except Exception:
        raise HTTPException(401, "Incorrect email or password")
    return {"access_token": token(u.id), "token_type": "bearer", "user": profile(u)}


@app.get("/api/auth/me")
@app.get("/api/users/profile")
def me(u: User = Depends(current)):
    return profile(u)


@app.put("/api/users/profile")
def update_profile(body: Profile, u: User = Depends(current), db: DB = Depends(get_db)):
    u = locked_user(db, u.id)
    u.name = body.name
    db.commit()
    return profile(u)


@app.put("/api/users/preferences")
async def preferences(
    body: Preferences, u: User = Depends(current), db: DB = Depends(get_db)
):
    u = locked_user(db, u.id)
    u.preferences = body.model_dump()
    changed(db, u)
    await updated(db, u)
    return profile(u)


@app.get("/api/products/categories")
def categories(db: DB = Depends(get_db)):
    return list(
        db.scalars(select(Product.category).distinct().order_by(Product.category))
    )


@app.get("/api/products/search")
@app.get("/api/products")
def products(
    q: str = "",
    category: str = "",
    brand: str = "",
    min_price: int = 0,
    max_price: int = 100000000,
    sort: str = "name",
    available: bool = False,
    db: DB = Depends(get_db),
):
    stmt = select(Product)
    if q:
        stmt = stmt.where(Product.name.ilike("%" + q[:100] + "%"))
    if category:
        stmt = stmt.where(Product.category == category)
    if brand:
        stmt = stmt.where(Product.brand == brand)
    if available:
        stmt = stmt.where(Product.stock > 0)
    stmt = stmt.where(Product.price >= min_price, Product.price <= max_price)
    stmt = stmt.order_by(
        {
            "price": Product.price,
            "price_desc": Product.price.desc(),
            "rating": Product.rating.desc(),
        }.get(sort, Product.name)
    )
    return [product(p) for p in db.scalars(stmt)]


@app.get("/api/products/{pid}")
def detail(pid: int, db: DB = Depends(get_db)):
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "Product not found")
    return product(p)


@app.get("/api/basket")
def get_basket(u: User = Depends(current), db: DB = Depends(get_db)):
    items = basket(db, u.id)
    return {"items": items, "total": total(items), "revision": u.revision}


def validate_item(p, quantity, minimum, prefs):
    if minimum > quantity:
        raise HTTPException(422, "Minimum cannot exceed quantity")
    if not p:
        raise HTTPException(404, "Product not found")
    if quantity > p.stock:
        raise HTTPException(409, "Insufficient stock")
    if not compatible(product(p), prefs):
        raise HTTPException(
            422, "Product conflicts with declared dietary restrictions or allergens"
        )


@app.post("/api/basket/items")
async def add_item(
    body: ItemInput, u: User = Depends(current), db: DB = Depends(get_db)
):
    u = locked_user(db, u.id)
    p = db.get(Product, body.product_id)
    old = db.scalar(
        select(BasketItem).where(
            BasketItem.user_id == u.id, BasketItem.product_id == body.product_id
        )
    )
    quantity = body.quantity + (old.quantity if old else 0)
    if quantity > 99:
        raise HTTPException(422, "Maximum quantity is 99")
    validate_item(p, quantity, body.minimum, u.preferences)
    if old:
        old.quantity = quantity
    else:
        db.add(BasketItem(user_id=u.id, **body.model_dump()))
    changed(db, u)
    return await updated(db, u)


@app.put("/api/basket/items/{iid}")
async def change_item(
    iid: int, body: ItemUpdate, u: User = Depends(current), db: DB = Depends(get_db)
):
    u = locked_user(db, u.id)
    i = db.get(BasketItem, iid)
    if not i or i.user_id != u.id:
        raise HTTPException(404, "Basket item not found")
    validate_item(
        db.get(Product, i.product_id), body.quantity, body.minimum, u.preferences
    )
    for k, v in body.model_dump().items():
        setattr(i, k, v)
    changed(db, u)
    return await updated(db, u)


@app.delete("/api/basket/items/{iid}")
async def remove_item(iid: int, u: User = Depends(current), db: DB = Depends(get_db)):
    u = locked_user(db, u.id)
    i = db.get(BasketItem, iid)
    if not i or i.user_id != u.id:
        raise HTTPException(404, "Basket item not found")
    db.delete(i)
    changed(db, u)
    return await updated(db, u)


async def run_optimization(body, u, db):
    async with locks[u.id]:
        db.refresh(u)
        revision = u.revision
        items = basket(db, u.id)
        state = {
            "preferences": {**Preferences().model_dump(), **u.preferences},
            "budget": u.preferences.get("budget", 150000),
            "basket": items,
            "product_catalog": [product(p) for p in db.scalars(select(Product))],
            "history": [
                {"items": h.items}
                for h in db.scalars(select(History).where(History.user_id == u.id))
            ],
            "mode": body.mode,
        }
        # Collaborative filtering uses only anonymous aggregate item co-occurrence.
        anchors = {i["product"]["id"] for i in items}
        co = Counter()
        occurrence = Counter()
        for order in db.scalars(select(History)):
            ids = {i["product"]["id"] for i in order.items}
            occurrence.update(ids)
            for anchor in anchors & ids:
                for pid in ids - {anchor}:
                    co[(anchor, pid)] += 1
        collaborative = {}
        for (anchor, pid), count in co.items():
            value = count / math.sqrt(occurrence[anchor] * occurrence[pid])
            collaborative[str(pid)] = max(collaborative.get(str(pid), 0), value)
        state["collaborative_scores"] = collaborative
        # Release snapshot transaction during CPU work. The result's revision is checked on apply.
        db.commit()

        async def send(event, data):
            await emit(u.id, event, data)

        await send("optimization_started", {"revision": revision})
        s = await execute(state, db, u.id, send)
        oid = str(uuid.uuid4())
        result = {
            **s["optimization_result"],
            **s.get("summary", {}),
            "id": oid,
            "original_items": items,
            "revision": revision,
            "mode": body.mode,
            "explanations": s.get("explanations", []),
            "recommendations": s.get("recommendations", []),
            "nutrition": s.get("nutrition_analysis", {}),
            "agents": s["agent_status"],
            "errors": s["errors"],
            "status": "pending",
        }
        db.add(Optimization(id=oid, user_id=u.id, revision=revision, result=result))
        db.commit()
        await send("recommendations_updated", result["recommendations"])
        await send("optimization_completed", result)
        if total(items) > state["budget"]:
            await send("budget_warning", {"over_by": total(items) - state["budget"]})
        return result


@app.post("/api/optimization/run")
@app.post("/api/recommendations/generate")
@app.post("/api/agents/execute")
async def run(body: RunInput, u: User = Depends(current), db: DB = Depends(get_db)):
    return await run_optimization(body, u, db)


def owned_result(db, oid, uid):
    r = db.get(Optimization, oid)
    if not r or r.user_id != uid:
        raise HTTPException(404, "Optimization not found")
    return r


@app.get("/api/optimization/results/{oid}")
def result(oid: str, u: User = Depends(current), db: DB = Depends(get_db)):
    r = owned_result(db, oid, u.id)
    return {**r.result, "status": r.status}


@app.get("/api/recommendations")
@app.get("/api/recommendations/explanations")
async def recommendations(u: User = Depends(current), db: DB = Depends(get_db)):
    return (await run_optimization(RunInput(), u, db))["recommendations"]


@app.post("/api/optimization/apply")
async def apply(body: Decision, u: User = Depends(current), db: DB = Depends(get_db)):
    u = locked_user(db, u.id)
    r = owned_result(db, body.optimization_id, u.id)
    if r.status != "pending":
        raise HTTPException(409, "This optimization was already decided")
    if r.revision != u.revision:
        raise HTTPException(
            409, "Basket or preferences changed. Run optimization again."
        )
    if not r.result["feasible"]:
        raise HTTPException(422, "Cannot apply an infeasible optimization")
    items = r.result["items"]
    if body.accepted_item_ids is not None:
        original = {i["id"]: i for i in r.result["original_items"]}
        accepted = set(body.accepted_item_ids)
        if not accepted.issubset(original):
            raise HTTPException(422, "Unknown proposal line ID")
        decisions = {d["item_id"]: d for d in r.result.get("decisions", [])}
        lines = []
        for iid, old in original.items():
            if iid not in accepted:
                lines.append(old)
                continue
            choice = decisions.get(iid)
            if not choice:
                raise HTTPException(422, "No decision available for this line")
            if choice["product"]:
                lines.append(
                    {k: choice[k] for k in ["product", "quantity", "minimum", "locked"]}
                )
        merged = {}
        for line in lines:
            pid = line["product"]["id"]
            if pid in merged:
                merged[pid]["quantity"] += line["quantity"]
                merged[pid]["minimum"] += line["minimum"]
                merged[pid]["locked"] = merged[pid]["locked"] or line["locked"]
            else:
                merged[pid] = {**line}
        items = list(merged.values())
    cost = 0
    for item in items:
        p = db.get(Product, item["product"]["id"])
        validate_item(p, item["quantity"], item["minimum"], u.preferences)
        cost += p.price * item["quantity"]
    if cost > u.preferences["budget"]:
        raise HTTPException(
            409, "Prices changed or budget exceeded. Run optimization again."
        )
    db.execute(delete(BasketItem).where(BasketItem.user_id == u.id))
    for i in items:
        db.add(
            BasketItem(
                user_id=u.id,
                product_id=i["product"]["id"],
                quantity=i["quantity"],
                minimum=i["minimum"],
                locked=i["locked"],
            )
        )
    r.status = "applied"
    changed(db, u)
    return await updated(db, u)


@app.post("/api/optimization/reject")
def reject(body: Decision, u: User = Depends(current), db: DB = Depends(get_db)):
    u = locked_user(db, u.id)
    r = owned_result(db, body.optimization_id, u.id)
    if r.status != "pending":
        raise HTTPException(409, "This optimization was already decided")
    r.status = "rejected"
    db.commit()
    return {"status": "rejected"}


@app.get("/api/history")
def history(u: User = Depends(current), db: DB = Depends(get_db)):
    return [
        {
            "id": h.id,
            "items": h.items,
            "total": h.total,
            "savings": h.savings,
            "budget": h.budget,
            "created_at": h.created_at.isoformat(),
        }
        for h in db.scalars(
            select(History).where(History.user_id == u.id).order_by(History.id.desc())
        )
    ]


@app.post("/api/history/checkout")
async def checkout(u: User = Depends(current), db: DB = Depends(get_db)):
    u = locked_user(db, u.id)
    items = basket(db, u.id)
    if not items:
        raise HTTPException(422, "Basket is empty")
    if total(items) > u.preferences["budget"]:
        raise HTTPException(422, "Basket exceeds your session budget")
    savings = 0
    # Stock is reduced atomically; a competing checkout cannot oversell.
    for i in sorted(items, key=lambda i: i["product"]["id"]):
        p = db.get(Product, i["product"]["id"])
        validate_item(p, i["quantity"], i["minimum"], u.preferences)
        updated_stock = db.execute(
            update(Product)
            .where(Product.id == p.id, Product.stock >= i["quantity"])
            .values(stock=Product.stock - i["quantity"])
        )
        if updated_stock.rowcount != 1:
            raise HTTPException(409, "Stock changed. Refresh your basket.")
        savings += (p.original_price - p.price) * i["quantity"]
    h = History(
        user_id=u.id,
        total=total(items),
        savings=savings,
        budget=u.preferences["budget"],
        items=items,
    )
    db.add(h)
    db.execute(delete(BasketItem).where(BasketItem.user_id == u.id))
    changed(db, u)
    await emit(None, "inventory_updated", {"source": "sample checkout inventory"})
    await updated(db, u)
    return {"id": h.id, "total": h.total, "savings": savings}


@app.get("/api/analytics/overview")
@app.get("/api/analytics/spending")
@app.get("/api/analytics/categories")
@app.get("/api/analytics/savings")
def analytics(u: User = Depends(current), db: DB = Depends(get_db)):
    rows = list(db.scalars(select(History).where(History.user_id == u.id)))
    cats = Counter()
    months = defaultdict(lambda: {"spending": 0, "savings": 0})
    freq = Counter()
    for h in rows:
        month = h.created_at.strftime("%Y-%m")
        months[month]["spending"] += h.total
        months[month]["savings"] += h.savings
        for i in h.items:
            cats[i["product"]["category"]] += i["product"]["price"] * i["quantity"]
            freq[i["product"]["name"]] += i["quantity"]
    decisions = list(
        db.scalars(
            select(Optimization.status).where(
                Optimization.user_id == u.id,
                Optimization.status.in_(["applied", "rejected"]),
            )
        )
    )
    spend = sum(h.total for h in rows)
    return {
        "total_spending": spend,
        "average_basket": spend // max(1, len(rows)),
        "savings": sum(h.savings for h in rows),
        "orders": len(rows),
        "budget_utilization": spend / max(1, sum(h.budget for h in rows)),
        "acceptance_rate": decisions.count("applied") / max(1, len(decisions)),
        "categories": [{"name": k, "value": v} for k, v in cats.items()],
        "monthly": [{"month": k, **v} for k, v in sorted(months.items())],
        "frequent": [{"name": k, "quantity": v} for k, v in freq.most_common(10)],
        "savings_definition": "Sample list price minus checkout price; not cumulative optimization estimates.",
    }


@app.get("/api/agents/status")
def agents(u: User = Depends(current), db: DB = Depends(get_db)):
    return [
        {
            "name": r.name,
            "status": r.status,
            "duration_ms": r.duration_ms,
            "detail": r.detail,
            "execution_id": r.execution_id,
        }
        for r in db.scalars(
            select(AgentLog)
            .where(AgentLog.user_id == u.id)
            .order_by(AgentLog.id.desc())
            .limit(8)
        )
    ]


@app.post("/api/auth/ws-ticket")
def ws_ticket(u: User = Depends(current)):
    return {"ticket": token(u.id, "ws"), "session_id": str(u.id)}


@app.websocket("/ws/basket/{session_id}")
async def websocket(ws: WebSocket, session_id: str):
    try:
        uid = decode(ws.query_params.get("ticket", ""), "ws")
        if str(uid) != session_id:
            raise HTTPException(403, "Wrong session")
        with Session() as db:
            if not db.get(User, uid):
                raise HTTPException(401, "User not found")
    except HTTPException:
        await ws.close(code=4401)
        return
    await ws.accept()
    connections[uid].add(ws)
    try:
        while True:
            message = await ws.receive_text()
            if message == "ping":
                await ws.send_json({"event": "pong", "data": {}})
    except WebSocketDisconnect:
        pass
    finally:
        connections[uid].discard(ws)
