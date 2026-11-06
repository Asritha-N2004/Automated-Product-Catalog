# Provider integration boundaries

The application currently runs entirely with local deterministic agents. It does not require or call OpenAI or another LLM. This is a working local implementation, not a fake external-provider response.

## Optional LLM explanations

If adding an LLM provider, add the official provider SDK to the backend and read its API key only from a process environment variable such as `OPENAI_API_KEY`. Add an adapter around Explanation after the deterministic calculation. Supply a minimal JSON object of calculated changes, costs and constraint outcomes. Treat generated prose as untrusted presentation: validate that every mentioned product, cost, savings value and claim matches the deterministic object; otherwise return the existing local explanation. Set a timeout and preserve offline operation on provider failure. Do not send allergies, identity or purchase history without an explicit product privacy design. There is no external-provider adapter implemented in this repository, so setting a key alone does not activate one.

## Inventory and pricing

`products.stock`, `price` and `original_price` are the current sample provider. Checkout provides a deterministic inventory update and emits `inventory_updated`. A real provider adapter should validate signed/provider-authenticated updates, record price-history events, use integer paise and inventory reservations, and invalidate affected proposals. Application already rechecks current stock, price, budget and restrictions when applying or checking out. Unavailable or incompatible items are rejected.

## Nutrition

The sample records have null calories, protein, carbohydrate and fat and no verified source. Do not replace these with generated estimates. A real import needs manufacturer data, explicit per-100g/per-serving basis, pack weight, allergen statement, verified source reference and timestamp. Then implement unit-aware nutrient scoring and gap calculations with validated targets. At present Nutrition Focus exposes the limitation and does not claim nutrient adequacy or medical suitability.

## Recommendation scaling

The offline hybrid uses personal purchase frequency, item-item co-occurrence from actual persisted checkouts, product content and a labeled sample rating proxy. A production deployment can precompute sparse cosine similarities with scikit-learn or another equivalent engine and store model/version metadata. No synthetic user histories are seeded. Recommendations remain explainable when there is no collaborative history.
