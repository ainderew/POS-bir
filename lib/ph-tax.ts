import type { CartItem, Product, UnitType } from "./types"

export interface TaxBreakdown {
  grossSales: number
  vatableSales: number
  vatAmount: number
  vatExemptSales: number
  zeroRatedSales: number
  totalDiscount: number
  netSales: number
}

/**
 * Philippine BIR Tax Constants & Logic
 */
export const VAT_RATE = 0.12

/**
 * Back-computes VAT from a gross price.
 * Formula: Net = Gross / (1 + VAT_RATE)
 */
export function getNetOfVAT(gross: number): number {
  return gross / (1 + VAT_RATE)
}

/**
 * Calculates the VAT amount from a gross price.
 */
export function getVATAmount(gross: number): number {
  return gross - getNetOfVAT(gross)
}

/**
 * Calculates the Senior Citizen / PWD Discount for an item.
 * Logic: 
 * 1. If VATABLE: Remove 12% VAT first, then apply 20% discount on the net share.
 * 2. If already EXEMPT: Just apply 20% discount on the share.
 * 3. Group Splitting: Discount applies only to the senior's portion (Share).
 */
export function calculateSCPWDDiscount(
  item: CartItem,
  paxCount: number,
  seniorCount: number
): number {
  const { product, quantity } = item
  const grossTotal = product.selling_price * quantity
  
  // 1. Get the Net Amount (Remove VAT if applicable)
  let netAmount = grossTotal
  if (product.tax_category === 'VATABLE') {
    netAmount = getNetOfVAT(grossTotal)
  }

  // 2. Calculate the Senior Share
  const seniorShare = (netAmount / paxCount) * seniorCount

  // 3. Apply 20% Discount on the share
  return seniorShare * 0.20
}

/**
 * Computes the full BIR-compliant tax breakdown for a transaction.
 */
export function calculateTransactionTotals(
  items: CartItem[],
  paxCount: number = 1,
  seniorCount: number = 0
): TaxBreakdown {
  let vatableSales = 0
  let vatAmount = 0
  let vatExemptSales = 0
  let zeroRatedSales = 0
  let grossSales = 0
  let totalDiscount = 0

  items.forEach((item) => {
    const itemGross = item.product.selling_price * item.quantity
    grossSales += itemGross

    // Senior Share logic: The portion of the item that is VAT EXEMPT
    const itemNet = item.product.tax_category === 'VATABLE' ? getNetOfVAT(itemGross) : itemGross
    const seniorPortionNet = (itemNet / paxCount) * seniorCount
    const nonSeniorPortionNet = itemNet - seniorPortionNet

    if (item.product.tax_category === 'VATABLE') {
      // Non-senior portion remains vatable
      vatableSales += nonSeniorPortionNet
      vatAmount += nonSeniorPortionNet * VAT_RATE
      // Senior portion becomes VAT exempt
      vatExemptSales += seniorPortionNet
    } else if (item.product.tax_category === 'VAT_EXEMPT') {
      vatExemptSales += itemGross
    } else if (item.product.tax_category === 'ZERO_RATED') {
      zeroRatedSales += itemGross
    }

    // Apply the 20% SC/PWD discount if applicable
    if (seniorCount > 0) {
      totalDiscount += seniorPortionNet * 0.20
    }

    // Add individual product discounts (if any - to be expanded)
    if (item.product.is_promo && item.product.promo_price) {
        // Simple logic: if promo is better than SC discount, we'd need to compare.
        // For now, we focus on the mandatory SC/PWD logic.
    }
  });

  const netSales = (vatableSales + vatAmount + vatExemptSales + zeroRatedSales) - totalDiscount

  return {
    grossSales,
    vatableSales,
    vatAmount,
    vatExemptSales,
    zeroRatedSales,
    totalDiscount,
    netSales
  }
}
