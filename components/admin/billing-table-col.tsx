'use client'

import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type Invoice = {
  bill_id: number
  patient_name: string
  total_price: number
  status: string
}

/** Semantic status styling driven by the design-token status language. */
function statusBadgeClass(status: string) {
  switch (status) {
    case 'Paid':
      return 'bg-success-surface text-success border-transparent'
    case 'Pending':
      return 'bg-warning-surface text-warning border-transparent'
    default:
      // Cancelled / unknown
      return 'bg-neutral-surface text-neutral-foreground border-transparent'
  }
}

export const billingColumns: ColumnDef<Invoice>[] = [
  {
    accessorKey: 'bill_id',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Invoice
        <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {`INV-${row.original.bill_id.toString().padStart(3, '0')}`}
      </span>
    ),
    enableSorting: true,
  },
  {
    accessorKey: 'patient_name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Patient
        <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden />
      </Button>
    ),
    cell: ({ row }) => row.original.patient_name,
    enableSorting: true,
  },
  {
    accessorKey: 'total_price',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Amount
        <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">
        ${row.original.total_price?.toFixed(2) ?? '0.00'}
      </span>
    ),
    enableSorting: true,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Status
        <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden />
      </Button>
    ),
    cell: ({ row }) => {
      const status = row.original.status
      return (
        <Badge variant="outline" className={statusBadgeClass(status)}>
          {status}
        </Badge>
      )
    },
    enableSorting: true,
  },
]