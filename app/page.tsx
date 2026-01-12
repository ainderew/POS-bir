import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingCart, Package, BarChart3, ShieldCheck, Monitor } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-16 px-4">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-balance mb-4">General Store POS System</h1>
          <p className="text-xl text-muted-foreground">Complete inventory management and point of sale solution</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Link href="/pos">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <ShoppingCart className="h-12 w-12 mb-4 text-primary" />
                <CardTitle>Point of Sale</CardTitle>
                <CardDescription>Process sales transactions with barcode scanning</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Open POS</Button>
              </CardContent>
            </Card>
          </Link>

          <Link href="/register">
             <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-dashed">
               <CardHeader>
                 <Monitor className="h-12 w-12 mb-4 text-muted-foreground" />
                 <CardTitle>Terminal Setup</CardTitle>
                 <CardDescription>Register this device if it's new</CardDescription>
               </CardHeader>
               <CardContent>
                 <Button className="w-full" variant="secondary">Setup Terminal</Button>
               </CardContent>
             </Card>
           </Link>

          <Link href="/inventory">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <Package className="h-12 w-12 mb-4 text-primary" />
                <CardTitle>Inventory</CardTitle>
                <CardDescription>Manage products, stock levels, and low stock alerts</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-transparent" variant="outline">
                  Manage Inventory
                </Button>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <BarChart3 className="h-12 w-12 mb-4 text-primary" />
                <CardTitle>Dashboard</CardTitle>
                <CardDescription>View sales analytics and financial reports</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-transparent" variant="outline">
                  View Dashboard
                </Button>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/settings">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <ShieldCheck className="h-12 w-12 mb-4 text-primary" />
                <CardTitle>Settings</CardTitle>
                <CardDescription>Configure business info and BIR compliance</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-transparent" variant="outline">
                  System Settings
                </Button>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="mt-16 max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>System Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="font-medium">Barcode Support</p>
                  <p className="text-sm text-muted-foreground">Generate and scan barcodes for quick item entry</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="font-medium">Weight & Quantity</p>
                  <p className="text-sm text-muted-foreground">Handle items sold by weight (kg) or quantity (pieces)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="font-medium">Low Stock Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified when products fall below threshold levels
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="font-medium">Profit Tracking</p>
                  <p className="text-sm text-muted-foreground">
                    Monitor revenue and profit margins for each transaction
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
