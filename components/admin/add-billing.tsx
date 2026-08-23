import React, { useState, useEffect } from 'react'
import { AlertCircle, CircleCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Invoice = {
  bill_id: number
  patient_name: string
}

type AddBillingItemProps = {
  invoices: Invoice[]
  newItem: {
    billId: string
    itemType: string
    itemIdRef: string
    description: string
    quantity: string
    unitPrice: string
  }
  itemFeedback: { ok: boolean; msg: string } | null
  setNewItem: React.Dispatch<React.SetStateAction<any>>
  handleAddItem: (e: React.FormEvent<HTMLFormElement>) => void
}

export default function AddBillingItemSection({
  invoices,
  newItem,
  itemFeedback,
  setNewItem,
  handleAddItem,
}: AddBillingItemProps) {
  // State for fetched item name and price
  const [itemInfo, setItemInfo] = useState<{ name: string; price: number | undefined } | null>(null)
  const [itemLoading, setItemLoading] = useState(false)
  const [itemError, setItemError] = useState<string | null>(null)

  // Fetch all medicines for dropdown
  const [allMedicines, setAllMedicines] = useState<any[]>([])
  useEffect(() => {
    if (newItem.itemType === 'Medicine') {
      fetch('/api/medicine')
        .then((res) => res.json())
        .then((data) => setAllMedicines(Array.isArray(data) ? data : []))
        .catch(() => setAllMedicines([]))
    }
  }, [newItem.itemType])

  // Fetch all rooms for dropdown
  const [allRooms, setAllRooms] = useState<any[]>([])
  useEffect(() => {
    if (newItem.itemType === 'Room') {
      fetch('/api/rooms')
        .then((res) => res.json())
        .then((data) => setAllRooms(Array.isArray(data) ? data : []))
        .catch(() => setAllRooms([]))
    }
  }, [newItem.itemType])

  // Fetch item name and price when itemType and itemIdRef change (except for Treatment)
  useEffect(() => {
    const fetchItemInfo = async () => {
      setItemInfo(null)
      setItemError(null)
      if (!newItem.itemIdRef || !newItem.itemType || newItem.itemType === 'Treatment') return
      setItemLoading(true)
      try {
        let url = ''
        if (newItem.itemType === 'Medicine') {
          url = `/api/medicine?id=${newItem.itemIdRef}`
        } else if (newItem.itemType === 'Room') {
          url = `/api/rooms?id=${newItem.itemIdRef}`
        }
        if (!url) return
        const res = await fetch(url)
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()
        // For medicine, expect array or object with name and price
        if (newItem.itemType === 'Medicine') {
          // Use the same logic as the doctor's stock table: show only the name
          // The API returns an array of medicines, find the one with matching id
          let med = null
          if (Array.isArray(data)) {
            med = data.find(
              (m) =>
                String(m.medicine_id || m.id) === String(newItem.itemIdRef) ||
                m.name === String(newItem.itemIdRef),
            )
          } else if (data && (data.medicine_id || data.id || data.name)) {
            if (
              String(data.medicine_id || data.id) === String(newItem.itemIdRef) ||
              data.name === String(newItem.itemIdRef)
            ) {
              med = data
            }
          }
          setItemInfo(med ? { name: med.name, price: med.unit_price } : null)
        } else if (newItem.itemType === 'Room') {
          const room = Array.isArray(data) ? data[0] : data
          setItemInfo(room ? { name: room.room_type, price: room.price_per_night } : null)
        }
      } catch (err: any) {
        setItemError('Item not found')
        setItemInfo(null)
      } finally {
        setItemLoading(false)
      }
    }
    fetchItemInfo()
  }, [newItem.itemType, newItem.itemIdRef])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Billing Item</CardTitle>
        <CardDescription>
          Attach medicines, treatments, or room charges to an invoice
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAddItem} className="space-y-4">
          {/* Invoice */}
          <div className="space-y-2">
            <label htmlFor="ab-invoice" className="text-sm font-medium">
              Invoice
            </label>
            <Select
              value={newItem.billId}
              onValueChange={(v) => setNewItem((i: any) => ({ ...i, billId: v }))}
            >
              <SelectTrigger id="ab-invoice" className="w-full">
                <SelectValue placeholder="-- Select Invoice --" />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((i) => (
                  <SelectItem key={i.bill_id} value={String(i.bill_id)}>
                    INV-{i.bill_id.toString().padStart(3, '0')} — {i.patient_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Item type */}
          <div className="space-y-2">
            <label htmlFor="ab-type" className="text-sm font-medium">
              Item Type
            </label>
            <Select
              value={newItem.itemType}
              onValueChange={(v) =>
                setNewItem((i: any) => ({
                  ...i,
                  itemType: v,
                  itemIdRef: '',
                  unitPrice: '',
                }))
              }
            >
              <SelectTrigger id="ab-type" className="w-full">
                <SelectValue placeholder="-- Select Item Type --" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Medicine">Medicine</SelectItem>
                <SelectItem value="Treatment">Treatment</SelectItem>
                <SelectItem value="Room">Room</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Item reference (ID from medicine/treatment/room table) */}
          <div className="space-y-2">
            <label htmlFor="ab-item" className="text-sm font-medium">
              Select Item/ Item ID
            </label>
            {newItem.itemType === 'Medicine' ? (
              <Select
                value={newItem.itemIdRef}
                onValueChange={(v) => {
                  const selectedMed = allMedicines.find(
                    (m) =>
                      String(m.medicine_id || m.id) === v || m.name === v,
                  )
                  const unitPrice =
                    selectedMed?.unit_price != null
                      ? String(selectedMed.unit_price)
                      : ''
                  setNewItem((i: any) => ({
                    ...i,
                    itemIdRef: selectedMed
                      ? String(selectedMed.medicine_id || selectedMed.id)
                      : v,
                    unitPrice: unitPrice || i.unitPrice,
                  }))
                }}
              >
                <SelectTrigger id="ab-item" className="w-full">
                  <SelectValue placeholder="-- Select Medicine --" />
                </SelectTrigger>
                <SelectContent>
                  {allMedicines.map((med) => (
                    <SelectItem
                      key={med.medicine_id || med.id || med.name}
                      value={String(med.medicine_id || med.id || med.name)}
                    >
                      {med.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : newItem.itemType === 'Room' ? (
              <Select
                value={newItem.itemIdRef}
                onValueChange={(v) => {
                  const selectedRoom = allRooms.find(
                    (r) => String(r.room_id || r.id) === v,
                  )
                  const price =
                    selectedRoom?.price_per_night != null
                      ? String(selectedRoom.price_per_night)
                      : ''
                  setNewItem((i: any) => ({
                    ...i,
                    itemIdRef: v,
                    unitPrice: price || i.unitPrice,
                  }))
                }}
              >
                <SelectTrigger id="ab-item" className="w-full">
                  <SelectValue placeholder="-- Select Room --" />
                </SelectTrigger>
                <SelectContent>
                  {allRooms.map((room) => (
                    <SelectItem
                      key={room.room_id || room.id}
                      value={String(room.room_id || room.id)}
                    >
                      {room.room_type} (Dept: {room.departments?.name || room.department_id || '-'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="ab-item"
                type="number"
                required
                value={newItem.itemIdRef}
                onChange={(e) => setNewItem((i: any) => ({ ...i, itemIdRef: e.target.value }))}
                className="w-full"
                placeholder={newItem.itemType === 'Treatment' ? 'Treatment ID' : ''}
              />
            )}
            {itemLoading && (
              <p className="text-xs text-muted-foreground">Looking up item…</p>
            )}
            {itemError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                {itemError}
              </p>
            )}
            {itemInfo && !itemLoading && (
              <p className="text-xs text-muted-foreground">
                Selected: <span className="font-medium text-foreground">{itemInfo.name}</span>
                {typeof itemInfo.price === 'number' && (
                  <> · {itemInfo.price.toFixed(2)} / night</>
                )}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="ab-description" className="text-sm font-medium">
              Description
            </label>
            <Input
              id="ab-description"
              type="text"
              required
              value={newItem.description}
              onChange={(e) => setNewItem((i: any) => ({ ...i, description: e.target.value }))}
              className="w-full"
            />
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <label htmlFor="ab-quantity" className="text-sm font-medium">
              Quantity
            </label>
            <Input
              id="ab-quantity"
              type="number"
              min="1"
              required
              value={newItem.quantity}
              onChange={(e) => setNewItem((i: any) => ({ ...i, quantity: e.target.value }))}
              className="w-full tabular-nums"
            />
          </div>

          {/* Unit price */}
          <div className="space-y-2">
            <label htmlFor="ab-price" className="text-sm font-medium">
              Unit Price
            </label>
            <Input
              id="ab-price"
              type="number"
              min="0"
              step="0.01"
              required
              value={newItem.unitPrice}
              onChange={(e) => setNewItem((i: any) => ({ ...i, unitPrice: e.target.value }))}
              className="w-full tabular-nums"
            />
          </div>

          <Button type="submit" className="w-full">
            Add Item
          </Button>
        </form>

        {itemFeedback && (
          <p
            role="status"
            className={`mt-4 flex items-center gap-1.5 text-sm ${
              itemFeedback.ok ? 'text-success' : 'text-destructive'
            }`}
          >
            {itemFeedback.ok ? (
              <CircleCheck className="size-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="size-4 shrink-0" aria-hidden />
            )}
            {itemFeedback.msg}
          </p>
        )}
      </CardContent>
    </Card>
  )
}