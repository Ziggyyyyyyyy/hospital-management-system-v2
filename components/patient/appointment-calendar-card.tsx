import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { format, isSameDay, parseISO } from 'date-fns'

interface Appointment {
  date: string
  doctor: string
  status: 'Scheduled' | 'Completed' | 'Canceled'
}

export default function AppointmentCalendarCard({
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

  const scheduledAppointmentDates = apptList
    .filter((appt) => appt.visit_status === 'Scheduled' || appt.status === 'CONFIRMED' || appt.status === 'SCHEDULED' || appt.status === 'HELD')
    .map((appt) => parseISO(appt.visit_date || appt.start_time || appt.created_at))
    .filter((d) => !isNaN(d.getTime()))

  const completedAppointmentDates = apptList
    .filter((appt) => appt.visit_status === 'Completed' || appt.status === 'COMPLETED')
    .map((appt) => parseISO(appt.visit_date || appt.start_time || appt.created_at))
    .filter((d) => !isNaN(d.getTime()))

  const canceledAppointmentDates = apptList
    .filter((appt) => appt.visit_status === 'Canceled' || appt.status === 'CANCELLED' || appt.status === 'CANCELED')
    .map((appt) => parseISO(appt.visit_date || appt.start_time || appt.created_at))
    .filter((d) => !isNaN(d.getTime()))

  const modifiersClassNames = {
    appointmentScheduled:
      'bg-[color:var(--color-yellow)] hover:bg-[color:var(--color-yellow-hover)] text-white font-medium rounded-full',
    appointmentCompleted:
      'bg-[color:var(--color-green)] hover:bg-[color:var(--color-green-hover)] text-white font-medium rounded-full',
    appointmentCanceled:
      'bg-[color:var(--color-red)] hover:bg-[color:var(--color-red-hover)] text-white font-medium rounded-full',
  }

  const modifiers = {
    appointmentScheduled: (date: Date) =>
      scheduledAppointmentDates.some((appointmentDate) =>
        isSameDay(date, appointmentDate),
      ),
    appointmentCompleted: (date: Date) =>
      completedAppointmentDates.some((appointmentDate) =>
        isSameDay(date, appointmentDate),
      ),
    appointmentCanceled: (date: Date) =>
      canceledAppointmentDates.some((appointmentDate) =>
        isSameDay(date, appointmentDate),
      ),
  }

  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" /> Appointment
          Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-w-xs mx-auto flex justify-center">
          <Calendar
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
          />
        </div>
      </CardContent>
    </Card>
  )
}
