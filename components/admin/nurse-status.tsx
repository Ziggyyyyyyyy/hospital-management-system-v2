import React from 'react'
import { UsersRound } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

type Nurse = {
  staff_id: number
  users: { first_name: string; last_name: string }
}

type NurseAssignmentStatusProps = {
  nurses: Nurse[]
  roomsByNurse: Record<number, number[]>
}

export default function NurseAssignmentStatusSection({
  nurses,
  roomsByNurse,
}: NurseAssignmentStatusProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nurse Assignment Status</CardTitle>
        <CardDescription>Live room coverage per nurse</CardDescription>
      </CardHeader>
      <CardContent>
        {nurses.length === 0 ? (
          <EmptyState
            icon={<UsersRound />}
            title="No nurses yet"
            description="Nurse assignments will appear here once staff are registered."
          />
        ) : (
          <ul className="divide-y divide-border">
            {nurses.map((nurse) => {
              const rooms = roomsByNurse[nurse.staff_id] || []
              const assigned = rooms.length > 0
              return (
                <li
                  key={nurse.staff_id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {nurse.users.first_name} {nurse.users.last_name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className={`status-dot ${assigned ? 'bg-info' : 'bg-success'}`}
                    />
                    <span
                      className={
                        assigned
                          ? 'text-muted-foreground'
                          : 'font-medium text-success'
                      }
                    >
                      {assigned
                        ? `Room${rooms.length > 1 ? 's' : ''} ${rooms.join(', ')}`
                        : 'Available'}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}