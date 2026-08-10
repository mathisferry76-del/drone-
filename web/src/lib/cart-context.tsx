"use client";

import * as React from "react";
import { products, type Product } from "@/lib/products";

export interface CartItem {
  slug: string;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (slug: string, quantity?: number) => void;
  removeItem: (slug: string) => void;
  setQuantity: (slug: string, quantity: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  lines: { product: Product; quantity: number; lineTotal: number }[];
  isLoaded: boolean;
}

const CartContext = React.createContext<CartContextValue | null>(null);
const STORAGE_KEY = "skyforge-cart-v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    // Reads from localStorage, which is unavailable during render (SSR) —
    // this hydration-time load must happen in an effect.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // ignore corrupted storage
    } finally {
      setIsLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, isLoaded]);

  const addItem = React.useCallback((slug: string, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.slug === slug);
      if (existing) {
        return prev.map((i) =>
          i.slug === slug ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { slug, quantity }];
    });
  }, []);

  const removeItem = React.useCallback((slug: string) => {
    setItems((prev) => prev.filter((i) => i.slug !== slug));
  }, []);

  const setQuantity = React.useCallback((slug: string, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((i) => i.slug !== slug);
      return prev.map((i) => (i.slug === slug ? { ...i, quantity } : i));
    });
  }, []);

  const clear = React.useCallback(() => setItems([]), []);

  const lines = React.useMemo(
    () =>
      items
        .map((item) => {
          const product = products.find((p) => p.slug === item.slug);
          if (!product) return null;
          return {
            product,
            quantity: item.quantity,
            lineTotal: product.price * item.quantity,
          };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null),
    [items]
  );

  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        setQuantity,
        clear,
        count,
        subtotal,
        lines,
        isLoaded,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
