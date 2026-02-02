"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProductForm } from "@/components/inventory/product-form"
import { InventoryTable } from "@/components/inventory/inventory-table"
import { Plus, Search, Package, AlertTriangle, ArrowLeft, Download, Upload } from "lucide-react"
import Link from "next/link"
import type { Product, Category } from "@/lib/types"
import { toast } from "sonner"

import { QuickRestockModal } from "@/components/inventory/quick-restock-modal"
import { useInventoryStore } from "@/stores/use-inventory-store"

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  // Remove local modal state in favor of store
  // const [isDialogOpen, setIsDialogOpen] = useState(false)
  // const [editingProduct, setEditingProduct] = useState<Product | undefined>()
  
  const { 
      isAddModalOpen, 
      setAddModalOpen, 
      activeProduct, 
      setActiveProduct,
      setScannedBarcode
  } = useInventoryStore()

  const [activeTab, setActiveTab] = useState("all")
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProducts()
    fetchCategories()
  }, [])

  const fetchProducts = async (search?: string, lowStock?: boolean) => {
    try {
      const params = new URLSearchParams()
      if (search) params.append("search", search)
      if (lowStock) params.append("lowStock", "true")

      const response = await fetch(`/api/products?${params.toString()}`)
      const data = await response.json()
      setProducts(data)
    } catch (error) {
      toast.error("Failed to fetch products")
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories")
      const data = await response.json()
      setCategories(data)
    } catch (error) {
      toast.error("Failed to fetch categories")
    }
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    fetchProducts(value, activeTab === "low-stock")
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    fetchProducts(searchTerm, tab === "low-stock")
  }

  const handleAddProduct = () => {
    setActiveProduct(null)
    setScannedBarcode(null)
    setAddModalOpen(true)
  }

  const handleEditProduct = (product: Product) => {
    setActiveProduct(product)
    setAddModalOpen(true)
  }

  const handleFormSuccess = () => {
    setAddModalOpen(false)
    fetchProducts(searchTerm, activeTab === "low-stock")
  }

  const handleCategoryCreated = (newCategory: Category) => {
    setCategories(prev => [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name)))
  }

  const handleDeleteProduct = () => {
    fetchProducts(searchTerm, activeTab === "low-stock")
  }

  const handleExportCsv = async () => {
    try {
      const res = await fetch("/api/products/export")
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `products_${new Date().toISOString().split("T")[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Products exported successfully")
    } catch {
      toast.error("Failed to export products")
    }
  }

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/products/import", { method: "POST", body: formData })
      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || "Import failed")
        return
      }

      const parts = []
      if (result.created > 0) parts.push(`${result.created} created`)
      if (result.updated > 0) parts.push(`${result.updated} updated`)
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
      toast.success(`Import complete: ${parts.join(", ")}`)

      if (result.errors?.length > 0) {
        toast.warning(`${result.errors.length} row(s) had errors`)
      }

      fetchProducts(searchTerm, activeTab === "low-stock")
      fetchCategories()
    } catch {
      toast.error("Failed to import products")
    }

    // Reset file input so the same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const noStockCount = products.filter((p) => Number(p.stock_level) <= 0).length
  const lowStockCount = products.filter((p) => Number(p.stock_level) > 0 && p.is_low_stock).length

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-4xl font-bold text-balance">Inventory Management</h1>
              <p className="text-muted-foreground mt-2">Manage your store products and stock levels</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportCsv}
            />
            <Button onClick={handleAddProduct} size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Add Product
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{products.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">No Stock</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{noStockCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{lowStockCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Categories</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{categories.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <CardDescription>View and manage all inventory items</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or barcode..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList>
                <TabsTrigger value="all">All Products</TabsTrigger>
                <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-4">
                <InventoryTable products={products} onEdit={handleEditProduct} onDelete={handleDeleteProduct} />
              </TabsContent>
              <TabsContent value="low-stock" className="mt-4">
                <InventoryTable products={products} onEdit={handleEditProduct} onDelete={handleDeleteProduct} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isAddModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
            <DialogDescription>
              {activeProduct
                ? "Update product details and stock information"
                : "Enter product details to add to inventory"}
            </DialogDescription>
          </DialogHeader>
          <ProductForm
            product={activeProduct || undefined}
            categories={categories}
            onSuccess={handleFormSuccess}
            onCancel={() => setAddModalOpen(false)}
            onCategoryCreated={handleCategoryCreated}
          />
        </DialogContent>
      </Dialog>
      
      <QuickRestockModal onSuccess={() => fetchProducts(searchTerm, activeTab === "low-stock")} />
    </div>
  )
}
