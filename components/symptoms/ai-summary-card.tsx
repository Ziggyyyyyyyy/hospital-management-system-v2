'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Status = 'COMPLETED' | 'PROCESSING' | 'FAILED' | 'PENDING'
type Urgency = 'LOW' | 'MEDIUM' | 'HIGH'

interface PrevisitSummary {
  status: Status
  urgency?: Urgency
  chief_complaint?: string
  suggested_questions?: string[]
  error?: string
}

export default function AISummaryCard({
  appointment_id,
}: {
  appointment_id: string | number
}) {
  const [data, setData] = useState<PrevisitSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSummary = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/previsit/${appointment_id}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Failed to fetch summary')
      }
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to load AI summary')
      setData({ status: 'FAILED', error: e?.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSummary()
  }, [appointment_id])

  const statusVariant = (s: Status) => {
    switch (s) {
      case 'COMPLETED':
          return 'success'
      case 'PROCESSING':
        return 'secondary'
      case 'FAILED':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  const urgencyColor = (u?: Urgency) => {
    switch (u) {
      case 'HIGH':
        return 'text-destructive bg-destructive/10'
      case 'MEDIUM':
        return 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30'
      case 'LOW':
        return 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
      default:
        return 'text-muted-foreground'
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Pre-visit Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>AI Pre-visit Summary</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(data?.status ?? 'PENDING')}>
            {data?.status ?? 'PENDING'}
          </Badge>
          <Button size="sm" variant="ghost" onClick={fetchSummary}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.urgency && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Urgency:</span>
            <Badge
              variant="outline"
              className={urgencyColor(data.urgency)}
            >
              {data.urgency}
            </Badge>
          </div>
        )}

        {data?.chief_complaint && (
          <div className="space-y-1">
          <div className="text-sm font-medium">Chief Complaint</div>
          <p className="text-sm text-muted-foreground">
            {data.chief_complaint}
          </p>
        </div>
        )}

        {data?.suggested_questions && data.suggested_questions.length > 0 && (
          <div className="space-y-2">
          <div className="text-sm font-medium">Suggested Questions</div>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {data.suggested_questions.slice(0, 3).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
        )}

        {data?.status === 'FAILED' && !data?.chief_complaint && (
          <p className="text-sm text-muted-foreground">
            {data.error ?? 'Summary not available.'}
          </p>
        )}

        {data?.status === 'PROCESSING' && (
          <p className="text-sm text-muted-foreground">
            AI is processing your symptoms. Check back shortly.
          </p>
        )}

        {data?.status === 'PENDING' && (
          <p className="text-sm text-muted-foreground">
            Submit symptoms first to generate an AI summary.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
