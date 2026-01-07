"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import type { Product, Category } from "@/lib/types"
import JsBarcode from "jsbarcode"
import { Loader2, BarcodeIcon } from "lucide-react"

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  barcode: z.string().optional().nullable(),
  selling_price: z.coerce.number().min(0, "Selling price must be positive"),
  cost_price: z.coerce.number().min(0, "Cost price must be positive"),
  stock_level: z.coerce.number().min(0, "Stock level must be positive"),
  unit_type: z.enum(["QUANTITY", "WEIGHT"]),
  low_stock_threshold: z.coerce.number().min(0, "Threshold must be positive"),
  notify_low_stock: z.boolean(),
  category_id: z.string().optional().nullable(),
  tax_category: z.enum(["VATABLE", "VAT_EXEMPT", "ZERO_RATED"]),
  supplier_type: z.enum(["WHOLESALER", "WET_MARKET", "DIRECT_DELIVERY"]),
})

type ProductFormData = z.infer<typeof productSchema>

interface ProductFormProps {
  product?: Product
  categories: Category[]
  onSuccess: () => void
  onCancel: () => void
}

export function ProductForm({ product, categories, onSuccess, onCancel }: ProductFormProps) {
  const [isGeneratingBarcode, setIsGeneratingBarcode] = useState(false)
  const [barcodeImage, setBarcodeImage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
      defaultValues: product ? {
      ...product,
      category_id: product.category_id || undefined,
    } : {
      unit_type: "QUANTITY",
      tax_category: "VATABLE",
      supplier_type: "WHOLESALER",
      notify_low_stock: false,
      stock_level: 0,
      low_stock_threshold: 0,
    },

  })

  const barcode = watch("barcode")
  const unitType = watch("unit_type")

  useEffect(() => {
    if (barcode) {
      renderBarcode(barcode)
    }
  }, [barcode])

  const generateBarcode = async () => {
    setIsGeneratingBarcode(true)
    try {
      const response = await fetch("/api/barcode/generate", { method: "POST" })
      const data = await response.json()

      if (response.ok) {
        setValue("barcode", data.barcode)
        toast.success("Barcode generated successfully")
      } else {
        toast.error(data.error || "Failed to generate barcode")
      }
    } catch (error) {
      toast.error("Failed to generate barcode")
    } finally {
      setIsGeneratingBarcode(false)
    }
  }

  const renderBarcode = (code: string) => {
    if (!code) return

    const canvas = document.createElement("canvas")
    try {
      JsBarcode(canvas, code, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: true,
      })
      setBarcodeImage(canvas.toDataURL("image/png"))
    } catch (error) {
      console.error("[v0] Error rendering barcode:", error)
    }
  }

  const onSubmit = async (data: ProductFormData) => {
    try {
      const url = product ? `/api/products/${product.id}` : "/api/products"
      const method = product ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success(product ? "Product updated successfully" : "Product created successfully")
        onSuccess()
      } else {
        toast.error(result.error || "Failed to save product")
      }
    } catch (error) {
      toast.error("An error occurred while saving the product")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Product Name</Label>
          <Input id="name" {...register("name")} placeholder="Enter product name" />
          {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="category_id">Category</Label>
            <Select
              onValueChange={(value) => setValue("category_id", value || null)}
              defaultValue={product?.category_id || undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="unit_type">Unit Type</Label>
            <Select
              onValueChange={(value) => setValue("unit_type", value as "QUANTITY" | "WEIGHT")}
              defaultValue={unitType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="QUANTITY">Quantity (pieces)</SelectItem>
                <SelectItem value="WEIGHT">Weight (kg)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="tax_category">Tax Category</Label>
            <Select
              onValueChange={(value) => setValue("tax_category", value as "VATABLE" | "VAT_EXEMPT" | "ZERO_RATED")}
              defaultValue={watch("tax_category")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VATABLE">Vatable</SelectItem>
                <SelectItem value="VAT_EXEMPT">VAT Exempt</SelectItem>
                <SelectItem value="ZERO_RATED">Zero Rated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="supplier_type">Supplier Type</Label>
            <Select
              onValueChange={(value) => setValue("supplier_type", value as "WHOLESALER" | "WET_MARKET" | "DIRECT_DELIVERY")}
              defaultValue={watch("supplier_type")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WHOLESALER">Wholesaler</SelectItem>
                <SelectItem value="WET_MARKET">Wet Market</SelectItem>
                <SelectItem value="DIRECT_DELIVERY">Direct Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cost_price">Cost Price ($)</Label>
            <Input id="cost_price" type="number" step="0.01" {...register("cost_price")} placeholder="0.00" />
            {errors.cost_price && <p className="text-sm text-destructive mt-1">{errors.cost_price.message}</p>}
          </div>

          <div>
            <Label htmlFor="selling_price">Selling Price ($)</Label>
            <Input id="selling_price" type="number" step="0.01" {...register("selling_price")} placeholder="0.00" />
            {errors.selling_price && <p className="text-sm text-destructive mt-1">{errors.selling_price.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="stock_level">Stock Level {unitType === "WEIGHT" ? "(kg)" : "(pieces)"}</Label>
            <Input
              id="stock_level"
              type="number"
              step={unitType === "WEIGHT" ? "0.001" : "1"}
              {...register("stock_level")}
              placeholder="0"
            />
            {errors.stock_level && <p className="text-sm text-destructive mt-1">{errors.stock_level.message}</p>}
          </div>

          <div>
            <Label htmlFor="low_stock_threshold">
              Low Stock Threshold {unitType === "WEIGHT" ? "(kg)" : "(pieces)"}
            </Label>
            <Input
              id="low_stock_threshold"
              type="number"
              step={unitType === "WEIGHT" ? "0.001" : "1"}
              {...register("low_stock_threshold")}
              placeholder="0"
            />
            {errors.low_stock_threshold && (
              <p className="text-sm text-destructive mt-1">{errors.low_stock_threshold.message}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="notify_low_stock">Low Stock Notifications</Label>
            <p className="text-sm text-muted-foreground">Get alerted when stock is low</p>
          </div>
          <Switch
            id="notify_low_stock"
            checked={watch("notify_low_stock")}
            onCheckedChange={(checked) => setValue("notify_low_stock", checked)}
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="barcode">Barcode</Label>
          <div className="flex gap-2">
            <Input
              id="barcode"
              {...register("barcode")}
              placeholder="Scan or enter barcode"
            />
            <Button type="button" variant="outline" onClick={generateBarcode} disabled={isGeneratingBarcode}>
              {isGeneratingBarcode ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <BarcodeIcon className="h-4 w-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </div>
          {errors.barcode && <p className="text-sm text-destructive">{errors.barcode.message}</p>}

          {(barcodeImage || barcode) && (
            <div className="border rounded-lg p-4 bg-muted/50 flex justify-center">
              {barcodeImage ? (
                <img src={barcodeImage || "/placeholder.svg"} alt="Product barcode" className="max-w-full h-auto" />
              ) : (
                <p className="text-sm text-muted-foreground">Enter a valid barcode to preview</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : product ? (
            "Update Product"
          ) : (
            "Create Product"
          )}
        </Button>
      </div>
    </form>
  )
}
