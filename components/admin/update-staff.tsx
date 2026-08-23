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

type Staff = {
  staff_id: number
  users: { first_name: string; last_name: string }
}

type UpdateStaffProps = {
  staffList: Staff[]
  updateData: {
    staffId: string
    departmentId: string
    staffType: string
    licenseNumber: string
    employmentStatus: string
  }
  updateFeedback: { ok: boolean; msg: string } | null
  handleUpdateStaff: (e: React.FormEvent<HTMLFormElement>) => void
  handleStaffSelectChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  setUpdateData: React.Dispatch<React.SetStateAction<any>>
}

export default function UpdateStaffSection({
  staffList,
  updateData,
  updateFeedback,
  handleUpdateStaff,
  handleStaffSelectChange,
  setUpdateData,
}: UpdateStaffProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Update Staff</CardTitle>
        <CardDescription>
          Amend department, license, or employment status
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpdateStaff} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="us-staff" className="text-sm font-medium">
              Select Staff
            </label>
            <Select
              value={updateData.staffId}
              onValueChange={(v) =>
                handleStaffSelectChange({ target: { value: v } } as any)
              }
            >
              <SelectTrigger id="us-staff" className="w-full">
                <SelectValue placeholder="-- Select Staff --" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.staff_id} value={String(s.staff_id)}>
                    {s.users.first_name} {s.users.last_name} (#{s.staff_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="us-department" className="text-sm font-medium">
              Department
            </label>
            <Select
              value={updateData.departmentId}
              onValueChange={(v) =>
                setUpdateData((d: any) => ({ ...d, departmentId: v }))
              }
            >
              <SelectTrigger id="us-department" className="w-full">
                <SelectValue placeholder="-- Select Department --" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Cardiology 1</SelectItem>
                <SelectItem value="2">Emergency 2</SelectItem>
                <SelectItem value="3">Pediatrics 3</SelectItem>
                <SelectItem value="4">Neurology 4</SelectItem>
                <SelectItem value="5">Orthopedics 5</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="us-type" className="text-sm font-medium">
              Staff Type
            </label>
            <Select
              value={updateData.staffType}
              onValueChange={(v) =>
                setUpdateData((d: any) => ({ ...d, staffType: v }))
              }
            >
              <SelectTrigger id="us-type" className="w-full">
                <SelectValue placeholder="-- Select Staff Type --" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Doctor">Doctor</SelectItem>
                <SelectItem value="Nurse">Nurse</SelectItem>
                <SelectItem value="Pharmacist">Pharmacist</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="us-license" className="text-sm font-medium">
              License #
            </label>
            <Input
              id="us-license"
              name="licenseNumber"
              type="text"
              value={updateData.licenseNumber}
              onChange={(e) =>
                setUpdateData((d: any) => ({ ...d, licenseNumber: e.target.value }))
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="us-status" className="text-sm font-medium">
              Employment Status
            </label>
            <Select
              value={updateData.employmentStatus}
              onValueChange={(v) =>
                setUpdateData((d: any) => ({ ...d, employmentStatus: v }))
              }
            >
              <SelectTrigger id="us-status" className="w-full">
                <SelectValue placeholder="-- Select Employment Status --" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="On_Leave">On Leave</SelectItem>
                <SelectItem value="Resigned">Resigned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full">
            Update
          </Button>
        </form>

        {updateFeedback && (
          <p
            role="status"
            className={`mt-4 flex items-center gap-1.5 text-sm ${
              updateFeedback.ok ? 'text-success' : 'text-destructive'
            }`}
          >
            {updateFeedback.ok ? (
              <CircleCheck className="size-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="size-4 shrink-0" aria-hidden />
            )}
            {updateFeedback.msg}
          </p>
        )}
      </CardContent>
    </Card>
  )
}