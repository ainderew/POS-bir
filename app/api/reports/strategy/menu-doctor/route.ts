import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET() {
  try {
    const days = 30;
    
    const sql = `
      WITH ItemStats AS (
        SELECT 
          p.id,
          p.name,
          p.supplier_type,
          COALESCE(SUM(ti.quantity_sold), 0) as total_qty,
          COALESCE(SUM(ti.price_at_sale * ti.quantity_sold), 0) as total_revenue,
          COALESCE(SUM(ti.profit), 0) as total_profit,
          CASE 
            WHEN SUM(ti.quantity_sold) > 0 
            THEN SUM(ti.profit) / SUM(ti.quantity_sold) 
            ELSE 0 
          END as avg_unit_profit,
          p.stock_level,
          p.cost_price
        FROM products p
        LEFT JOIN transaction_items ti ON p.id = ti.product_id
        LEFT JOIN transactions t ON ti.transaction_id = t.id AND t.status = 'PAID' AND t.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY p.id, p.name, p.supplier_type, p.stock_level, p.cost_price
      ),
      StoreStats AS (
        SELECT 
          SUM(total_profit) / NULLIF(SUM(total_qty), 0) as store_avg_profit,
          (SUM(total_qty) / COUNT(DISTINCT id)) * 0.7 as popularity_benchmark
        FROM ItemStats
      )
      SELECT 
        i.*,
        s.store_avg_profit,
        s.popularity_benchmark,
        CASE 
          WHEN i.total_qty >= s.popularity_benchmark AND i.avg_unit_profit >= s.store_avg_profit THEN 'STAR'
          WHEN i.total_qty >= s.popularity_benchmark AND i.avg_unit_profit < s.store_avg_profit THEN 'PLOWHORSE'
          WHEN i.total_qty < s.popularity_benchmark AND i.avg_unit_profit >= s.store_avg_profit THEN 'PUZZLE'
          ELSE 'DOG'
        END as classification
      FROM ItemStats i, StoreStats s
      ORDER BY i.total_profit DESC
    `;

    const results = await query(sql);

    // Calculate "Frozen Cash" from Dogs
    const frozenCash = results
      .filter((r: any) => r.classification === 'DOG')
      .reduce((sum: number, r: any) => sum + (parseFloat(r.stock_level) * parseFloat(r.cost_price)), 0);

    return NextResponse.json({
      items: results,
      frozenCash,
      benchmarks: {
        profit: results[0]?.store_avg_profit || 0,
        popularity: results[0]?.popularity_benchmark || 0
      }
    });
  } catch (error) {
    console.error("[v0] Menu Doctor Error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
