'use client'

import React, { useState } from 'react'
import { ChevronDown, Receipt } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

interface BillingItem {
  item_id: number
  quantity: number
  item_type: string
  unit_price: number
  description: string
  item_id_ref: number
  total_price: number
}

interface Billing {
  bill_id: number
  total_price: number
  status: 'Paid' | 'Pending'
  created_at: string
  updated_at: string
  billing_items: BillingItem[]
}

interface Props {
  appointments: { status: string }[]
  billing: Billing[]
}

/** Semantic status styling driven by the design-token status language. */
function statusBadgeClass(status: string) {
  switch (status) {
    case 'Paid':
      return 'bg-success-surface text-success border-transparent'
    case 'Canceled':
      return 'bg-neutral-surface text-neutral-foreground border-transparent'
    default:
      // Pending
      return 'bg-warning-surface text-warning border-transparent'
  }
}

export default function BillingSummaryTable({ billing }: Props) {
  const [expandedRows, setExpandedRows] = useState<number[]>([])

  const toggleRow = (billId: number) => {
    setExpandedRows((prev) =>
      prev.includes(billId)
        ? prev.filter((id) => id !== billId)
        : [...prev, billId],
    )
  }

  // Format date function
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-muted-foreground" aria-hidden />
          Billing Summary
        </CardTitle>
        <CardDescription>
          Track your financial activity — click a row to see its items
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        {billing.length === 0 ? (
          <div className="px-6 pb-2">
            <EmptyState
              icon={<Receipt />}
              title="No invoices yet"
              description="Invoices generated for your visits will appear here."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>#</TableHead>
                <TableHead>Bill ID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Updated At</TableHead>
                <TableHead className="w-8" aria-label="Expand row" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {billing.map(
                (
                  {
                    bill_id,
                    total_price,
                    status,
                    created_at,
                    updated_at,
                    billing_items,
                  },
                  index,
                ) => {
                  const isExpanded = expandedRows.includes(bill_id)
                  return (
                    <React.Fragment key={bill_id}>
                      <TableRow
                        className={`cursor-pointer text-sm transition-colors hover:bg-muted/40 ${
                          isExpanded ? 'bg-muted/30' : ''
                        }`}
                        onClick={() => toggleRow(bill_id)}
                        aria-expanded={isExpanded}
                      >
                        <TableCell className="tabular-nums text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          BILL-{bill_id}
                        </TableCell>
                        <TableCell className="tabular-nums font-medium">
                          ฿{total_price.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(status)}
                          >
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(created_at)}</TableCell>
                        <TableCell>{formatDate(updated_at)}</TableCell>
                        <TableCell>
                          <ChevronDown
                            aria-hidden
                            className={`size-4 text-muted-foreground transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${bill_id}-details`} className="hover:bg-transparent">
                          <TableCell colSpan={7} className="bg-muted/20">
                            <div className="p-4">
                              <h4 className="mb-2 font-medium">Billing Items</h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead>Unit Price</TableHead>
                                    <TableHead>Total Price</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {billing_items.map((item, itemIndex) => (
                                    <TableRow key={item.item_id}>
                                      <TableCell className="tabular-nums text-muted-foreground">
                                        {itemIndex + 1}
                                      </TableCell>
                                      <TableCell>{item.description}</TableCell>
                                      <TableCell className="tabular-nums">
                                        {item.quantity}
                                      </TableCell>
                                      <TableCell className="tabular-nums">
                                        ฿{item.unit_price.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="tabular-nums font-medium">
                                        ฿{item.total_price.toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                },
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}