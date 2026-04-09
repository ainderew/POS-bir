# General Store POS

Package manager: **pnpm**. Check `package.json` for available scripts and dependencies.

## Conventions

### Naming
- **Files/Directories:** kebab-case (`product-form.tsx`)
- **Components:** PascalCase (`export function ProductForm`)
- **Functions/Variables:** camelCase
- **Database columns:** snake_case (`selling_price`, `stock_level`)
- **Constants:** UPPER_SNAKE_CASE

### Imports & Modules
- Use `@/` path alias for all imports
- Use `import type` for TypeScript types
- Mark client-side components with `"use client"`

### Key Utilities
- `cn()` from `@/lib/utils` — Tailwind class merging
- `query<T>`, `queryOne<T>`, `transaction` from `@/lib/db` — SQLite via better-sqlite3 (writes PG-style `$1` params, auto-converted)
- Shared types in `@/lib/types.ts`
- `sonner` for toast notifications
- Server-side logs prefixed with `[v0]`

### UI Rules
- Do not modify `components/ui/` (Shadcn/Radix primitives) — prefer composition
- Use `lucide-react` for icons

## Database Schema

Full schema in `scripts/sqlite_schema.sql`. Core tables:

- **categories**: `id`, `name`, `created_at`, `updated_at`
- **products**: `id`, `name`, `barcode`, `selling_price`, `cost_price`, `stock_level`, `unit_type` ('QUANTITY' | 'WEIGHT'), `low_stock_threshold`, `notify_low_stock`, `category_id`
- **transactions**: `id`, `created_at`, `total_revenue`, `total_profit`, `payment_method`
- **transaction_items**: `id`, `transaction_id`, `product_id`, `quantity_sold`, `price_at_sale`, `cost_at_sale`, `profit`

Use `transaction()` helper for multi-write operations. Always use parameterized queries.
