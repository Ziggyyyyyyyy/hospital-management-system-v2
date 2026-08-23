'use client'

import { useState } from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const symptomSchema = z.object({
  symptoms: z.string().min(1, 'Symptoms are required'),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE']).default('MILD'),
  duration_text: z.string().optional().or(z.literal('')),
  worsening: z.boolean().default(false),
  additional_context: z.string().optional().or(z.literal('')),
  ai_processing_consent: z.boolean().refine((val) => val === true, {
    message: 'AI processing consent is required',
  }),
  appointment_id: z.union([z.string(), z.number()]),
  patient_id: z.union([z.string(), z.number()]),
})

type SeverityT = 'MILD' | 'MODERATE' | 'SEVERE'

interface SymptomFormValues {
  symptoms: string
  severity: SeverityT
  duration_text?: string
  worsening: boolean
  additional_context?: string
  ai_processing_consent: boolean
  appointment_id: string | number
  patient_id: string | number
}

export default function SymptomIntakeForm({
  appointment_id,
  patient_id,
  onSuccess,
}: {
  appointment_id: string | number
  patient_id: string | number
  onSuccess?: () => void
}) {
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SymptomFormValues>({
    resolver: zodResolver(symptomSchema) as any,
    defaultValues: {
      symptoms: '',
      severity: 'MILD',
      duration_text: '',
      worsening: false,
      additional_context: '',
      ai_processing_consent: false,
      appointment_id,
      patient_id,
    },
  })

  const severity = watch('severity')
  const worsening = watch('worsening')
  const ai_processing_consent = watch('ai_processing_consent')

  const onSubmit: SubmitHandler<SymptomFormValues> = async (values) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/symptoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? err?.message ?? 'Submission failed')
      }
      toast.success('Symptoms submitted successfully')
      onSuccess?.()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to submit symptoms')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Symptom Intake</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register('appointment_id')} />
          <input type="hidden" {...register('patient_id')} />

          <div className="space-y-2">
            <Label htmlFor="symptoms">
              Symptoms <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="symptoms"
              placeholder="Describe your symptoms..."
              {...register('symptoms')}
            />
            {errors.symptoms && (
              <p className="text-xs text-destructive">
                {errors.symptoms.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="severity">Severity</Label>
            <Select
              value={severity}
              onValueChange={(v) => setValue('severity', v as SeverityT)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MILD">MILD</SelectItem>
                <SelectItem value="MODERATE">MODERATE</SelectItem>
                <SelectItem value="SEVERE">SEVERE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration_text">Duration</Label>
            <Input
              id="duration_text"
              placeholder="e.g. 2 days, 1 week"
              {...register('duration_text')}
            />
          </div>

          <div className="flex items-center gap-2 space-y-0">
            <Checkbox
              id="worsening"
              checked={worsening}
              onCheckedChange={(c) =>
                setValue('worsening', c === true ? true : false)
              }
            />
            <Label htmlFor="worsening">Symptoms are worsening</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="additional_context">Additional Context</Label>
            <Textarea
              id="additional_context"
              placeholder="Any other relevant information..."
              {...register('additional_context')}
            />
          </div>

          <div className="flex items-center gap-2 space-y-0">
            <Checkbox
              id="ai_processing_consent"
              checked={ai_processing_consent}
              onCheckedChange={(c) =>
                setValue('ai_processing_consent', c === true ? true : false)
              }
            />
            <Label htmlFor="ai_processing_consent">
              I consent to AI processing of my symptoms for pre-visit summary
              <span className="text-destructive"> *</span>
            </Label>
          </div>
          {errors.ai_processing_consent && (
            <p className="text-xs text-destructive">
              {errors.ai_processing_consent.message}
            </p>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Symptoms'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
