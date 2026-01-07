import { NextResponse } from "next/server"
import { query, queryOne } from "@/lib/db"

export async function GET() {
  try {
    // 1. Get store age for "Cold Start" protocol
    const firstSaleRes = await queryOne("SELECT MIN(created_at) as first_sale FROM transactions");
    const firstSaleDate = firstSaleRes?.first_sale ? new Date(firstSaleRes.first_sale) : new Date();
    const daysActive = Math.max(1, Math.ceil((new Date().getTime() - firstSaleDate.getTime()) / (1000 * 60 * 60 * 24)));
    
    // Divisor for ADS (Cold Start Protocol)
    const adsDivisor = Math.min(14, daysActive);
    const safetyMultiplier = daysActive < 7 ? 0.8 : 1.0;

    const sql = `
      WITH VelocityStats AS (
        SELECT 
          product_id,
          SUM(quantity_sold) as total_qty_14d
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE t.status = 'PAID' AND t.created_at >= NOW() - INTERVAL '14 days'
        GROUP BY product_id
      ),
      Ranking AS (
        SELECT 
          p.id,
          p.name,
          p.stock_level,
          p.cost_price,
          p.selling_price,
          p.supplier_type,
          COALESCE(v.total_qty_14d, 0) as vol_14d,
          (COALESCE(v.total_qty_14d, 0) / ${adsDivisor}) * ${safetyMultiplier} as ads
        FROM products p
        LEFT JOIN VelocityStats v ON p.id = v.product_id
      ),
      Classified AS (
        SELECT 
          *,
          PERCENT_RANK() OVER (ORDER BY ads DESC) as rank_velocity
        FROM Ranking
      )
      SELECT 
        *,
        CASE 
          WHEN rank_velocity <= 0.2 AND ads >= 0.5 THEN 'TIER_1'
          WHEN ads > 0 THEN 'TIER_2'
          ELSE 'TIER_3'
        END as priority_tier
      FROM Classified
      ORDER BY ads DESC, selling_price - cost_price DESC
    `;

    const results = await query(sql);

    return NextResponse.json({
      items: results,
      meta: {
        daysActive,
        adsDivisor,
        safetyMultiplier
      }
    });
  } catch (error) {
    console.error("[v0] Market Run Error:", error);
    return NextResponse.json({ error: "Failed to generate plan" }, { status: 500 });
  }
}
