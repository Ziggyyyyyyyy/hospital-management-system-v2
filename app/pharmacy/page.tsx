'use client'
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import PharmacyBanner from '@/components/pharmacy/pharmacy-banner'
import MedicineStockGrid from '@/components/pharmacy/medicine-stock-grid'
import LowStockSection from '@/components/pharmacy/low-stock-section'
import OutOfStockSection from '@/components/pharmacy/out-of-stock-section'
import DispenseButton from '@/components/pharmacy/dispense-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Loader2, Package, AlertTriangle, Pill, BarChart3 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
// Add a Medicine interface to define the expected structure
interface Medicine {
  medicine_id: string
  name: string
  category: string
  description: string
  unit: string
  quantity: number
  min_stock_level: number
  supplier: string
  expiry_date: string
  updated_at: string
}

export default function PharmacyLanding() {
  const [lowStockMedicines, setLowStockMedicines] = useState([])
  const [outOfStockMedicines, setOutOfStockMedicines] = useState([])
  const [highStockMedicines, setHighStockMedicines] = useState([])
  const [stockData, setStockData] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalMedicines: 0,
    lowStock: 0,
    outOfStock: 0,
    expiringThisMonth: 0,
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const stockRes = await fetch('/api/medicine')
      if (!stockRes.ok) {
        throw new Error('Failed to fetch stock data')
      }
      const stock = await stockRes.json()
      setStockData(stock)

      const outOfStockData = stock.filter(
        (medicine: { quantity: number }) => medicine.quantity === 0,
      )

      const lowStockData = stock.filter(
        (medicine: { quantity: number; min_stock_level: number }) =>
          medicine.quantity <= medicine.min_stock_level &&
          medicine.quantity > 0,
      )

      const highStockData = stock.filter(
        (medicine: { quantity: number; min_stock_level: number }) =>
          medicine.quantity > medicine.min_stock_level,
      )

      const outOfStockCount = outOfStockData.length

      // Calculate medicines expiring this month
      const today = new Date()
      const nextMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        today.getDate(),
      )
      const expiringCount = stock.filter(
        (medicine: { expiry_date: string }) => {
          const expiryDate = new Date(medicine.expiry_date)
          return expiryDate > today && expiryDate <= nextMonth
        },
      ).length

      setOutOfStockMedicines(outOfStockData)
      setLowStockMedicines(lowStockData)
      setHighStockMedicines(highStockData)

      setStats({
        totalMedicines: stock.length,
        lowStock: lowStockData.length,
        outOfStock: outOfStockCount,
        expiringThisMonth: expiringCount,
      })
    } catch (err: any) {
      toast.error(`Error fetching data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateQuantity = async (
    medicineId: number,
    newQuantity: number,
  ) => {
    try {
      const res = await fetch(`/api/medicine/${medicineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQuantity }),
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Update failed')
      }
      await fetchData()
    } catch (err: any) {
      toast.error(`Error updating quantity: ${err.message}`)
    }
  }

  // Update the restock handler to handle specified quantities
  const handleRestockClick = (medicine: Medicine) => {
    // Check if there's a specified quantity in the medicine object
    const quantity =
      typeof medicine.quantity === 'number' && medicine.quantity > 0
        ? medicine.quantity
        : 1 // Default to adding 1 if no quantity specified

    handleUpdateQuantity(parseInt(medicine.medicine_id), quantity)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PharmacyBanner />

      <main className="space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Formulations
              </CardTitle>
              <Pill className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold font-mono">{stats.totalMedicines}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low Stock Alerts
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {stats.lowStock}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Out of Stock
              </CardTitle>
              <Package className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold font-mono text-destructive">
                  {stats.outOfStock}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Expiring in 30 Days
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-violet-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold font-mono text-violet-600 dark:text-violet-400">
                  {stats.expiringThisMonth}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="in-stock" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <TabsList>
              <TabsTrigger value="in-stock">In Stock</TabsTrigger>
              <TabsTrigger value="low-stock" className="relative">
                Low Stock
                {stats.lowStock > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-full text-[10px] font-semibold">
                    {stats.lowStock}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="out-of-stock" className="relative">
                Out of Stock
                {stats.outOfStock > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-destructive/20 text-destructive rounded-full text-[10px] font-semibold">
                    {stats.outOfStock}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="all">All Inventory</TabsTrigger>
            </TabsList>

            <DispenseButton onDispenseSuccess={fetchData} />
          </div>

          <TabsContent value="in-stock" className="mt-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>In-Stock Medicines</CardTitle>
                <CardDescription>
                  Medicines with adequate stock levels
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
                    <span>Loading medicines...</span>
                  </div>
                ) : (
                  <MedicineStockGrid medicines={highStockMedicines} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="low-stock" className="space-y-4">
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
                <span>Loading low stock items...</span>
              </div>
            ) : (
              <LowStockSection
                medicines={lowStockMedicines}
                handleUpdateQuantity={handleUpdateQuantity}
              />
            )}
          </TabsContent>

          <TabsContent value="out-of-stock" className="space-y-4">
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
                <span>Loading out of stock items...</span>
              </div>
            ) : (
              <OutOfStockSection
                medicines={outOfStockMedicines}
                onRestock={handleRestockClick}
              />
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Medicines</CardTitle>
                <CardDescription>
                  Complete inventory of all medicines
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
                    <span>Loading medicines...</span>
                  </div>
                ) : (
                  <MedicineStockGrid medicines={stockData} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Show urgent sections on main page regardless of tab */}
        {outOfStockMedicines.length > 0 && (
          <div className="pt-2">
            <OutOfStockSection
              medicines={outOfStockMedicines}
              onRestock={handleRestockClick}
            />
          </div>
        )}
      </main>
      <Toaster />
    </div>
  )
}
