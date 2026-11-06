import { useEffect, useState, FormEvent, ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Leaf,
  ArrowRight,
  LoaderCircle,
  ShieldCheck,
  Search,
  Check,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { api, useSession, money, errorMessage } from "./api";
import { User, Product, Preferences, Analytics } from "./types";
import { Stat, Empty } from "./components";
export function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow green">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
export function Auth({
  onMessage,
  message,
}: {
  onMessage: (m: string) => void;
  message: string;
}) {
  const setToken = useSession((s) => s.setToken);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await api.post(`/auth/${register ? "register" : "login"}`, {
        email: f.get("email"),
        password: f.get("password"),
        name: f.get("name") || "Shopper",
      });
      setToken(r.data.access_token);
      onMessage("");
    } catch (err) {
      onMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link className="brand" to="/">
          <div className="brand-mark">
            <Leaf />
          </div>
          freshwise
        </Link>
        <div>
          <span className="eyebrow">A FRESH WAY TO SHOP</span>
          <h1>
            Good groceries.
            <br />
            Better decisions.
            <br />
            <em>Your kind of basket.</em>
          </h1>
          <p>
            A little intelligence goes a long way. Plan your essentials, find
            thoughtful alternatives, and keep your budget in balance.
          </p>
          <div className="auth-produce" aria-hidden="true">
            🥦 🥕 🍎
          </div>
        </div>
        <span className="small">
          Eight local agents. Transparent recommendations. Your control.
        </span>
      </div>
      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow green">
            WELCOME TO YOUR SHOPPING WORKSPACE
          </span>
          <h2>{register ? "Start something fresh." : "Welcome back."}</h2>
          <p className="muted">
            {register
              ? "Create an account to make your everyday shopping smarter."
              : "Your next thoughtful basket starts here."}
          </p>
          {register && (
            <label>
              Your name
              <input
                name="name"
                placeholder="e.g. Maya"
                required
                maxLength={100}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={10}
              maxLength={128}
              placeholder="At least 10 characters"
              required
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
          <button className="button full" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                {register ? "Create my account" : "Sign in to Freshwise"}
                <ArrowRight size={17} />
              </>
            )}
          </button>
          <p className="small muted">
            {register ? "Already have an account?" : "New to Freshwise?"}{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setRegister(!register);
                onMessage("");
              }}
            >
              {register ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="auth-disclosure">
            <ShieldCheck size={20} />
            <span>
              Local grocery intelligence. Sample catalog and inventory. No
              payment or AI API key needed.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
export function Catalog({
  products,
  cards,
}: {
  products: Product[];
  cards: (p: Product[]) => ReactNode;
}) {
  const location = useLocation();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(
    new URLSearchParams(location.search).get("category") || "",
  );
  const [brand, setBrand] = useState("");
  const [sort, setSort] = useState("name");
  const [max, setMax] = useState(500);
  const [available, setAvailable] = useState(false);
  useEffect(
    () => setCat(new URLSearchParams(location.search).get("category") || ""),
    [location.search],
  );
  const filtered = products
    .filter(
      (p) =>
        p.name.toLowerCase().includes(q.toLowerCase()) &&
        (!cat || p.category === cat) &&
        (!brand || p.brand === brand) &&
        p.price <= max * 100 &&
        (!available || p.stock > 0),
    )
    .sort((a, b) =>
      sort === "price"
        ? a.price - b.price
        : sort === "price_desc"
          ? b.price - a.price
          : sort === "rating"
            ? b.rating - a.rating
            : a.name.localeCompare(b.name),
    );
  return (
    <>
      <PageTitle
        eyebrow="FRESH FINDS & EVERYDAY FAVORITES"
        title="The good grocery edit"
        text="Explore 110 sample products, thoughtfully organized for your household."
      />
      <div className="catalog-tools">
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="Search products"
            placeholder="Search your everyday essentials…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Category"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          <option value="">All categories</option>
          {[...new Set(products.map((p) => p.category))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        >
          <option value="">All brands</option>
          <option>Everyday</option>
          <option>Harvest Select</option>
        </select>
        <select
          aria-label="Sort products"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">Name A–Z</option>
          <option value="price">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="rating">Best rated</option>
        </select>
      </div>
      <div className="catalog-meta">
        <span>{filtered.length} everyday discoveries</span>
        <label>
          Up to {money(max * 100)}{" "}
          <input
            type="range"
            min="20"
            max="500"
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />{" "}
          In stock only
        </label>
      </div>
      <div className="product-grid">{cards(filtered)}</div>
      {!filtered.length && (
        <Empty
          title="No products match your search"
          text="Try another category or a wider price range."
        />
      )}
    </>
  );
}
export function Spending({ data }: { data?: Analytics }) {
  return !data?.monthly.length ? (
    <div className="panel">
      <Empty
        title="A fresh start for your spending story"
        text="Complete a sample checkout to see your monthly spending and savings here."
      />
    </div>
  ) : (
    <div className="panel chart">
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart
          data={data.monthly.map((d) => ({
            ...d,
            spending: d.spending / 100,
            savings: d.savings / 100,
          }))}
        >
          <defs>
            <linearGradient id="greenArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#20815b" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#20815b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={(v) => money(Number(v) * 100)} />
          <Area
            type="monotone"
            dataKey="spending"
            stroke="#20815b"
            fill="url(#greenArea)"
          />
          <Area dataKey="savings" stroke="#e0ac48" fill="none" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function AnalyticsView({ data }: { data?: Analytics }) {
  if (!data) return <p>Loading analytics…</p>;
  return (
    <>
      <div className="stats">
        <Stat
          label="Total spending"
          value={money(data.total_spending)}
          note={`${data.orders} completed checkouts`}
        />
        <Stat
          label="Average basket"
          value={money(data.average_basket)}
          note="Across completed sessions"
        />
        <Stat
          label="Realized offer savings"
          value={money(data.savings)}
          note="Sample list price minus checkout price"
          accent
        />
        <Stat
          label="Optimization acceptance"
          value={`${Math.round(data.acceptance_rate * 100)}%`}
          note="Applied / applied and rejected decisions"
        />
      </div>
      <Spending data={data} />
      <div className="comparison">
        <div className="panel chart">
          <h2>Where your budget goes</h2>
          {data.categories.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={data.categories.map((c) => ({
                  ...c,
                  value: c.value / 100,
                }))}
                layout="vertical"
                margin={{ left: 40 }}
              >
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={110} />
                <Tooltip formatter={(v) => money(Number(v) * 100)} />
                <Bar dataKey="value" fill="#20815b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="muted">
              Category spending will appear after checkout.
            </p>
          )}
        </div>
        <div className="panel">
          <h2>Your household favorites</h2>
          {data.frequent.map((p) => (
            <div className="mini-item" key={p.name}>
              <span>{p.name}</span>
              <strong>{p.quantity} purchased</strong>
            </div>
          ))}
          {!data.frequent.length && (
            <p className="muted">No purchase history yet.</p>
          )}
          <p className="small muted">
            Historical budget utilization:{" "}
            {Math.round(data.budget_utilization * 100)}%
          </p>
        </div>
      </div>
    </>
  );
}
export function SettingsPage({
  user,
  onSave,
}: {
  user: User;
  onSave: (p: Preferences) => Promise<void>;
}) {
  const [p, setP] = useState(user.preferences);
  const [busy, setBusy] = useState(false);
  const toggle = (
    key: "dietary" | "allergies" | "preferred_categories" | "preferred_brands",
    v: string,
  ) =>
    setP({
      ...p,
      [key]: p[key].includes(v)
        ? p[key].filter((x) => x !== v)
        : [...p[key], v],
    });
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(p);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="MADE FOR YOUR HOUSEHOLD"
        title="Your preferences, at the center"
        text="Changing these explicit preferences triggers a fresh analysis without silently changing your basket."
      />
      <form className="settings-form panel" onSubmit={save}>
        <h2>Plan your shopping</h2>
        <div className="form-grid">
          <label>
            Session budget (₹)
            <input
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              value={p.budget / 100}
              onChange={(e) =>
                setP({ ...p, budget: Math.round(Number(e.target.value) * 100) })
              }
              required
            />
          </label>
          <label>
            Monthly budget (₹)
            <input
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              value={p.monthly_budget / 100}
              onChange={(e) =>
                setP({
                  ...p,
                  monthly_budget: Math.round(Number(e.target.value) * 100),
                })
              }
              required
            />
          </label>
          <label>
            Household size
            <input
              type="number"
              min="1"
              max="30"
              value={p.household_size}
              onChange={(e) =>
                setP({ ...p, household_size: Number(e.target.value) })
              }
              required
            />
          </label>
          <label>
            Shopping frequency
            <select
              value={p.frequency}
              onChange={(e) => setP({ ...p, frequency: e.target.value })}
            >
              {["daily", "weekly", "monthly"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Current shopping context
            <select
              value={p.context}
              onChange={(e) => setP({ ...p, context: e.target.value })}
            >
              {["regular", "breakfast", "family", "essentials"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Dietary preferences</legend>
          <div className="check-options">
            {["vegetarian", "vegan"].map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={p.dietary.includes(v)}
                  onChange={() => toggle("dietary", v)}
                />
                {v}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Declared allergens to exclude</legend>
          <div className="check-options">
            {[
              "milk",
              "wheat",
              "peanut",
              "egg",
              "fish",
              "soy",
              "tree nut",
              "shellfish",
              "sesame",
            ].map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={p.allergies.includes(v)}
                  onChange={() => toggle("allergies", v)}
                />
                {v}
              </label>
            ))}
          </div>
          <p className="small muted">
            Sample metadata is not a substitute for checking the manufacturer’s
            label.
          </p>
        </fieldset>
        <fieldset>
          <legend>Favorite categories</legend>
          <div className="check-options">
            {[
              "Fruits",
              "Vegetables",
              "Dairy",
              "Bakery",
              "Beverages",
              "Snacks",
              "Grains",
              "Pulses",
              "Meat",
              "Household essentials",
              "Personal care",
            ].map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={p.preferred_categories.includes(v)}
                  onChange={() => toggle("preferred_categories", v)}
                />
                {v}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Preferred brands</legend>
          <div className="check-options">
            {["Everyday", "Harvest Select"].map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={p.preferred_brands.includes(v)}
                  onChange={() => toggle("preferred_brands", v)}
                />
                {v}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save my preferences"}
          <Check size={16} />
        </button>
      </form>
    </>
  );
}
