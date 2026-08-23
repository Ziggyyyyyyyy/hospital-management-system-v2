import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  PillIcon,
  Calendar,
  PackageIcon,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  medicines: {
    medicine_id: number
    name: string
    category: string
    description: string
    unit: string
    quantity: number
    min_stock_level: number
    supplier: string
    expiry_date: string
    updated_at: string
  }[]
}

export default function MedicineStockGrid({ medicines }: Props) {
  const getStatus = (quantity: number, minStockLevel: number) => {
    if (quantity === 0) return 'out-of-stock'
    if (quantity <= minStockLevel) return 'low-stock'
    return 'in-stock'
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in-stock':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" /> In Stock
          </Badge>
        )
      case 'low-stock':
        return (
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs"
          >
            <AlertTriangle className="h-3 w-3 mr-1" /> Low Stock
          </Badge>
        )
      case 'out-of-stock':
        return (
          <Badge
            variant="outline"
            className="bg-destructive/10 text-destructive border-destructive/20 text-xs"
          >
            <AlertCircle className="h-3 w-3 mr-1" /> Out of Stock
          </Badge>
        )
      default:
        return null
    }
  }

  if (medicines.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="p-4 pb-2">
              <Skeleton className="h-5 w-3/4" />
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <ScrollArea className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pr-3">
        {medicines.map((med) => {
          const status = getStatus(med.quantity, med.min_stock_level)
          const expiryDate = new Date(med.expiry_date)
          const isExpiringSoon =
            new Date() >
            new Date(expiryDate.getTime() - 30 * 24 * 60 * 60 * 1000)

          return (
            <TooltipProvider key={med.medicine_id}>
              <Card
                className={`overflow-hidden transition-all duration-200 hover:shadow-md ${
                  status === 'out-of-stock'
                    ? 'border-destructive/30 bg-destructive/5'
                    : status === 'low-stock'
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-border'
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <CardTitle
                        className="text-base font-semibold truncate"
                        title={med.name}
                      >
                        {med.name}
                      </CardTitle>
                      <CardDescription className="text-xs truncate mt-0.5">
                        {med.category || 'General'}
                      </CardDescription>
                    </div>
                    {getStatusBadge(status)}
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <PillIcon className="h-3.5 w-3.5 text-primary" />
                      <span>
                        <span className="font-semibold text-foreground">{med.quantity}</span>{' '}
                        {med.unit || 'units'}
                      </span>
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-xs">
                          <Calendar
                            className={`h-3 w-3 ${isExpiringSoon ? 'text-destructive' : 'text-muted-foreground'}`}
                          />
                          <span
                            className={
                              isExpiringSoon
                                ? 'text-destructive font-medium'
                                : 'text-muted-foreground'
                            }
                          >
                            {new Date(med.expiry_date).toLocaleDateString()}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>
                          {isExpiringSoon ? 'Expiring Soon' : 'Expiry Date'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {med.supplier && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-hidden">
                      <PackageIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate" title={med.supplier}>
                        {med.supplier}
                      </span>
                    </div>
                  )}

                  {/* Stock level indicator */}
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        status === 'out-of-stock'
                          ? 'bg-destructive'
                          : status === 'low-stock'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{
                        width: `${Math.min(100, (med.quantity / Math.max(1, med.min_stock_level * 3)) * 100)}%`,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </TooltipProvider>
          )
        })}
      </div>
    </ScrollArea>
  )
}
