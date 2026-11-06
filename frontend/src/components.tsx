import {
  Plus,
  Minus,
  Trash2,
  Lock,
  Unlock,
  ShoppingBasket,
} from "lucide-react";
import { Product, Item } from "./types";
import { money } from "./api";
export function ProductCard({
  p,
  onAdd,
  onDetail,
  reason,
  busy = false,
}: {
  p: Product;
  onAdd: (p: Product) => void;
  onDetail: (p: Product) => void;
  reason?: string;
  busy?: boolean;
}) {
  return (
    <article className="product-card">
      <button
        className="product-picture"
        onClick={() => onDetail(p)}
        aria-label={`View ${p.name}`}
      >
        <img src={p.image_url} alt={p.category} />
        <span className="discount">
          {Math.round(((p.original_price - p.price) / p.original_price) * 100)}%
          OFF
        </span>
      </button>
      <div className="product-content">
        <div className="eyebrow">
          {p.brand}
          <span>★ {(p.rating / 10).toFixed(1)}</span>
        </div>
        <button className="product-name" onClick={() => onDetail(p)}>
          {p.kind}
        </button>
        <p className="muted small">
          {p.unit} · {p.stock > 0 ? "In stock" : "Out of stock"}
        </p>
        {reason && <p className="reason">{reason}</p>}
        <div className="product-bottom">
          <div>
            <strong>{money(p.price)}</strong>{" "}
            <del>{money(p.original_price)}</del>
          </div>
          <button
            className="add-button"
            disabled={!p.stock || busy}
            onClick={() => onAdd(p)}
            aria-label={`Add ${p.name}`}
          >
            <Plus size={17} /> Add
          </button>
        </div>
      </div>
    </article>
  );
}
export function BasketRow({
  item,
  onChange,
  onRemove,
  busy = false,
}: {
  item: Item;
  onChange: (item: Item, patch: Partial<Item>) => void;
  onRemove: (item: Item) => void;
  busy?: boolean;
}) {
  const p = item.product;
  return (
    <div className="basket-row">
      <img src={p.image_url} alt="" />
      <div className="basket-description">
        <strong>{p.name}</strong>
        <p className="muted small">
          {p.unit} · {money(p.price)} each
        </p>
        <label className="small">
          Required quantity{" "}
          <input
            aria-label={`Required quantity ${p.name}`}
            type="number"
            min="0"
            max={item.quantity}
            value={item.minimum}
            disabled={busy}
            onChange={(e) =>
              onChange(item, { minimum: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <div className="quantity">
        <button
          aria-label={`Decrease ${p.name}`}
          disabled={busy || item.quantity <= Math.max(1, item.minimum)}
          onClick={() => onChange(item, { quantity: item.quantity - 1 })}
        >
          <Minus size={14} />
        </button>
        <span>{item.quantity}</span>
        <button
          aria-label={`Increase ${p.name}`}
          disabled={busy || item.quantity >= p.stock || item.quantity >= 99}
          onClick={() => onChange(item, { quantity: item.quantity + 1 })}
        >
          <Plus size={14} />
        </button>
      </div>
      <strong>{money(p.price * item.quantity)}</strong>
      <button
        className="icon-button"
        aria-label={`${item.locked ? "Unlock" : "Lock"} ${p.name}`}
        disabled={busy}
        onClick={() => onChange(item, { locked: !item.locked })}
      >
        {item.locked ? <Lock size={17} /> : <Unlock size={17} />}
      </button>
      <button
        className="icon-button danger"
        aria-label={`Remove ${p.name}`}
        disabled={busy}
        onClick={() => onRemove(item)}
      >
        <Trash2 size={17} />
      </button>
    </div>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <ShoppingBasket size={34} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function Stat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={`stat ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
