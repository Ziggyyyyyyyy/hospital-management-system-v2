import React from 'react'
import { CreditCard } from 'lucide-react'

import { billingColumns } from './billing-table-col'
import { DataTable } from '@/components/ui/data-table'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

type BillingTableProps = {
  invoices: any[]
}

export default function BillingTableSection({ invoices }: BillingTableProps) {
  return (
    <Card id="billing" className="scroll-mt-32">
      <CardHeader>
        <CardTitle>Patient Invoices</CardTitle>
        <CardDescription>
          All bills with sortable columns and live status
        </CardDescription>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <EmptyState
            icon={<CreditCard />}
            title="No invoices yet"
            description="Invoices you create will appear here."
          />
        ) : (
          <DataTable columns={billingColumns} data={invoices} />
        )}
      </CardContent>
    </Card>
  )
}