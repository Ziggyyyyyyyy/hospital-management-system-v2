'use client'

import React, { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Pill } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

const MedicineStockTable: React.FC = () => {
  const [medicineStock, setMedicineStock] = useState<any[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/medicine')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch stock')
        return res.json()
      })
      .then((data) => {
        setMedicineStock(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to fetch medicine stock')
        setLoading(false)
      })
  }, [])

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-destructive text-sm">
          {error}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" />
          Pharmacy Stock Overview
        </CardTitle>
        <CardDescription className="text-xs">
          Live medication availability and stock levels
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto max-h-[320px]">
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Medicine Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Stock Level</TableHead>
                <TableHead className="text-right pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicineStock.length > 0 ? (
                medicineStock.slice(0, 8).map((medicine, i) => {
                  let badge = (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
                      Available
                    </Badge>
                  )

                  if (medicine.quantity === 0) {
                    badge = (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                        Out of Stock
                      </Badge>
                    )
                  } else if (medicine.quantity <= medicine.min_stock_level) {
                    badge = (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs">
                        Low Stock
                      </Badge>
                    )
                  }

                  return (
                    <TableRow key={medicine.medicine_id || i} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium text-foreground text-sm">{medicine.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{medicine.category || 'General'}</TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        <span className="font-semibold">{medicine.quantity}</span> {medicine.unit || 'units'}
                      </TableCell>
                      <TableCell className="text-right pr-6">{badge}</TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                    No medicine inventory records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export default MedicineStockTable
