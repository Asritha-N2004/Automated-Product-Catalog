import { useState, useEffect } from "react";
import { Check, LoaderCircle, RefreshCw } from "lucide-react";
import { Result, Agent } from "./types";
import { money } from "./api";
import { PageTitle } from "./pages";
import { Stat } from "./components";
export function Optimization({
  result,
  stale,
  states,
  mode,
  setMode,
  run,
  decide,
  busy,
}: {
  result: Result | null;
  stale: boolean;
  states: Agent[];
  mode: string;
  setMode: (m: string) => void;
  run: () => void;
  decide: (v: boolean, ids?: number[]) => void;
  busy: boolean;
}) {
  const changes = (result?.decisions ?? []).filter((d) => {
    const old = result?.original_items?.find((i) => i.id === d.item_id);
    return (
      old && (old.product.id !== d.product?.id || old.quantity !== d.quantity)
    );
  });
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => setSelected(changes.map((d) => d.item_id)), [result?.id]);
  return (
    <>
      <PageTitle
        eyebrow="EIGHT AGENTS. ONE BETTER BASKET."
        title="Make more of your grocery budget"
        text="Review every proposed change. Your basket only changes when you choose to apply."
      />
      <div className="optimization-toolbar">
        <label>
          Optimization mode{" "}
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {[
              "Balanced",
              "Budget Saver",
              "Nutrition Focus",
              "Preference Focus",
              "Essentials First",
            ].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          onClick={run}
          disabled={states.some((a) => a.status === "running")}
        >
          <RefreshCw size={16} /> Reevaluate basket
        </button>
      </div>
      <div className="agent-grid">
        {[
          "User Context",
          "Product Intelligence",
          "Recommendation",
          "Nutrition and Dietary",
          "Budget Optimization",
          "Inventory and Availability",
          "Basket Optimization",
          "Explanation",
        ].map((name, i) => {
          const a = states.find((a) => a.name === name);
          return (
            <div className="agent-card" key={name}>
              <span>
                {a?.status === "running" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : a?.status === "completed" ? (
                  <Check size={17} />
                ) : (
                  i + 1
                )}
              </span>
              <div>
                <strong>{name}</strong>
                <small>
                  {a?.status ?? "Waiting"}
                  {a?.duration_ms !== undefined ? ` · ${a.duration_ms} ms` : ""}
                </small>
              </div>
            </div>
          );
        })}
      </div>
      {result ? (
        <>
          <div className="stats">
            <Stat
              label="Original basket"
              value={money(result.original_total)}
              note="Snapshot at analysis time"
            />
            <Stat
              label="Optimized basket"
              value={money(result.optimized_total)}
              note={
                result.feasible
                  ? "All hard constraints satisfied"
                  : "No feasible solution found"
              }
            />
            <Stat
              label="Potential savings"
              value={money(result.savings)}
              note="Difference between these two baskets"
              accent
            />
            <Stat
              label="Utility score"
              value={`${Math.round(result.optimization_score * 100)}%`}
              note={`${result.solver} · ${result.mode}`}
            />
          </div>
          {stale && (
            <div className="notice warning">
              Your basket or preferences changed. A new analysis is being
              prepared.
            </div>
          )}
          {!result.feasible && (
            <div className="notice warning">{result.conflicts.join(" ")}</div>
          )}
          <div className="comparison">
            <section className="panel">
              <h2>Your proposed basket</h2>
              {result.items.map((i) => (
                <div className="mini-item" key={i.product.id}>
                  <img src={i.product.image_url} alt="" />
                  <span>
                    {i.product.name}
                    <small>
                      {i.quantity} × {i.product.unit}
                      {i.locked ? " · Locked" : ""}
                    </small>
                  </span>
                  <strong>{money(i.product.price * i.quantity)}</strong>
                </div>
              ))}
              {!result.items.length && (
                <p className="muted">No items in this proposal.</p>
              )}
            </section>
            <section className="panel">
              <h2>Why these changes?</h2>
              {result.explanations.length ? (
                <ul className="explanations">
                  {result.explanations.map((e, i) => (
                    <li key={i}>
                      <Check size={16} />
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  Your current basket already meets these constraints. No
                  changes are proposed.
                </p>
              )}
              <div className="notice small">{result.nutrition.message}</div>
              {mode === "Nutrition Focus" && (
                <p className="small muted">
                  Nutrition is unknown, so nutrient utility is zero. This mode
                  cannot verify nutritional adequacy.
                </p>
              )}
              {result.errors.map((e) => (
                <p className="danger" key={e.agent}>
                  {e.agent}: {e.error}
                </p>
              ))}
              <fieldset className="proposal-choices">
                <legend>Choose which changes to accept</legend>
                {changes.map((d) => {
                  const old = result.original_items?.find(
                    (i) => i.id === d.item_id,
                  );
                  return (
                    <label key={d.item_id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(d.item_id)}
                        onChange={() =>
                          setSelected((ids) =>
                            ids.includes(d.item_id)
                              ? ids.filter((id) => id !== d.item_id)
                              : [...ids, d.item_id],
                          )
                        }
                      />
                      <span>
                        {old?.product.name} × {old?.quantity} →{" "}
                        {d.product
                          ? `${d.product.name} × ${d.quantity}`
                          : "Remove item"}
                      </span>
                    </label>
                  );
                })}
                {changes.length > 0 && (
                  <p className="small muted">
                    Unchecked changes keep your original item. The combined
                    basket must still satisfy your budget, stock and
                    restrictions.
                  </p>
                )}
              </fieldset>
              <div className="actions">
                <button
                  className="button"
                  disabled={
                    stale ||
                    !result.feasible ||
                    result.status !== "pending" ||
                    busy
                  }
                  onClick={() =>
                    decide(true, result.decisions ? selected : undefined)
                  }
                >
                  <Check size={16} /> Apply optimization
                </button>
                <button
                  className="button secondary"
                  disabled={result.status !== "pending" || busy}
                  onClick={() => decide(false)}
                >
                  Reject suggestion
                </button>
              </div>
              {result.status !== "pending" && (
                <p className="green">Suggestion {result.status}.</p>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="panel">
          <LoaderCircle className="spin" /> Preparing your analysis…
        </div>
      )}
    </>
  );
}
