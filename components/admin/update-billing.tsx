import React from 'react'
import { AlertCircle, CircleCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Invoice = {
  bill_id: number
  patient_name: string
  status: string
}

type UpdateBillingProps = {
  invoices: Invoice[]
  updateBilling: { billId: string; status: string }
  billingUpdateFeedback: { ok: boolean; msg: string } | null
  setUpdateBilling: React.Dispatch<React.SetStateAction<any>>
  handleUpdateBilling: (e: React.FormEvent<HTMLFormElement>) => void
}

export default function UpdateBillingSection({
  invoices,
  updateBilling,
  billingUpdateFeedback,
  setUpdateBilling,
  handleUpdateBilling,
}: UpdateBillingProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Update Billing Status</CardTitle>
        <CardDescription>
          Mark an invoice as pending, paid, or cancelled
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpdateBilling} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="ub-invoice" className="text-sm font-medium">
              Invoice
            </label>
            <Select
              value={updateBilling.billId}
              onValueChange={(v) =>
                setUpdateBilling((b: any) => ({ ...b, billId: v }))
              }
            >
              <SelectTrigger id="ub-invoice" className="w-full">
                <SelectValue placeholder="-- Select Invoice --" />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((i) => (
                  <SelectItem key={i.bill_id} value={String(i.bill_id)}>
                    INV-{i.bill_id.toString().padStart(3, '0')} —{' '}
                    {i.patient_name} ({i.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ub-status" className="text-sm font-medium">
              New Status
            </label>
            <Select
              value={updateBilling.status}
              onValueChange={(v) =>
                setUpdateBilling((b: any) => ({ ...b, status: v }))
              }
            >
              <SelectTrigger id="ub-status" className="w-full">
                <SelectValue placeholder="-- Select Status --" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Canceled">Cancelled(Invalid status)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full">
            Update Status
          </Button>
        </form>

        {billingUpdateFeedback && (
          <p
            role="status"
            className={`mt-4 flex items-center gap-1.5 text-sm ${
              billingUpdateFeedback.ok ? 'text-success' : 'text-destructive'
            }`}
          >
            {billingUpdateFeedback.ok ? (
              <CircleCheck className="size-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="size-4 shrink-0" aria-hidden />
            )}
            {billingUpdateFeedback.msg}
          </p>
        )}
      </CardContent>
    </Card>
  )
}