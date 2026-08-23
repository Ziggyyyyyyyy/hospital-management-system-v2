'use client'

import React, { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { CalendarDays } from 'lucide-react'

const DoctorCalendar: React.FC = () => {
  const [date, setDate] = useState<Date | undefined>(new Date())

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Clinical Calendar
        </CardTitle>
        <CardDescription className="text-xs">
          Select a date to check availability
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center p-3">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="rounded-md border border-border mx-auto p-2"
        />
      </CardContent>
    </Card>
  )
}

export default DoctorCalendar
