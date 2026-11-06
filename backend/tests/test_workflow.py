import os, tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + tempfile.mktemp(suffix=".db")
os.environ["JWT_SECRET"] = "test-only-secret-with-at-least-32-characters"
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app, limits
from backend.app.database import Session, Product, Base, engine
from backend.app.agents import optimize, compatible, total


@pytest.fixture()
def client():
    limits.clear()
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:
        yield c


def auth(c, email="shopper@example.com"):
    r = c.post(
        "/api/auth/register",
        json={"email": email, "password": "test-password-123", "name": "Maya"},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def add(c, h, pid=1, q=1, **kw):
    return c.post(
        "/api/basket/items", headers=h, json={"product_id": pid, "quantity": q, **kw}
    )


def run(c, h):
    r = c.post("/api/optimization/run", headers=h, json={"mode": "Budget Saver"})
    assert r.status_code == 200, r.text
    return r.json()


def test_complete_workflow(client):
    c = client
    h = auth(c)
    assert len(c.get("/api/products").json()) == 110
    assert len(c.get("/api/products/categories").json()) == 11
    assert (
        c.post(
            "/api/auth/login",
            json={"email": "shopper@example.com", "password": "wrong-password"},
        ).status_code
        == 401
    )
    assert (
        c.post(
            "/api/auth/login",
            json={"email": "shopper@example.com", "password": "test-password-123"},
        ).status_code
        == 200
    )
    assert add(c, h, 2, 2).status_code == 200
    before = c.get("/api/basket", headers=h).json()
    assert before["total"] == 35000
    r = run(c, h)
    assert r["feasible"]
    assert r["savings"] == 3000
    assert len(r["agents"]) == 8
    assert all(a["status"] == "completed" for a in r["agents"])
    assert c.get("/api/basket", headers=h).json() == before
    assert (
        c.post(
            "/api/optimization/apply", headers=h, json={"optimization_id": r["id"]}
        ).status_code
        == 200
    )
    b = c.get("/api/basket", headers=h).json()
    assert b["total"] == 32000
    assert c.post("/api/history/checkout", headers=h).status_code == 200
    assert c.get("/api/analytics/overview", headers=h).json()["total_spending"] == 32000
    assert c.get("/api/basket", headers=h).json()["items"] == []
    assert len(c.get("/api/history", headers=h).json()) == 1


def test_constraints_and_stale_results(client):
    c = client
    h = auth(c)
    p = c.get("/api/users/profile", headers=h).json()["preferences"]
    p.update(budget=10000, allergies=["milk"], dietary=["vegan"])
    assert c.put("/api/users/preferences", headers=h, json=p).status_code == 200
    assert add(c, h, 21).status_code == 422
    assert add(c, h, 18).status_code == 409
    assert add(c, h, 1, 2).status_code == 200
    r = run(c, h)
    assert r["optimized_total"] <= 10000
    assert add(c, h, 3).status_code == 200
    assert (
        c.post(
            "/api/optimization/apply", headers=h, json={"optimization_id": r["id"]}
        ).status_code
        == 409
    )
    r = run(c, h)
    assert (
        c.post(
            "/api/optimization/reject", headers=h, json={"optimization_id": r["id"]}
        ).status_code
        == 200
    )
    assert (
        c.post(
            "/api/optimization/apply", headers=h, json={"optimization_id": r["id"]}
        ).status_code
        == 409
    )


def test_lock_minimum_and_authorization(client):
    c = client
    h = auth(c)
    other = auth(c, "other@example.com")
    item = add(c, h, 1, 2, locked=True, minimum=2).json()["items"][0]
    assert (
        c.delete("/api/basket/items/" + str(item["id"]), headers=other).status_code
        == 404
    )
    p = c.get("/api/users/profile", headers=h).json()["preferences"]
    p["budget"] = 100
    c.put("/api/users/preferences", headers=h, json=p)
    r = run(c, h)
    assert not r["feasible"]
    assert (
        c.get("/api/optimization/results/" + r["id"], headers=other).status_code == 404
    )
    assert (
        c.post(
            "/api/optimization/apply", headers=h, json={"optimization_id": r["id"]}
        ).status_code
        == 422
    )
    assert c.get("/api/basket").status_code in (401, 403)


def test_websocket_isolation(client):
    c = client
    h = auth(c)
    other = auth(c, "other@example.com")
    ticket = c.post("/api/auth/ws-ticket", headers=h).json()
    with c.websocket_connect(
        "/ws/basket/" + ticket["session_id"] + "?ticket=" + ticket["ticket"]
    ) as ws:
        add(c, h, 3)
        event = ws.receive_json()
        assert event["event"] == "basket_updated"
        assert event["data"]["total"] == 4500
    with pytest.raises(Exception):
        with c.websocket_connect("/ws/basket/999?ticket=" + ticket["ticket"]):
            pass


def test_empty_and_inventory_change(client):
    c = client
    h = auth(c)
    assert run(c, h)["items"] == []
    add(c, h, 2)
    r = run(c, h)
    with Session.begin() as db:
        db.get(Product, 1).stock = 0
    assert (
        c.post(
            "/api/optimization/apply", headers=h, json={"optimization_id": r["id"]}
        ).status_code
        == 409
    )


def test_solver_fallback_and_invariants(client):
    c = client
    h = auth(c)
    add(c, h, 2, 3)
    r = run(c, h)
    from backend.app.main import product, basket
    from backend.app.agents import context_agent, intelligence_agent
    from sqlalchemy import select

    with Session() as db:
        s = {
            "basket": basket(db, 1),
            "product_catalog": [product(p) for p in db.scalars(select(Product))],
            "preferences": c.get("/api/users/profile", headers=h).json()["preferences"],
            "budget": 20000,
            "history": [],
            "mode": "Balanced",
        }
        s.update(context_agent(s))
        s.update(intelligence_agent(s))
        out = optimize(s, force_fallback=True)
        assert out["feasible"]
        assert out["solver"] == "rule-based-fallback"
        assert total(out["items"]) <= 20000
        assert all(
            compatible(i["product"], s["preferences"])
            and i["quantity"] <= i["product"]["stock"]
            for i in out["items"]
        )


def test_preserves_locked_product_when_merging_substitutions(client):
    c = client
    h = auth(c)
    add(c, h, 1, 2, locked=True, minimum=2)
    add(c, h, 2, 1)
    r = run(c, h)
    assert r["feasible"]
    locked = next(i for i in r["items"] if i["product"]["id"] == 1)
    assert locked["locked"] and locked["quantity"] == 2


def test_minimum_quantity_and_zero_budget(client):
    c = client
    h = auth(c)
    add(c, h, 2, 3, minimum=2)
    p = c.get("/api/users/profile", headers=h).json()["preferences"]
    p["budget"] = 20000
    c.put("/api/users/preferences", headers=h, json=p)
    assert not run(c, h)["feasible"]
    p["budget"] = 33000
    c.put("/api/users/preferences", headers=h, json=p)
    r = run(c, h)
    assert r["feasible"]
    assert sum(i["quantity"] for i in r["items"]) >= 2


def test_preferences_change_detects_existing_conflict(client):
    c = client
    h = auth(c)
    add(c, h, 21)
    p = c.get("/api/users/profile", headers=h).json()["preferences"]
    p["allergies"] = ["milk"]
    c.put("/api/users/preferences", headers=h, json=p)
    r = run(c, h)
    assert r["feasible"]
    assert r["items"] == []
    assert r["nutrition"]["conflicts"]
    assert c.post("/api/history/checkout", headers=h).status_code == 422


def test_checkout_updates_stock_and_does_not_inflate_savings(client):
    c = client
    h = auth(c)
    initial = c.get("/api/products/3").json()["stock"]
    add(c, h, 3, 2)
    c.post("/api/history/checkout", headers=h)
    assert c.get("/api/products/3").json()["stock"] == initial - 2
    a = c.get("/api/analytics/overview", headers=h).json()
    assert a["savings"] == 1000
    assert a["orders"] == 1
    assert c.post("/api/history/checkout", headers=h).status_code == 422


def test_invalid_input_and_catalog_search(client):
    c = client
    h = auth(c)
    assert (
        c.post(
            "/api/auth/register", json={"email": "invalid", "password": "short"}
        ).status_code
        == 422
    )
    assert add(c, h, 1, 0).status_code == 422
    assert add(c, h, 1, 1, minimum=2).status_code == 422
    assert len(c.get("/api/products/search?q=Apple&brand=Everyday").json()) == 1
    assert c.get("/api/products/999999").status_code == 404


def test_parallel_basket_updates_have_no_lost_quantity(client):
    from concurrent.futures import ThreadPoolExecutor

    c = client
    h = auth(c)
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: add(c, h, 3), range(4)))
    assert all(r.status_code == 200 for r in results), [r.text for r in results]
    assert c.get("/api/basket", headers=h).json()["items"][0]["quantity"] == 4


def test_no_recommendations_when_inventory_empty(client):
    from sqlalchemy import update

    c = client
    h = auth(c)
    with Session.begin() as db:
        db.execute(update(Product).values(stock=0))
    assert run(c, h)["recommendations"] == []


def test_agent_failure_preserves_other_results(client, monkeypatch):
    import backend.app.agents as agents

    def fail(_):
        raise RuntimeError("failure for test")

    monkeypatch.setattr(agents, "nutrition_agent", fail)
    c = client
    h = auth(c)
    add(c, h, 3)
    r = run(c, h)
    assert r["feasible"]
    assert r["recommendations"]
    assert r["errors"][0]["agent"] == "Nutrition and Dietary"
    assert sum(a["status"] == "failed" for a in r["agents"]) == 1


def test_server_reevaluates_headless_basket_change(client):
    c = client
    h = auth(c)
    ticket = c.post("/api/auth/ws-ticket", headers=h).json()
    with c.websocket_connect(
        "/ws/basket/" + ticket["session_id"] + "?ticket=" + ticket["ticket"]
    ) as ws:
        add(c, h, 2)
        events = []
        while "optimization_completed" not in events:
            events.append(ws.receive_json()["event"])
        assert "basket_updated" in events
        assert "recommendations_updated" in events


def test_individual_proposal_acceptance(client):
    c = client
    h = auth(c)
    add(c, h, 2)
    add(c, h, 4)
    original = c.get("/api/basket", headers=h).json()["items"]
    r = run(c, h)
    apple_line = next(i["id"] for i in original if i["product"]["id"] == 2)
    response = c.post(
        "/api/optimization/apply",
        headers=h,
        json={"optimization_id": r["id"], "accepted_item_ids": [apple_line]},
    )
    assert response.status_code == 200, response.text
    assert {i["product"]["id"] for i in response.json()["items"]} == {1, 4}


def test_partial_acceptance_cannot_violate_budget(client):
    c = client
    h = auth(c)
    add(c, h, 2)
    prefs = c.get("/api/users/profile", headers=h).json()["preferences"]
    prefs["budget"] = 16000
    c.put("/api/users/preferences", headers=h, json=prefs)
    r = run(c, h)
    assert r["feasible"]
    response = c.post(
        "/api/optimization/apply",
        headers=h,
        json={"optimization_id": r["id"], "accepted_item_ids": []},
    )
    assert response.status_code == 409
    assert c.get("/api/basket", headers=h).json()["total"] == 17500


def test_collaborative_relevance_uses_anonymous_actual_checkouts(client):
    c = client
    h = auth(c)
    add(c, h, 1)
    add(c, h, 3)
    assert c.post("/api/history/checkout", headers=h).status_code == 200
    other = auth(c, "second@example.com")
    add(c, other, 1)
    recs = run(c, other)["recommendations"]
    banana = next(r for r in recs if r["product"]["id"] == 3)
    assert "Co-purchased" in banana["explanation"]
    assert "shopper@example.com" not in str(recs)
    assert "Previously purchased by you" not in banana["explanation"]
