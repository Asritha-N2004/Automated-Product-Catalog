# Agent workflow and optimization model

All agent executions are deterministic Python functions. No language model call is represented as having occurred.

1. User Context aggregates only the current user's completed purchase quantities and explicit preferences; records current India-local hour/day.
2. Product Intelligence finds interchangeable products by exact kind and pack unit, stock and declared restrictions. Other lines cannot merge into a locked product.
3. Recommendation calculates a configurable normalized hybrid ranking. It runs concurrently with Nutrition and Dietary, which flags declared conflicts and lists unknown nutrition.
4. Budget Optimization calculates exact totals, remaining budget and repeated product kinds.
5. Inventory and Availability reports quantities exceeding live snapshot stock.
6. Basket Optimization solves the constrained integer selection problem.
7. Explanation compares input and output selections and reports calculated totals, savings and utility.

There are eight agents: steps 3 contains two distinct agents. Each has a stable name, execution UUID, runtime, status, one retry and an eight-second timeout. Failures are returned in `errors`; useful results survive. Failure of optimization produces a non-applicable proposal. Worker threads do not access SQLAlchemy sessions. A timeout cancels waiting, not arbitrary thread execution.

## Hybrid ranking

Default weights are preference .30, history .25, context .20, content similarity .15, popularity proxy .10. `RECOMMENDATION_WEIGHTS` is a five-element JSON environment variable validated to sum to one. Personal history is normalized by maximum observed personal purchase count. Its slot blends 75% personal frequency and 25% item-item collaborative relevance. Collaborative relevance uses cosine-normalized co-occurrence in completed baskets, exposing no other user's identifiers or history. Empty history contributes zero. Content similarity compares category, kind and brand. The final component uses sample rating/5; it is labeled a rating proxy rather than fabricated popularity. Complement rules and selected context determine contextual relevance. Family context also uses household size. Morning dairy/bakery relevance is an explicitly inferred context signal. No seasonality is claimed without a reliable source.

## Integer optimization

For each basket line generate a finite set of `(valid product, integer quantity)` alternatives. A binary variable chooses exactly one option per input line. Optional lines include a zero-quantity removal. Locked lines only allow their original product and quantity; required minimum quantities omit invalid lower quantities. Alternatives require identical kind and unit.

Hard constraints:

- Sum of integer-paise costs ≤ session budget.
- Exactly one choice per input line.
- Aggregate demand per product ≤ available stock.
- No selected allergen/dietary conflicts.
- Locked quantities and minimum requirements remain satisfied.
- Quantities never exceed original requested amounts; the optimizer does not upsell.

The objective prioritizes retained requested quantities (reward 1000 per unit), then weighted normalized utility (reward up to 10 per unit), with a budget-normalized cost penalty. Default utility weights are preference .25, purchase history .20, context .15, nutrition .15, availability .10, affordability .10, content similarity .05. Unknown verified nutrition contributes **zero**; a missing nutrient value is not inferred. Budget Saver raises affordability and cost pressure, Preference Focus raises explicit preferences, Essentials First raises essential-category context, and Nutrition Focus reserves weight for verified nutrients but cannot establish adequacy for this sample catalog.

SciPy MILP has a five-second solve limit. If it returns a feasible incumbent it is validated; the UI does not claim global optimality. If it returns no solution, conflicts are reported. Exceptions use a required-first conservative greedy fallback. A fallback failure means no feasible basket was found by that fallback, not proof that one does not exist. Output is validated again before returning and at application time. True nutrient-constrained optimization requires verified structured nutrition, serving units and independently validated targets; it is not implemented using invented sample numbers.
