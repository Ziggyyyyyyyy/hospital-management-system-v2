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

type User = {
  user_id: number
  first_name: string
  last_name: string
}

type CreateStaffProps = {
  userList: User[]
  createFeedback: { ok: boolean; msg: string } | null
  handleCreateStaff: (e: React.FormEvent<HTMLFormElement>) => void
}

export default function CreateStaffSection({
  userList,
  createFeedback,
  handleCreateStaff,
}: CreateStaffProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Staff</CardTitle>
        <CardDescription>
          Register a new doctor, nurse, or pharmacist
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateStaff} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="cs-user" className="text-sm font-medium">
              User
            </label>
            <Select name="userId">
              <SelectTrigger id="cs-user" className="w-full">
                <SelectValue placeholder="-- Select User --" />
              </SelectTrigger>
              <SelectContent>
                {userList.map((u) => (
                  <SelectItem key={u.user_id} value={String(u.user_id)}>
                    {u.first_name} {u.last_name} (#{u.user_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="cs-department" className="text-sm font-medium">
              Department
            </label>
            <Select name="departmentId">
              <SelectTrigger id="cs-department" className="w-full">
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
            <label htmlFor="cs-type" className="text-sm font-medium">
              Staff Type
            </label>
            <Select name="staffType">
              <SelectTrigger id="cs-type" className="w-full">
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
            <label htmlFor="cs-license" className="text-sm font-medium">
              License #
            </label>
            <Input id="cs-license" name="licenseNumber" type="text" required className="w-full" />
          </div>

          <div className="space-y-2">
            <label htmlFor="cs-status" className="text-sm font-medium">
              Employment Status
            </label>
            <Select name="employmentStatus">
              <SelectTrigger id="cs-status" className="w-full">
                <SelectValue placeholder="-- Select Employment Status --" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="On_Leave">On Leave</SelectItem>
                <SelectItem value="Resigned">Resigned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="cs-date" className="text-sm font-medium">
              Date Hired
            </label>
            <Input id="cs-date" name="dateHired" type="date" required className="w-full" />
          </div>

          <Button type="submit" className="w-full">
            Create
          </Button>
        </form>

        {createFeedback && (
          <p
            role="status"
            className={`mt-4 flex items-center gap-1.5 text-sm ${
              createFeedback.ok ? 'text-success' : 'text-destructive'
            }`}
          >
            {createFeedback.ok ? (
              <CircleCheck className="size-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="size-4 shrink-0" aria-hidden />
            )}
            {createFeedback.msg}
          </p>
        )}
      </CardContent>
    </Card>
  )
}