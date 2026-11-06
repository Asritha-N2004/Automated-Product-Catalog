import { useEffect, useRef, useState } from "react";
import { NavLink, Routes, Route, Link, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Leaf,
  LayoutDashboard,
  Store,
  ShoppingBasket,
  Sparkles,
  SlidersHorizontal,
  ChartNoAxesCombined,
  History,
  Settings,
  LogOut,
  ArrowRight,
  ChevronRight,
  Check,
  X,
  Menu,
  Wifi,
  WifiOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { api, useSession, money, errorMessage } from "./api";
import {
  User,
  Product,
  Basket,
  Item,
  Result,
  Analytics,
  Order,
  Agent,
} from "./types";
import { ProductCard, BasketRow, Stat, Empty } from "./components";
import {
  Auth,
  Catalog,
  SettingsPage,
  PageTitle,
  Spending,
  AnalyticsView,
} from "./pages";
import { Optimization } from "./Optimization";
const navigation = [
  ["/", "Dashboard", LayoutDashboard],
  ["/store", "Grocery Store", Store],
  ["/basket", "My Basket", ShoppingBasket],
  ["/recommendations", "AI Recommendations", Sparkles],
  ["/optimize", "Optimize Basket", SlidersHorizontal],
  ["/analytics", "Analytics", ChartNoAxesCombined],
  ["/history", "Shopping History", History],
  ["/settings", "Settings", Settings],
] as const;
export default function App() {
  const { token, setToken } = useSession();
  const qc = useQueryClient();
  const location = useLocation();
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);
  const [detail, setDetail] = useState<Product | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [mode, setMode] = useState("Balanced");
  const [connected, setConnected] = useState(false);
  const [agentStates, setAgentStates] = useState<Agent[]>([]);
  const sequence = useRef(0);
  const userQ = useQuery({
    queryKey: ["user", token],
    queryFn: async () => (await api.get<User>("/auth/me")).data,
    enabled: !!token,
  });
  const basketQ = useQuery({
    queryKey: ["basket", token],
    queryFn: async () => (await api.get<Basket>("/basket")).data,
    enabled: !!token,
  });
  const catalogQ = useQuery({
    queryKey: ["catalog", token],
    queryFn: async ({ signal }) =>
      (await api.get<Product[]>("/products", { signal })).data,
    enabled: !!token,
  });
  const analyticsQ = useQuery({
    queryKey: ["analytics", token],
    queryFn: async () => (await api.get<Analytics>("/analytics/overview")).data,
    enabled: !!token,
  });
  const historyQ = useQuery({
    queryKey: ["history", token],
    queryFn: async () => (await api.get<Order[]>("/history")).data,
    enabled: !!token,
  });
  useEffect(() => {
    setResult(null);
    setAgentStates([]);
  }, [token]);
  const user = userQ.data;
  const b = basketQ.data;
  const products = catalogQ.data ?? [];
  const invalidate = () => {
    for (const key of ["basket", "analytics", "history"])
      qc.invalidateQueries({ queryKey: [key] });
  };
  const mutate = useMutation({
    mutationFn: async ({
      method,
      path,
      data,
    }: {
      method: "post" | "put" | "delete";
      path: string;
      data?: unknown;
    }) => (await api.request({ method, url: path, data })).data,
    onSuccess: invalidate,
    onError: (e) => setNotice(errorMessage(e)),
  });
  const add = (p: Product) =>
    mutate.mutate(
      {
        method: "post",
        path: "/basket/items",
        data: { product_id: p.id, quantity: 1 },
      },
      { onSuccess: () => setNotice(`${p.kind} added to your basket`) },
    );
  const change = (i: Item, patch: Partial<Item>) =>
    mutate.mutate({
      method: "put",
      path: `/basket/items/${i.id}`,
      data: {
        quantity: i.quantity,
        minimum: i.minimum,
        locked: i.locked,
        ...patch,
      },
    });
  const remove = (i: Item) =>
    mutate.mutate({ method: "delete", path: `/basket/items/${i.id}` });
  const runNow = async (signal?: AbortSignal) => {
    const id = ++sequence.current;
    setAgentStates([]);
    try {
      const r = (
        await api.post<Result>("/optimization/run", { mode }, { signal })
      ).data;
      if (id === sequence.current && !signal?.aborted) {
        setResult(r);
        setAgentStates(r.agents);
      }
    } catch (e) {
      if (!signal?.aborted) setNotice(errorMessage(e));
    }
  };
  useEffect(() => {
    if (!token || !b || !user) return;
    const controller = new AbortController();
    const timer = setTimeout(() => runNow(controller.signal), 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [token, b?.revision, user?.revision, mode, catalogQ.dataUpdatedAt]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!token) return;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let closed = false;
    async function connect() {
      try {
        const t = (await api.post("/auth/ws-ticket")).data;
        if (closed) return;
        socket = new WebSocket(
          `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/basket/${t.session_id}?ticket=${encodeURIComponent(t.ticket)}`,
        );
        socket.onopen = () => setConnected(true);
        socket.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.event === "basket_updated") {
            qc.invalidateQueries({ queryKey: ["basket"] });
            qc.invalidateQueries({ queryKey: ["user"] });
          }
          if (m.event === "inventory_updated") {
            qc.invalidateQueries({ queryKey: ["catalog"] });
            qc.invalidateQueries({ queryKey: ["basket"] });
          }
          if (m.event === "agent_status_updated")
            setAgentStates((old) => [
              ...old.filter((a) => a.name !== m.data.name),
              m.data,
            ]);
        };
        socket.onclose = () => {
          setConnected(false);
          if (!closed) timer = setTimeout(connect, 3000);
        };
      } catch {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 5000);
      }
    }
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [token, qc]);
  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement as HTMLElement | null;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
      if (e.key === "Tab") {
        const nodes = document.querySelectorAll<HTMLElement>(
          ".modal button:not(:disabled),.modal a,.modal input",
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handle);
    return () => {
      window.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [detail]);
  if (!token) return <Auth onMessage={setNotice} message={notice} />;
  if (userQ.isPending || basketQ.isPending || catalogQ.isPending)
    return (
      <div className="fullscreen">
        <LoaderCircle className="spin" />
        <p>Preparing your grocery workspace…</p>
      </div>
    );
  if (!user || !b || userQ.isError || basketQ.isError || catalogQ.isError)
    return (
      <div className="fullscreen">
        <h2>Could not load your workspace</h2>
        <p>{errorMessage(userQ.error || basketQ.error || catalogQ.error)}</p>
        <button onClick={() => qc.invalidateQueries()}>Try again</button>
        <button
          onClick={() => {
            setToken(null);
            qc.clear();
          }}
        >
          Sign out
        </button>
      </div>
    );
  const remaining = user.preferences.budget - b.total;
  const recs = result?.recommendations ?? [];
  const stale =
    !!result && (result.revision !== b.revision || result.mode !== mode);
  const decide = (accept: boolean, acceptedIds?: number[]) => {
    if (!result) return;
    mutate.mutate(
      {
        method: "post",
        path: `/optimization/${accept ? "apply" : "reject"}`,
        data: { optimization_id: result.id, accepted_item_ids: acceptedIds },
      },
      {
        onSuccess: () => {
          setResult({ ...result, status: accept ? "applied" : "rejected" });
          setNotice(
            accept
              ? "Optimization applied to your basket"
              : "Suggestion rejected. Your basket is unchanged.",
          );
        },
      },
    );
  };
  const cards = (list: Product[], reasons?: string[]) =>
    list.map((p, i) => (
      <ProductCard
        key={p.id}
        p={p}
        onAdd={add}
        onDetail={setDetail}
        reason={reasons?.[i]}
        busy={mutate.isPending}
      />
    ));
  return (
    <div className="app">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <Link className="brand" to="/" onClick={() => setMenu(false)}>
          <div className="brand-mark">
            <Leaf size={25} />
          </div>
          freshwise<span>®</span>
        </Link>
        <div className="workspace-label">YOUR SHOPPING WORKSPACE</div>
        <nav>
          {navigation.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              onClick={() => setMenu(false)}
            >
              <Icon size={19} />
              {label}
              {path === "/basket" && b.items.length > 0 && (
                <span className="nav-count">{b.items.length}</span>
              )}
              {path === "/recommendations" && (
                <span className="ai-badge">AI</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={22} />
            <strong>
              Thoughtful shopping.
              <br />
              Powered by intelligence.
            </strong>
            <p>8 specialized local agents working together for your basket.</p>
            <Link to="/optimize">
              Meet your agents <ArrowRight size={14} />
            </Link>
          </div>
          <button
            className="account"
            onClick={() => {
              setToken(null);
              qc.clear();
              setResult(null);
            }}
          >
            <span className="avatar">{user.name[0].toUpperCase()}</span>
            <span>
              <strong>{user.name}</strong>
              <small>Personal workspace</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setMenu(!menu)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>
              {navigation.find(([p]) => p === location.pathname)?.[1] ??
                "Dashboard"}
            </strong>
          </span>
          <div className="top-right">
            <span className={`connection ${connected ? "" : "offline"}`}>
              {connected ? <Wifi size={13} /> : <WifiOff size={13} />}{" "}
              {connected ? "Live connection" : "Reconnecting"}
            </span>
            <span className="sample">SAMPLE CATALOG</span>
            <span className="avatar">{user.name[0].toUpperCase()}</span>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow green">
                        A LITTLE PLANNING. A BETTER BASKET.
                      </div>
                      <h1>
                        Good things in your basket, {user.name.split(" ")[0]}.
                      </h1>
                      <p>
                        Your groceries, your budget. A smarter way to bring it
                        all together.
                      </p>
                    </div>
                    <Link className="button secondary" to="/store">
                      Explore the store <ArrowRight size={16} />
                    </Link>
                  </div>
                  <div className="hero">
                    <div className="hero-copy">
                      <span className="hero-tag">
                        <Sparkles size={14} /> YOUR PERSONAL GROCERY
                        INTELLIGENCE
                      </span>
                      <h2>
                        Shop with intention.
                        <br />
                        Make every rupee count.
                      </h2>
                      <p>
                        Find your everyday essentials and let eight specialized
                        agents help you build a better basket.
                      </p>
                      <Link className="button" to="/optimize">
                        Optimize my basket <ArrowRight size={17} />
                      </Link>
                      <span className="hero-foot">
                        <ShieldCheck size={14} /> You’re always in control of
                        every change.
                      </span>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="art-ring" />
                      <span className="grocery apple">🍎</span>
                      <span className="grocery broccoli">🥦</span>
                      <span className="grocery bread">🍞</span>
                      <span className="grocery carrot">🥕</span>
                      <div className="paper-bag">
                        <Leaf size={42} />
                        <span>freshwise</span>
                      </div>
                      <div className="floating-note">
                        <span className="check-round">
                          <Check size={16} />
                        </span>
                        <div>
                          Fresh picks. Smarter choices.
                          <small>Made for your household</small>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="stats">
                    <Stat
                      label="Shopping budget"
                      value={money(user.preferences.budget)}
                      note={`${user.preferences.frequency} shopping · ${user.preferences.household_size} people`}
                    />
                    <Stat
                      label="Current basket"
                      value={money(b.total)}
                      note={`${b.items.reduce((n, i) => n + i.quantity, 0)} items thoughtfully selected`}
                    />
                    <Stat
                      label="Remaining budget"
                      value={money(remaining)}
                      note={
                        remaining < 0
                          ? "Your basket is over budget"
                          : "Room for your everyday essentials"
                      }
                    />
                    <Stat
                      label="Potential savings"
                      value={money(stale ? 0 : (result?.savings ?? 0))}
                      note="Review your current optimization"
                      accent
                    />
                  </div>
                  <div className="dashboard-columns">
                    <section>
                      <div className="section-heading">
                        <div>
                          <h2>Picked for your everyday</h2>
                          <p>Discover the essentials across our aisles.</p>
                        </div>
                        <Link to="/store">
                          All categories <ArrowRight size={15} />
                        </Link>
                      </div>
                      <div className="category-grid">
                        {[
                          "Vegetables",
                          "Fruits",
                          "Dairy",
                          "Grains",
                          "Bakery",
                          "Household essentials",
                        ].map((cat) => (
                          <Link
                            to={`/store?category=${encodeURIComponent(cat)}`}
                            key={cat}
                          >
                            <img
                              src={`/products/${cat.toLowerCase().replaceAll(" ", "-")}.svg`}
                              alt=""
                            />
                            <span>{cat}</span>
                          </Link>
                        ))}
                      </div>
                      <div className="section-heading">
                        <div>
                          <h2>
                            Recommended for you{" "}
                            <span className="pill">PERSONALIZED</span>
                          </h2>
                          <p>
                            Based on your preferences and what’s in your basket.
                          </p>
                        </div>
                        <Link to="/recommendations">
                          View all <ArrowRight size={15} />
                        </Link>
                      </div>
                      {recs.length ? (
                        <div className="product-grid compact">
                          {cards(recs.slice(0, 3).map((r) => r.product))}
                        </div>
                      ) : (
                        <Empty
                          title="Your recommendations are on their way"
                          text="Set your preferences or add your first product to get started."
                        />
                      )}
                    </section>
                    <aside className="insight-column">
                      <div className="insight-card">
                        <div className="insight-heading">
                          <span className="spark-box">
                            <Sparkles size={20} />
                          </span>
                          <h3>A little basket wisdom</h3>
                        </div>
                        <p>
                          {remaining < 0
                            ? `Your basket is ${money(-remaining)} above budget. Review substitutions to make it fit.`
                            : result?.savings
                              ? `Your agents found ${money(result.savings)} in potential savings. Review the changes before applying.`
                              : "Add a few everyday essentials. Your agents will look for relevant choices and lower-priced alternatives."}
                        </p>
                        <Link to="/optimize">
                          See your insights <ArrowRight size={15} />
                        </Link>
                        <div className="agent-dots">
                          {Array.from({ length: 8 }, (_, i) => (
                            <span key={i} />
                          ))}{" "}
                          8 local agents
                        </div>
                      </div>
                      <div className="panel budget-panel">
                        <div className="section-heading">
                          <h3>Your basket at a glance</h3>
                          <ShoppingBasket size={18} />
                        </div>
                        <div className="budget-amount">
                          {money(b.total)}{" "}
                          <span>/ {money(user.preferences.budget)}</span>
                        </div>
                        <div className="progress">
                          <i
                            style={{
                              width: `${Math.min(100, (b.total / Math.max(1, user.preferences.budget)) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="small muted">
                          {Math.round(
                            (b.total / Math.max(1, user.preferences.budget)) *
                              100,
                          )}
                          % of your shopping budget
                        </p>
                        {b.items.slice(0, 3).map((i) => (
                          <div className="mini-item" key={i.id}>
                            <img src={i.product.image_url} alt="" />
                            <span>
                              {i.product.kind}
                              <small>
                                {i.quantity} × {i.product.unit}
                              </small>
                            </span>
                            <strong>
                              {money(i.product.price * i.quantity)}
                            </strong>
                          </div>
                        ))}
                        {!b.items.length && (
                          <p className="small muted">
                            A fresh start. Your basket is empty.
                          </p>
                        )}
                        <Link className="button secondary full" to="/basket">
                          View my basket <ArrowRight size={15} />
                        </Link>
                      </div>
                    </aside>
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>Your spending story</h2>
                      <p>
                        Real insights from your completed shopping sessions.
                      </p>
                    </div>
                    <Link to="/analytics">
                      Explore analytics <ArrowRight size={15} />
                    </Link>
                  </div>
                  <Spending data={analyticsQ.data} />
                </>
              }
            />
            <Route
              path="/store"
              element={<Catalog products={products} cards={cards} />}
            />
            <Route
              path="/basket"
              element={
                <>
                  <PageTitle
                    eyebrow="YOUR EVERYDAY ESSENTIALS"
                    title="A thoughtfully filled basket"
                    text="Fine-tune quantities, lock your favorites, and keep an eye on your budget."
                  />
                  <div className="basket-layout">
                    <section className="panel">
                      {b.items.length ? (
                        b.items.map((i) => (
                          <BasketRow
                            key={i.id}
                            item={i}
                            onChange={change}
                            onRemove={remove}
                            busy={mutate.isPending}
                          />
                        ))
                      ) : (
                        <Empty
                          title="Room for something good"
                          text="Explore the store and add your everyday essentials."
                        />
                      )}
                      <Link className="text-link" to="/store">
                        Continue shopping <ArrowRight size={15} />
                      </Link>
                    </section>
                    <aside className="panel">
                      <h2>Basket summary</h2>
                      <dl>
                        <dt>Subtotal</dt>
                        <dd>{money(b.total)}</dd>
                        <dt>Session budget</dt>
                        <dd>{money(user.preferences.budget)}</dd>
                        <dt>Remaining</dt>
                        <dd className={remaining < 0 ? "danger" : "green"}>
                          {money(remaining)}
                        </dd>
                      </dl>
                      <Link className="button full" to="/optimize">
                        <Sparkles size={16} /> Review optimization
                      </Link>
                      <button
                        className="button secondary full"
                        disabled={
                          !b.items.length || remaining < 0 || mutate.isPending
                        }
                        onClick={() =>
                          mutate.mutate(
                            { method: "post", path: "/history/checkout" },
                            {
                              onSuccess: () => {
                                qc.invalidateQueries({ queryKey: ["catalog"] });
                                setNotice(
                                  "Sample checkout completed and saved to history.",
                                );
                              },
                            },
                          )
                        }
                      >
                        Complete sample checkout
                      </button>
                      <p className="small muted">
                        Sample checkout saves history and reduces demo stock. No
                        payment is collected.
                      </p>
                    </aside>
                  </div>
                </>
              }
            />
            <Route
              path="/recommendations"
              element={
                <>
                  <PageTitle
                    eyebrow="PERSONALIZED, WITH REASONS"
                    title="Good choices, just for you"
                    text="Your preferences, purchase history, context, product similarity and sample catalog rating."
                  />
                  <div className="notice">
                    <Sparkles size={18} />
                    Deterministic local recommendations · No external AI
                    provider is called.
                  </div>
                  <div className="product-grid">
                    {cards(
                      recs.map((r) => r.product),
                      recs.map(
                        (r) =>
                          `${Math.round(r.score * 100)}% relevance · ${r.explanation}`,
                      ),
                    )}
                  </div>
                  {!recs.length && (
                    <Empty
                      title="No recommendations available"
                      text="No products currently match your restrictions, or analysis is still running."
                    />
                  )}
                </>
              }
            />
            <Route
              path="/optimize"
              element={
                <Optimization
                  result={result}
                  stale={stale}
                  states={agentStates}
                  mode={mode}
                  setMode={setMode}
                  run={() => runNow()}
                  decide={decide}
                  busy={mutate.isPending}
                />
              }
            />
            <Route
              path="/analytics"
              element={
                <>
                  <PageTitle
                    eyebrow="YOUR SHOPPING, IN PERSPECTIVE"
                    title="Small choices. A clearer picture."
                    text="Calculated from your saved checkout history."
                  />
                  {analyticsQ.isError ? (
                    <p role="alert">
                      Analytics could not load.{" "}
                      <button onClick={() => analyticsQ.refetch()}>
                        Retry
                      </button>
                    </p>
                  ) : (
                    <AnalyticsView data={analyticsQ.data} />
                  )}
                </>
              }
            />
            <Route
              path="/history"
              element={
                <>
                  <PageTitle
                    eyebrow="YOUR SHOPPING JOURNAL"
                    title="Every basket has a story"
                    text="Review your completed sample shopping sessions."
                  />
                  {historyQ.isError ? (
                    <button onClick={() => historyQ.refetch()}>
                      Retry history
                    </button>
                  ) : historyQ.data?.length ? (
                    historyQ.data.map((h) => (
                      <details className="panel history-entry" key={h.id}>
                        <summary>
                          <span>
                            Basket #{h.id}
                            <small>
                              {new Date(h.created_at).toLocaleString("en-IN")}
                            </small>
                          </span>
                          <strong>{money(h.total)}</strong>
                          <span className="pill">Saved {money(h.savings)}</span>
                        </summary>
                        {h.items.map((i) => (
                          <div className="mini-item" key={i.product.id}>
                            <span>
                              {i.product.name} × {i.quantity}
                            </span>
                            <strong>
                              {money(i.product.price * i.quantity)}
                            </strong>
                          </div>
                        ))}
                      </details>
                    ))
                  ) : (
                    <Empty
                      title="Your first shopping story starts here"
                      text="Complete a sample checkout to see your history."
                    />
                  )}
                </>
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  user={user}
                  onSave={async (p) => {
                    try {
                      await api.put("/users/preferences", p);
                      qc.invalidateQueries({ queryKey: ["user"] });
                      qc.invalidateQueries({ queryKey: ["basket"] });
                      setNotice(
                        "Preferences saved. Your agents are reevaluating your basket.",
                      );
                    } catch (e) {
                      setNotice(errorMessage(e));
                      throw e;
                    }
                  }}
                />
              }
            />
            <Route
              path="*"
              element={
                <Empty
                  title="Page not found"
                  text="Choose a page from the navigation."
                />
              }
            />
          </Routes>
          <footer>
            <span>
              <Leaf size={14} /> freshwise · Better baskets, everyday.
            </span>
            <span>Sample prices & inventory · Nutrition data unknown</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close product details"
              onClick={() => setDetail(null)}
              autoFocus
            >
              <X />
            </button>
            <img
              className="detail-image"
              src={detail.image_url}
              alt={detail.category}
            />
            <div className="eyebrow green">
              {detail.category} · {detail.brand}
            </div>
            <h2>{detail.name}</h2>
            <p>
              {detail.unit} · {detail.stock} available · ★ {detail.rating / 10}
            </p>
            <h2>{money(detail.price)}</h2>
            <p>Dietary tags: {detail.tags.join(", ") || "None declared"}</p>
            <p>
              Allergens:{" "}
              {detail.allergens.join(", ") || "None declared in sample record"}
            </p>
            <div className="notice">
              Nutrition: unknown. Demo data does not establish medical
              suitability.
            </div>
            <button
              className="button full"
              disabled={!detail.stock || mutate.isPending}
              onClick={() => add(detail)}
            >
              Add to basket <ShoppingBasket size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
