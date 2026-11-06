export interface Preferences {
  budget: number;
  monthly_budget: number;
  household_size: number;
  dietary: string[];
  allergies: string[];
  preferred_brands: string[];
  preferred_categories: string[];
  frequency: string;
  context: string;
}
export interface User {
  id: number;
  name: string;
  email: string;
  preferences: Preferences;
  revision: number;
}
export interface Product {
  id: number;
  name: string;
  brand: string;
  category: string;
  kind: string;
  price: number;
  original_price: number;
  unit: string;
  stock: number;
  rating: number;
  tags: string[];
  allergens: string[];
  image_url: string;
  nutrition: Record<string, number | string | null>;
}
export interface Item {
  id?: number;
  product: Product;
  quantity: number;
  minimum: number;
  locked: boolean;
}
export interface Basket {
  items: Item[];
  total: number;
  revision: number;
}
export interface Recommendation {
  product: Product;
  score: number;
  explanation: string;
}
export interface Agent {
  name: string;
  status: string;
  duration_ms?: number;
  detail?: string;
}
export interface Choice {
  item_id: number;
  original_product_id: number;
  product: Product | null;
  quantity: number;
  minimum: number;
  locked: boolean;
}
export interface Result {
  original_items?: Item[];
  decisions?: Choice[];
  id: string;
  revision: number;
  status: string;
  feasible: boolean;
  items: Item[];
  conflicts: string[];
  solver: string;
  original_total: number;
  optimized_total: number;
  savings: number;
  optimization_score: number;
  explanations: string[];
  recommendations: Recommendation[];
  nutrition: { message?: string; conflicts?: string[] };
  agents: Agent[];
  errors: { agent: string; error: string }[];
  mode: string;
}
export interface Order {
  id: number;
  total: number;
  savings: number;
  budget: number;
  items: Item[];
  created_at: string;
}
export interface Analytics {
  total_spending: number;
  average_basket: number;
  savings: number;
  orders: number;
  budget_utilization: number;
  acceptance_rate: number;
  categories: { name: string; value: number }[];
  monthly: { month: string; spending: number; savings: number }[];
  frequent: { name: string; quantity: number }[];
  savings_definition: string;
}
