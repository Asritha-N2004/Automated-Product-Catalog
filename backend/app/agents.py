"""Deterministic, data-grounded agents sharing one structured state.
No LLM is called. Parallel agents return isolated patches before merging.
"""

import asyncio, time, uuid, logging, os, json, math
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo
import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint
from .database import AgentLog

logger = logging.getLogger(__name__)
MODES = [
    "Balanced",
    "Budget Saver",
    "Nutrition Focus",
    "Preference Focus",
    "Essentials First",
]
RECOMMENDATION_WEIGHTS = tuple(
    json.loads(os.getenv("RECOMMENDATION_WEIGHTS", "[0.30,0.25,0.20,0.15,0.10]"))
)
if (
    len(RECOMMENDATION_WEIGHTS) != 5
    or any(w < 0 for w in RECOMMENDATION_WEIGHTS)
    or abs(sum(RECOMMENDATION_WEIGHTS) - 1) > 1e-8
):
    raise RuntimeError(
        "Recommendation weights must be five nonnegative values summing to one"
    )
FOOD_EXEMPT = {"Household essentials", "Personal care"}


def compatible(p, prefs):
    if set(p["allergens"]) & set(prefs.get("allergies", [])):
        return False
    return p["category"] in FOOD_EXEMPT or all(
        d in p["tags"] for d in prefs.get("dietary", [])
    )


def total(items):
    return sum(i["product"]["price"] * i["quantity"] for i in items)


def context_agent(s):
    counts = Counter()
    for h in s["history"]:
        for i in h["items"]:
            counts[str(i["product"]["id"])] += i["quantity"]
    return {
        "user_context": {
            **s["preferences"],
            "purchase_counts": dict(counts),
            "hour": datetime.now(ZoneInfo("Asia/Kolkata")).hour,
            "weekday": datetime.now(ZoneInfo("Asia/Kolkata")).weekday(),
            "inference": "Purchase counts derive only from your completed checkouts.",
        }
    }


def intelligence_agent(s):
    catalog = s["product_catalog"]
    prefs = s["preferences"]
    locked_ids = {i["product"]["id"] for i in s["basket"] if i["locked"]}
    return {
        "alternatives": {
            str(i["product"]["id"]): [
                p
                for p in catalog
                if p["kind"] == i["product"]["kind"]
                and p["unit"] == i["product"]["unit"]
                and p["stock"] > 0
                and compatible(p, prefs)
                and (p["id"] not in locked_ids or p["id"] == i["product"]["id"])
            ]
            for i in s["basket"]
        }
    }


def scores(p, s):
    prefs = s["preferences"]
    counts = s["user_context"]["purchase_counts"]
    preference = (
        int(p["brand"] in prefs["preferred_brands"])
        + int(p["category"] in prefs["preferred_categories"])
        + int(compatible(p, prefs))
    ) / 3
    history = counts.get(str(p["id"]), 0) / max(1, max(counts.values(), default=1))
    # Item-item collaborative relevance from aggregate completed baskets.
    collaborative = s.get("collaborative_scores", {}).get(str(p["id"]), 0)
    history = 0.75 * history + 0.25 * collaborative
    kinds = {i["product"]["kind"] for i in s["basket"]}
    complements = {
        "Pasta": {"Tomato", "Cheese"},
        "Whole Wheat Bread": {"Butter", "Toned Milk"},
        "Rice": {"Toor Dal", "Moong Dal"},
        "Tea": {"Toned Milk"},
    }
    is_complement = any(p["kind"] in complements.get(k, set()) for k in kinds)
    context = (
        1.0
        if is_complement
        or (
            prefs["context"] == "breakfast"
            and p["category"] in ["Bakery", "Dairy", "Fruits"]
        )
        or (
            prefs["context"] == "essentials"
            and p["category"] in ["Grains", "Pulses", "Household essentials"]
        )
        else 0.25
    )
    similarity = max(
        (
            sum(
                [
                    p["category"] == i["product"]["category"],
                    p["kind"] == i["product"]["kind"],
                    p["brand"] == i["product"]["brand"],
                ]
            )
            / 3
            for i in s["basket"]
        ),
        default=0.2,
    )
    if (
        prefs["context"] == "family"
        and prefs["household_size"] >= 3
        and p["category"] in ["Grains", "Pulses", "Vegetables"]
    ):
        context = 1.0
    if 5 <= s["user_context"]["hour"] < 11 and p["category"] in ["Bakery", "Dairy"]:
        context = max(context, 0.6)
    # Catalog rating is an explicit sample quality/popularity proxy, not behavior evidence.
    popularity = p["rating"] / 50
    return preference, history, context, similarity, popularity


def recommendation_agent(s):
    ids = {i["product"]["id"] for i in s["basket"]}
    remaining = s["budget"] - total(s["basket"])
    out = []
    for p in s["product_catalog"]:
        if p["id"] in ids or p["stock"] <= 0 or not compatible(p, s["preferences"]):
            continue
        parts = scores(p, s)
        score = sum(a * b for a, b in zip(RECOMMENDATION_WEIGHTS, parts))
        why = []
        if s["user_context"]["purchase_counts"].get(str(p["id"]), 0) > 0:
            why.append("Previously purchased by you")
        if s.get("collaborative_scores", {}).get(str(p["id"]), 0) > 0:
            why.append(
                "Co-purchased with similar basket items in completed sample sessions"
            )
        if parts[2] == 1:
            why.append("Relevant to your basket or selected shopping context")
        if p["category"] in s["preferences"]["preferred_categories"]:
            why.append("Matches a preferred category")
        if p["price"] <= remaining:
            why.append("Fits within your remaining budget")
        if not why:
            why.append("Ranked using sample catalog rating and product similarity")
        out.append(
            {
                "product": p,
                "score": round(score, 4),
                "explanation": "; ".join(why),
                "components": dict(
                    zip(
                        [
                            "preference",
                            "history",
                            "context",
                            "similarity",
                            "sample_rating_proxy",
                        ],
                        parts,
                    )
                ),
            }
        )
    return {
        "recommendations": sorted(out, key=lambda x: (-x["score"], x["product"]["id"]))[
            :12
        ]
    }


def nutrition_agent(s):
    conflicts = [
        i["product"]["name"]
        for i in s["basket"]
        if not compatible(i["product"], s["preferences"])
    ]
    return {
        "nutrition_analysis": {
            "conflicts": conflicts,
            "unknown_products": [
                i["product"]["name"]
                for i in s["basket"]
                if not i["product"]["nutrition"].get("source")
            ],
            "message": "Sample catalog nutrition is unknown. No medical or nutrient-adequacy claims are made.",
        }
    }


def budget_agent(s):
    value = total(s["basket"])
    return {
        "budget_analysis": {
            "total": value,
            "remaining": s["budget"] - value,
            "warning": value > s["budget"],
            "duplicate_kinds": [
                k
                for k, n in Counter(i["product"]["kind"] for i in s["basket"]).items()
                if n > 1
            ],
        }
    }


def inventory_agent(s):
    return {
        "inventory": {
            "conflicts": [
                i["product"]["name"]
                for i in s["basket"]
                if i["quantity"] > i["product"]["stock"]
            ]
        }
    }


def utility(p, s):
    a, b, c, similarity, _ = scores(p, s)
    # Unknown nutrition contributes zero, never fabricated values.
    nutrition = 0.0
    price = 1 - p["price"] / max(1, max(x["price"] for x in s["product_catalog"]))
    weights = [0.25, 0.20, 0.15, 0.15, 0.10, 0.10, 0.05]
    if s["mode"] == "Budget Saver":
        weights = [0.10, 0.10, 0.10, 0, 0.10, 0.55, 0.05]
    if s["mode"] == "Preference Focus":
        weights = [0.55, 0.20, 0.10, 0, 0.05, 0.05, 0.05]
    if s["mode"] == "Nutrition Focus":
        weights = [0.20, 0.15, 0.15, 0.30, 0.10, 0.05, 0.05]
    if s["mode"] == "Essentials First":
        c = 1 if p["category"] in ["Grains", "Pulses", "Vegetables", "Dairy"] else 0
        weights = [0.15, 0.10, 0.40, 0, 0.10, 0.20, 0.05]
    return sum(
        w * v
        for w, v in zip(
            weights, [a, b, c, nutrition, float(p["stock"] > 0), price, similarity]
        )
    )


def optimize(s, force_fallback=False):
    basket = s["basket"]
    options = []
    groups = []
    conflicts = []
    for i in basket:
        original = i["product"]
        candidates = s["alternatives"].get(str(original["id"]), [])
        if i["locked"]:
            candidates = (
                [original]
                if compatible(original, s["preferences"])
                and original["stock"] >= i["quantity"]
                else []
            )
        choices = []
        # Each option is an entire line with integer quantity. Minimum quantities
        # and locked products are hard constraints; optional lines may be removed.
        for p in candidates:
            quantities = (
                [i["quantity"]]
                if i["locked"]
                else range(max(1, i["minimum"]), min(i["quantity"], p["stock"]) + 1)
            )
            for q in quantities:
                choices.append(len(options))
                options.append((i, p, q))
        if not i["locked"] and i["minimum"] == 0:
            choices.append(len(options))
            options.append((i, None, 0))
        if not choices:
            conflicts.append(
                f"Cannot satisfy required or locked item: {original['name']}"
            )
        groups.append(choices)
    if conflicts:
        return {
            "feasible": False,
            "items": basket,
            "conflicts": conflicts,
            "solver": "none",
        }
    if not options:
        return {"feasible": True, "items": [], "conflicts": [], "solver": "empty"}
    costs = np.array([p["price"] * q if p else 0 for _, p, q in options], dtype=float)
    # Large retention reward minimizes omitted quantities before secondary utility.
    objective = np.array(
        [
            (
                -(
                    q * 1000
                    + utility(p, s) * q * 10
                    - (p["price"] * q / max(1, s["budget"]))
                    * (20 if s["mode"] == "Budget Saver" else 2)
                )
                if p
                else 0
            )
            for _, p, q in options
        ]
    )
    rows = []
    lower = []
    upper = []
    for choices in groups:
        row = np.zeros(len(options))
        row[choices] = 1
        rows.append(row)
        lower.append(1)
        upper.append(1)
    rows.append(costs)
    lower.append(0)
    upper.append(s["budget"])
    for p in s["product_catalog"]:
        row = np.array(
            [q if alt and alt["id"] == p["id"] else 0 for _, alt, q in options]
        )
        if row.any():
            rows.append(row)
            lower.append(0)
            upper.append(p["stock"])
    solver = "scipy-milp"
    selected = []
    try:
        if force_fallback:
            raise RuntimeError("Simulated solver failure")
        result = milp(
            objective,
            integrality=np.ones(len(options)),
            bounds=Bounds(0, 1),
            constraints=LinearConstraint(np.array(rows), lower, upper),
            options={"time_limit": 5},
        )
        if result.x is None:
            return {
                "feasible": False,
                "items": basket,
                "conflicts": [
                    "Budget, inventory and required quantities cannot all be satisfied. Unlock items or adjust your budget."
                ],
                "solver": solver,
            }
        selected = [j for j, v in enumerate(result.x) if v > 0.5]
    except Exception:
        logger.exception("Solver failed; using conservative fallback")
        solver = "rule-based-fallback"
        remaining = s["budget"]
        used = Counter()
        # Required/locked groups first. A failed greedy search reports infeasibility;
        # it never emits a basket violating a hard constraint.
        for choices in sorted(
            groups,
            key=lambda g: (
                not options[g[0]][0]["locked"],
                -options[g[0]][0]["minimum"],
            ),
        ):
            valid = [
                j
                for j in choices
                if costs[j] <= remaining
                and (
                    options[j][1] is None
                    or used[options[j][1]["id"]] + options[j][2]
                    <= options[j][1]["stock"]
                )
            ]
            if not valid:
                return {
                    "feasible": False,
                    "items": basket,
                    "conflicts": [
                        "Fallback could not find a feasible basket. Try another budget or unlock required items."
                    ],
                    "solver": solver,
                }
            j = min(valid, key=lambda j: (objective[j], costs[j], j))
            selected.append(j)
            remaining -= int(costs[j])
            if options[j][1]:
                used[options[j][1]["id"]] += options[j][2]
    merged = {}
    for j in selected:
        old, p, q = options[j]
        if p:
            if p["id"] in merged:
                merged[p["id"]]["quantity"] += q
                merged[p["id"]]["minimum"] += old["minimum"]
            else:
                merged[p["id"]] = {
                    "product": p,
                    "quantity": q,
                    "minimum": old["minimum"],
                    "locked": old["locked"],
                }
    items = list(merged.values())
    decisions = [
        {
            "item_id": options[j][0]["id"],
            "original_product_id": options[j][0]["product"]["id"],
            "product": options[j][1],
            "quantity": options[j][2],
            "minimum": options[j][0]["minimum"],
            "locked": options[j][0]["locked"],
        }
        for j in selected
    ]
    if total(items) > s["budget"] or any(
        i["quantity"] > i["product"]["stock"]
        or not compatible(i["product"], s["preferences"])
        for i in items
    ):
        return {
            "feasible": False,
            "items": basket,
            "conflicts": ["Solver output failed constraint validation."],
            "solver": solver,
        }
    return {
        "feasible": True,
        "items": items,
        "decisions": decisions,
        "conflicts": [],
        "solver": solver,
    }


def optimization_agent(s):
    return {"optimization_result": optimize(s)}


def explanation_agent(s):
    r = s["optimization_result"]
    before = total(s["basket"])
    after = total(r["items"])
    changes = []
    for old in s["basket"]:
        matches = [
            i
            for i in r["items"]
            if i["product"]["kind"] == old["product"]["kind"]
            and i["product"]["unit"] == old["product"]["unit"]
        ]
        same = next(
            (i for i in matches if i["product"]["id"] == old["product"]["id"]), None
        )
        if same and same["quantity"] == old["quantity"]:
            continue
        replacement = same or (matches[0] if matches else None)
        if replacement:
            changes.append(
                f"{old['product']['name']} × {old['quantity']} → {replacement['product']['name']} × {replacement['quantity']}. Selection respects current budget, stock and declared restrictions."
            )
        else:
            changes.append(
                f"Remove {old['product']['name']} × {old['quantity']} to meet budget, availability or declared restrictions."
            )
    return {
        "explanations": changes,
        "summary": {
            "original_total": before,
            "optimized_total": after,
            "savings": max(0, before - after),
            "optimization_score": round(
                sum(utility(i["product"], s) * i["quantity"] for i in r["items"])
                / max(1, sum(i["quantity"] for i in r["items"])),
                4,
            ),
        },
    }


async def execute(s, db, uid, emit):
    execution_id = str(uuid.uuid4())
    s.update(errors=[], execution_id=execution_id, agent_status=[])

    async def run(name, fn):
        start = time.perf_counter()
        status = "completed"
        detail = "Deterministic local execution"
        patch = {}
        await emit(
            "agent_status_updated",
            {"name": name, "status": "running", "execution_id": execution_id},
        )
        for attempt in range(2):
            try:
                patch = await asyncio.wait_for(asyncio.to_thread(fn, s), timeout=8)
                break
            except Exception as exc:
                if attempt == 1:
                    status = "failed"
                    detail = type(exc).__name__
                    s["errors"].append({"agent": name, "error": detail})
        record = {
            "name": name,
            "status": status,
            "duration_ms": int((time.perf_counter() - start) * 1000),
            "detail": detail,
        }
        s["agent_status"].append(record)
        await emit("agent_status_updated", record)
        return patch

    s.update(await run("User Context", context_agent))
    s.setdefault("user_context", {"purchase_counts": {}})
    s.update(await run("Product Intelligence", intelligence_agent))
    s.setdefault("alternatives", {})
    patches = await asyncio.gather(
        run("Recommendation", recommendation_agent),
        run("Nutrition and Dietary", nutrition_agent),
    )
    for patch in patches:
        s.update(patch)
    s.update(await run("Budget Optimization", budget_agent))
    s.update(await run("Inventory and Availability", inventory_agent))
    s.update(await run("Basket Optimization", optimization_agent))
    s.setdefault(
        "optimization_result",
        {
            "feasible": False,
            "items": s["basket"],
            "conflicts": ["Optimization agent failed"],
            "solver": "none",
        },
    )
    s.update(await run("Explanation", explanation_agent))
    for r in s["agent_status"]:
        db.add(AgentLog(execution_id=execution_id, user_id=uid, **r))
    return s
