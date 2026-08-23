import React from 'react'
import { AlertCircle, CircleCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

type Patient = {
  patient_id: number
  users: { first_name: string; last_name: string }
}

type CreateBillingProps = {
  patients: Patient[]
  newBilling: { patientId: string; totalPrice: string }
  billingFeedback: { ok: boolean; msg: string } | null
  setNewBilling: React.Dispatch<React.SetStateAction<any>>
  handleCreateBilling: (e: React.FormEvent<HTMLFormElement>) => void
}

export default function CreateBillingSection({
  patients,
  newBilling,
  billingFeedback,
  setNewBilling,
  handleCreateBilling,
}: CreateBillingProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Billing</CardTitle>
        <CardDescription>Open a new invoice for a patient</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateBilling} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="cb-patient" className="text-sm font-medium">
              Patient
            </label>
            <Select
              value={newBilling.patientId}
              onValueChange={(v) =>
                setNewBilling((b: any) => ({ ...b, patientId: v }))
              }
            >
              <SelectTrigger id="cb-patient" className="w-full">
                <SelectValue placeholder="-- Select Patient --" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.patient_id} value={String(p.patient_id)}>
                    {p.users.first_name} {p.users.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="cb-amount" className="text-sm font-medium">
              Total Price
            </label>
            <Input
              id="cb-amount"
              name="amount"
              type="number"
              value={newBilling.totalPrice}
              onChange={(e) =>
                setNewBilling((b: any) => ({ ...b, totalPrice: e.target.value }))
              }
              required
              className="w-full tabular-nums"
            />
          </div>

          <Button type="submit" className="w-full">
            Create Billing
          </Button>
        </form>

        {billingFeedback && (
          <p
            role="status"
            className={`mt-4 flex items-center gap-1.5 text-sm ${
              billingFeedback.ok ? 'text-success' : 'text-destructive'
            }`}
          >
            {billingFeedback.ok ? (
              <CircleCheck className="size-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="size-4 shrink-0" aria-hidden />
            )}
            {billingFeedback.msg}
          </p>
        )}
      </CardContent>
    </Card>
  )
}