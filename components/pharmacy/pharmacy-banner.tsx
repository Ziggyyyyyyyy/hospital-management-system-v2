import { ShieldCheck, Pill } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export default function PharmacyBanner() {
  return (
    <Card className="w-full bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-border shadow-sm">
      <CardContent className="flex flex-col sm:flex-row items-center justify-between py-6 px-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 text-primary p-3 rounded-xl border border-primary/20">
            <Pill className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Pharmacy & Medication Inventory
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Live medication stock tracking, expiration alerts, and prescription fulfillment
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-background/80 dark:bg-muted/40 px-3.5 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground shrink-0 shadow-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Verified Hospital Dispensary</span>
        </div>
      </CardContent>
    </Card>
  )
}
