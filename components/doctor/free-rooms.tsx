'use client'

import React, { useState, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
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
import { DoorOpen } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

interface Room {
  room_id: string
  room_type: string
  department_id: number
  price_per_night: number
  capacity: number
  departments: {
    name: string
  }
  current_occupancy?: number
  available_beds?: number
  occupancy_percentage?: number
}

interface Admission {
  room_id: string
  admission_date: string
  discharge_date: string | null
}

const RoomAvailabilityTable: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRoomsAndAdmissions = async () => {
      try {
        const [roomsResponse, admissionsResponse] = await Promise.all([
          fetch('/api/rooms'),
          fetch('/api/admission'),
        ])

        if (!roomsResponse.ok) throw new Error('Failed to fetch rooms')
        const roomsData = await roomsResponse.json()

        if (!admissionsResponse.ok) throw new Error('Failed to fetch admissions')
        const admissionsData = await admissionsResponse.json()

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const admissions = Array.isArray(admissionsData)
          ? admissionsData
          : admissionsData.data || []

        const admissionsByRoom: Record<string, number> = {}

        admissions.forEach((admission: Admission) => {
          const admissionDate = new Date(admission.admission_date)
          admissionDate.setHours(0, 0, 0, 0)

          const dischargeDate = admission.discharge_date
            ? new Date(admission.discharge_date)
            : null
          if (dischargeDate) dischargeDate.setHours(0, 0, 0, 0)

          const isActive =
            admissionDate <= today && (!dischargeDate || dischargeDate >= today)

          if (isActive && admission.room_id) {
            admissionsByRoom[admission.room_id] =
              (admissionsByRoom[admission.room_id] || 0) + 1
          }
        })

        const roomsWithAvailability = (Array.isArray(roomsData) ? roomsData : []).map((room: Room) => {
          const currentOccupancy = admissionsByRoom[room.room_id] || 0
          const availableBeds = Math.max(0, room.capacity - currentOccupancy)
          const occupancyPercentage = room.capacity > 0 ? (currentOccupancy / room.capacity) * 100 : 0

          return {
            ...room,
            current_occupancy: currentOccupancy,
            available_beds: availableBeds,
            occupancy_percentage: occupancyPercentage,
          }
        })

        setRooms(roomsWithAvailability)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchRoomsAndAdmissions()
  }, [])

  const getAvailabilityBadge = (room: Room) => {
    if (room.available_beds === 0) {
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
          Full
        </Badge>
      )
    }
    if (((room.available_beds ?? 0) / (room.capacity || 1)) * 100 <= 50) {
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs">
          {room.available_beds} Beds Left
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
        {room.available_beds} Available
      </Badge>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-destructive text-sm">
          Failed to load room data: {error}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DoorOpen className="h-4 w-4 text-primary" />
          Room Occupancy & Availability
        </CardTitle>
        <CardDescription className="text-xs">
          Real-time inpatient bed status and departmental room allocation
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-36">Occupancy</TableHead>
                <TableHead className="text-right pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.length > 0 ? (
                rooms.map((room, i) => (
                  <TableRow key={room.room_id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-semibold text-foreground">{room.room_id}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{room.departments?.name || 'General'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{room.room_type}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                          <span>{room.current_occupancy || 0}/{room.capacity}</span>
                          <span>{Math.round(room.occupancy_percentage || 0)}%</span>
                        </div>
                        <Progress
                          value={room.occupancy_percentage || 0}
                          className="h-1.5"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">{getAvailabilityBadge(room)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
                    No hospital rooms configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export default RoomAvailabilityTable
