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
import { EmptyState } from '@/components/ui/empty-state'

type Nurse = {
  staff_id: number
  users: { first_name: string; last_name: string }
}
type Admission = {
  admission_id: number
  room_id: number
  nurse_id: number
}

type AssignNurseProps = {
  nurses: Nurse[]
  admissions: Admission[]
  selectedAdm: Admission | null
  isAssigning: boolean
  feedback: { ok: boolean; msg: string } | null
  handleAssign: (e: React.FormEvent<HTMLFormElement>) => void
  handleAdmissionChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
}

export default function AssignNurseSection({
  nurses,
  admissions,
  selectedAdm,
  isAssigning,
  feedback,
  handleAssign,
  handleAdmissionChange,
}: AssignNurseProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign Nurse</CardTitle>
        <CardDescription>
          Pair an active admission with an available nurse
        </CardDescription>
      </CardHeader>
      <CardContent>
        {admissions.length === 0 || nurses.length === 0 ? (
          <EmptyState
            icon={<AlertCircle />}
            title="Nothing to assign yet"
            description={
              admissions.length === 0
                ? 'There are no active admissions. Admit a patient first.'
                : 'No nurses are registered yet.'
            }
          />
        ) : (
          <form onSubmit={handleAssign} className="space-y-4">
            {/* Admission dropdown */}
            <div className="space-y-2">
              <label htmlFor="assign-admission" className="text-sm font-medium">
                Admission
              </label>
              <Select
                value={
                  selectedAdm?.admission_id
                    ? String(selectedAdm.admission_id)
                    : ''
                }
                onValueChange={(v) =>
                  handleAdmissionChange({
                    target: { value: v },
                  } as any)
                }
              >
                <SelectTrigger id="assign-admission" className="w-full">
                  <SelectValue placeholder="-- Select Admission --" />
                </SelectTrigger>
                <SelectContent>
                  {admissions.map((a) => (
                    <SelectItem
                      key={a.admission_id}
                      value={String(a.admission_id)}
                    >
                      #{a.admission_id} — Room {a.room_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nurse dropdown */}
            <div className="space-y-2">
              <label htmlFor="assign-nurse" className="text-sm font-medium">
                Nurse
              </label>
              <Select name="nurseId">
                <SelectTrigger id="assign-nurse" className="w-full">
                  <SelectValue placeholder="-- Select Nurse --" />
                </SelectTrigger>
                <SelectContent>
                  {nurses.map((n) => (
                    <SelectItem key={n.staff_id} value={String(n.staff_id)}>
                      {n.users.first_name} {n.users.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Room display */}
            <div className="space-y-2">
              <label htmlFor="assign-room" className="text-sm font-medium">
                Room
              </label>
              <Input
                id="assign-room"
                readOnly
                value={selectedAdm ? `Room #${selectedAdm.room_id}` : ''}
                placeholder="Choose admission first"
                className="w-full bg-muted text-muted-foreground"
              />
            </div>

            <Button type="submit" disabled={!selectedAdm || isAssigning} className="w-full">
              {isAssigning ? 'Assigning…' : 'Assign'}
            </Button>
          </form>
        )}

        {feedback && (
          <p
            role="status"
            className={`mt-4 flex items-center gap-1.5 text-sm ${
              feedback.ok ? 'text-success' : 'text-destructive'
            }`}
          >
            {feedback.ok ? (
              <CircleCheck className="size-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="size-4 shrink-0" aria-hidden />
            )}
            {feedback.msg}
          </p>
        )}
      </CardContent>
    </Card>
  )
}