'use client'

import { CalendarClock } from 'lucide-react'
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
import { format } from 'date-fns'

/** Semantic status styling driven by the design-token status language. */
function statusBadgeClass(status: string) {
  switch (status) {
    case 'Completed':
      return 'bg-success-surface text-success border-transparent'
    case 'Canceled':
      return 'bg-neutral-surface text-neutral-foreground border-transparent'
    default:
      // Scheduled
      return 'bg-warning-surface text-warning border-transparent'
  }
}

export default function UpcomingAppointmentsTable({
  appointments,
}: {
  appointments: {
    visit_date: string
    visit_status: 'Scheduled' | 'Completed' | 'Canceled'
    medical_staff: {
      users: {
        last_name: string
        first_name: string
      }
    }
  }[]
}) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return format(date, 'MMMM d, yyyy')
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return format(date, 'HH:mm')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" aria-hidden />
          Upcoming Appointments
        </CardTitle>
        <CardDescription>Your confirmed doctor visits</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {appointments.length === 0 ? (
          <div className="px-6 pb-2">
            <EmptyState
              icon={<CalendarClock />}
              title="No appointments yet"
              description="Book an appointment above and it will appear here."
            />
          </div>
        ) : (
          <div className="max-h-[350px] overflow-auto">
            <Table className="border-collapse border-spacing-0">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appt, i) => (
                  <TableRow key={i} className="text-sm transition-colors hover:bg-muted/40">
                    <TableCell className="tabular-nums text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell>{formatDate(appt.visit_date)}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatTime(appt.visit_date)}
                    </TableCell>
                    <TableCell>
                      Dr. {appt.medical_staff.users.first_name}{' '}
                      {appt.medical_staff.users.last_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(appt.visit_status)}>
                        {appt.visit_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}