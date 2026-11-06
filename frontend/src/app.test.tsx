import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProductCard, BasketRow } from "./components";
import { Catalog, SettingsPage, Auth } from "./pages";
import { Optimization } from "./Optimization";
import { Product, User, Result } from "./types";
import { money } from "./api";
const p: Product = {
  id: 1,
  name: "Everyday Apple",
  kind: "Apple",
  brand: "Everyday",
  category: "Fruits",
  price: 16000,
  original_price: 16500,
  stock: 10,
  unit: "1 kg",
  rating: 45,
  tags: ["vegan"],
  allergens: [],
  nutrition: { source: null },
  image_url: "/products/fruits.svg",
};
const user: User = {
  id: 1,
  name: "Maya",
  email: "maya@example.com",
  revision: 1,
  preferences: {
    budget: 150000,
    monthly_budget: 600000,
    household_size: 2,
    dietary: [],
    allergies: [],
    preferred_brands: [],
    preferred_categories: [],
    frequency: "weekly",
    context: "regular",
  },
};
describe("shopping interactions", () => {
  it("formats paise precisely", () => {
    expect(money(15025)).toBe("₹150.25");
    expect(money(150000)).toBe("₹1,500");
  });
  it("adds an available product and shows its explanation", () => {
    const add = vi.fn();
    render(
      <ProductCard
        p={p}
        onAdd={add}
        onDetail={vi.fn()}
        reason="Fits your remaining budget"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Everyday Apple" }));
    expect(add).toHaveBeenCalledWith(p);
    expect(screen.getByText("Fits your remaining budget")).toBeVisible();
  });
  it("prevents out-of-stock additions", () => {
    render(
      <ProductCard p={{ ...p, stock: 0 }} onAdd={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Add Everyday Apple" }),
    ).toBeDisabled();
  });
  it("changes basket quantities and locks explicitly", () => {
    const change = vi.fn(),
      remove = vi.fn(),
      item = { id: 1, product: p, quantity: 2, minimum: 1, locked: false };
    render(<BasketRow item={item} onChange={change} onRemove={remove} />);
    fireEvent.click(screen.getByLabelText("Increase Everyday Apple"));
    expect(change).toHaveBeenCalledWith(item, { quantity: 3 });
    fireEvent.click(screen.getByLabelText("Lock Everyday Apple"));
    expect(change).toHaveBeenCalledWith(item, { locked: true });
    fireEvent.click(screen.getByLabelText("Remove Everyday Apple"));
    expect(remove).toHaveBeenCalledWith(item);
  });
  it("filters the real catalog input", () => {
    render(
      <MemoryRouter>
        <Catalog
          products={[
            p,
            { ...p, id: 2, name: "Everyday Milk", category: "Dairy" },
          ]}
          cards={(items) => <p>{items.map((x) => x.name).join(", ")}</p>}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Search products"), {
      target: { value: "Milk" },
    });
    expect(screen.getByText("Everyday Milk")).toBeVisible();
    expect(screen.queryByText("Everyday Apple")).not.toBeInTheDocument();
  });
  it("saves currency conversion and declared allergens", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<SettingsPage user={user} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Session budget (₹)"), {
      target: { value: "1200.50" },
    });
    fireEvent.click(screen.getByLabelText("milk"));
    fireEvent.click(screen.getByText("Save my preferences"));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ budget: 120050, allergies: ["milk"] }),
    );
  });
  it("requires valid authentication inputs", () => {
    render(
      <MemoryRouter>
        <Auth message="" onMessage={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Email address")).toBeRequired();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "minLength",
      "10",
    );
  });
  it("requires explicit acceptance and disables stale suggestions", () => {
    const decide = vi.fn();
    const result: Result = {
      id: "one",
      revision: 1,
      status: "pending",
      feasible: true,
      items: [],
      conflicts: [],
      solver: "scipy-milp",
      original_total: 20000,
      optimized_total: 15000,
      savings: 5000,
      optimization_score: 0.5,
      explanations: ["Switch to save ₹50"],
      recommendations: [],
      nutrition: { message: "Unknown nutrition" },
      agents: [],
      errors: [],
      mode: "Balanced",
    };
    const view = render(
      <Optimization
        result={result}
        stale={false}
        states={[]}
        mode="Balanced"
        setMode={vi.fn()}
        run={vi.fn()}
        decide={decide}
        busy={false}
      />,
    );
    expect(decide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Apply optimization"));
    expect(decide).toHaveBeenCalledWith(true, undefined);
    view.rerender(
      <Optimization
        result={result}
        stale
        states={[]}
        mode="Balanced"
        setMode={vi.fn()}
        run={vi.fn()}
        decide={decide}
        busy={false}
      />,
    );
    expect(screen.getByText("Apply optimization")).toBeDisabled();
  });
});

describe("individual changes", () => {
  it("keeps a rejected line out of the acceptance request", () => {
    const decide = vi.fn();
    const result: Result = {
      id: "partial",
      revision: 1,
      status: "pending",
      feasible: true,
      items: [{ product: p, quantity: 1, minimum: 0, locked: false }],
      original_items: [
        {
          id: 10,
          product: { ...p, id: 2, name: "Harvest Select Apple" },
          quantity: 1,
          minimum: 0,
          locked: false,
        },
      ],
      decisions: [
        {
          item_id: 10,
          original_product_id: 2,
          product: p,
          quantity: 1,
          minimum: 0,
          locked: false,
        },
      ],
      conflicts: [],
      solver: "scipy-milp",
      original_total: 17500,
      optimized_total: 16000,
      savings: 1500,
      optimization_score: 0.5,
      explanations: [],
      recommendations: [],
      nutrition: {},
      agents: [],
      errors: [],
      mode: "Balanced",
    };
    render(
      <Optimization
        result={result}
        stale={false}
        states={[]}
        mode="Balanced"
        setMode={vi.fn()}
        run={vi.fn()}
        decide={decide}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Apply optimization"));
    expect(decide).toHaveBeenCalledWith(true, []);
  });
});
