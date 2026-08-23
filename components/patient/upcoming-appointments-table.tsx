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

function statusBadgeClass(status: string) {
  const s = String(status || '').toUpperCase()
  switch (s) {
    case 'COMPLETED':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    case 'CANCELLED':
    case 'CANCELED':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'CONFIRMED':
    case 'SCHEDULED':
      return 'bg-primary/10 text-primary border-primary/20'
    case 'HELD':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

export default function UpcomingAppointmentsTable({
  appointments,
}: {
  appointments: any
}) {
  const apptList: any[] = Array.isArray(appointments)
    ? appointments
    : Array.isArray((appointments as any)?.appointments)
      ? (appointments as any).appointments
      : Array.isArray((appointments as any)?.data?.appointments)
        ? (appointments as any).data.appointments
        : Array.isArray((appointments as any)?.data)
          ? (appointments as any).data
          : []

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not scheduled'
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return dateString
      return format(date, 'MMMM d, yyyy')
    } catch {
      return dateString
    }
  }

  const formatTime = (dateString: string) => {
    if (!dateString) return '--:--'
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return dateString
      return format(date, 'HH:mm')
    } catch {
      return dateString
    }
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
        {apptList.length === 0 ? (
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
                {apptList.map((appt, i) => {
                  const visitDate = appt.visit_date || appt.start_time || appt.created_at
                  const doctorName =
                    appt.medical_staff?.users?.first_name
                      ? `Dr. ${appt.medical_staff.users.first_name} ${appt.medical_staff.users.last_name || ''}`.trim()
                      : appt.doctor_name || `Doctor #${appt.doctor_id || i + 1}`
                  const status = appt.visit_status || appt.status || 'Scheduled'

                  return (
                    <TableRow key={appt.appointment_id || appt.id || i} className="text-sm transition-colors hover:bg-muted/40">
                      <TableCell className="tabular-nums text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell>{formatDate(visitDate)}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatTime(visitDate)}
                      </TableCell>
                      <TableCell>{doctorName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadgeClass(status)}>
                          {status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}