"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Product } from "@/lib/types"
import { Loader2, Package } from "lucide-react"
import { toast } from "sonner"

interface ProductGridProps {
  categoryId: string | null
  searchTerm: string
  onProductSelect: (product: Product) => void
}

export function ProductGrid({ categoryId, searchTerm, onProductSelect }: ProductGridProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchProducts()
  }, [categoryId, searchTerm])

  const fetchProducts = async () => {
    setIsLoading(true)
    try {
      const url = "/api/products?"
      const params = new URLSearchParams()

      if (categoryId) {
        params.append("category_id", categoryId)
      }
      if (searchTerm) {
        params.append("search", searchTerm)
      }

      const response = await fetch(url + params.toString())
      if (response.ok) {
        const data = await response.json()
        setProducts(data)
      } else {
        toast.error("Failed to load products")
      }
    } catch (error) {
      toast.error("Error loading products")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mb-4" />
        <p>No products found</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((product) => (
        <Card
          key={product.id}
          className="p-4 cursor-pointer border-2 hover:border-primary bg-workspace/50 hover:bg-workspace transition-all"
          onClick={() => onProductSelect(product)}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2 min-h-[40px]">
              <h4 className="font-bold text-sm leading-tight line-clamp-2 uppercase">{product.name}</h4>
              {Number(product.stock_level) <= 0 ? (
                <Badge variant="destructive" className="shrink-0 text-[9px] animate-pulse">
                  NO STOCK
                </Badge>
              ) : Number(product.stock_level) <= Number(product.low_stock_threshold) ? (
                <Badge className="shrink-0 text-[9px] bg-warning text-warning-foreground animate-pulse">
                  LOW
                </Badge>
              ) : null}
            </div>
            <div className="pt-2 border-t border-border/50">
              <p className="text-xl font-black text-primary">₱{Number(product.selling_price).toFixed(2)}</p>
              <p className="text-[10px] font-medium text-muted-foreground mt-1">
                {product.unit_type === "QUANTITY"
                  ? `${Number(product.stock_level)} PCS AVAILABLE`
                  : `${Number(product.stock_level).toFixed(3)} KG AVAILABLE`}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
