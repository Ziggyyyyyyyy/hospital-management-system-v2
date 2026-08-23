'use client'
import React, { useEffect, useState } from 'react'
import AssignNurseSection from '../../components/admin/assign-nurse'
import CreateStaffSection from '../../components/admin/create-staff'
import UpdateStaffSection from '../../components/admin/update-staff'
import NurseAssignmentStatusSection from '../../components/admin/nurse-status'
import CreateBillingSection from '../../components/admin/create-billing'
import UpdateBillingSection from '../../components/admin/update-billing'
import AddBillingItemSection from '../../components/admin/add-billing'
import BillingTableSection from '../../components/admin/billing-table-section'
import { Skeleton } from '@/components/ui/skeleton'

/* ========= types ========= */
type Nurse = {
  staff_id: number
  users: { first_name: string; last_name: string }
}
type Admission = {
  admission_id: number
  room_id: number
  nurse_id: number
}

type User = {
  user_id: number
  first_name: string
  last_name: string
}

type Patient = {
  patient_id: number
  users: {
    national_id: string
    first_name: string
    last_name: string
  }
  blood_type: string
  emergency_contact_id: number
}

export default function AdminDashboard() {
  /* ---------- state ---------- */
  const [nurses, setNurses] = useState<Nurse[]>([])
  const [admissions, setAdmissions] = useState<Admission[]>([])
  const [isAssigning, setIsAssigning] = useState(false)
  const [selectedAdm, setSelectedAdm] = useState<Admission | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(
    null,
  )

  const [createFeedback, setCreateFeedback] = useState<{
    ok: boolean
    msg: string
  } | null>(null)
  const [updateFeedback, setUpdateFeedback] = useState<{
    ok: boolean
    msg: string
  } | null>(null)

  type Staff = {
    staff_id: number
    users: { first_name: string; last_name: string }
  }
  const [staffList, setStaffList] = useState<Staff[]>([])

  const [updateData, setUpdateData] = useState({
    staffId: '', // string
    departmentId: '',
    staffType: '',
    licenseNumber: '',
    employmentStatus: '',
  })
  const [userList, setUserList] = useState<User[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  /* ---------- load nurses + admissions ---------- */

  const [invoices, setInvoices] = useState<
    {
      total_price: any
      bill_id: number
      patient_name: string
      status: string
    }[]
  >([])

  const [updateBilling, setUpdateBilling] = useState({
    billId: '',
    status: 'Pending',
  })
  const [billingUpdateFeedback, setBillingUpdateFeedback] = useState<{
    ok: boolean
    msg: string
  } | null>(null)

  const [newItem, setNewItem] = useState({
    billId: '',
    itemType: 'Medicine',
    itemIdRef: '',
    description: '',
    quantity: '',
    unitPrice: '',
  })
  const [itemFeedback, setItemFeedback] = useState<{
    ok: boolean
    msg: string
  } | null>(null)

  // UI-only: tracks initial data hydration for the skeleton screen.
  const [isLoading, setIsLoading] = useState(true)

  async function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setItemFeedback(null)

    const billId = Number(newItem.billId)
    const itemType = newItem.itemType as 'Medicine' | 'Treatment' | 'Room'
    let itemIdRef = Number(newItem.itemIdRef)
    const description = newItem.description ? newItem.description.trim() : ''
    const quantity = Number(newItem.quantity)
    const unitPrice = Number(newItem.unitPrice)

    if (!billId || isNaN(billId) || billId <= 0) {
      setItemFeedback({ ok: false, msg: 'Please select an invoice.' })
      return
    }

    if (!itemType || !['Medicine', 'Treatment', 'Room'].includes(itemType)) {
      setItemFeedback({ ok: false, msg: 'Please select an item type.' })
      return
    }

    if (isNaN(itemIdRef) || itemIdRef <= 0) {
      if (itemType === 'Medicine' && newItem.itemIdRef) {
        try {
          const medRes = await fetch('/api/medicine')
          if (medRes.ok) {
            const meds = await medRes.json()
            const found = Array.isArray(meds)
              ? meds.find(
                  (m: any) =>
                    m.name === newItem.itemIdRef ||
                    String(m.medicine_id) === newItem.itemIdRef,
                )
              : null
            if (found && found.medicine_id) {
              itemIdRef = Number(found.medicine_id)
            }
          }
        } catch {}
      }
    }

    if (isNaN(itemIdRef) || itemIdRef <= 0) {
      setItemFeedback({ ok: false, msg: 'Please select or enter a valid item.' })
      return
    }

    if (!description) {
      setItemFeedback({ ok: false, msg: 'Please enter a description.' })
      return
    }

    if (isNaN(quantity) || quantity <= 0) {
      setItemFeedback({ ok: false, msg: 'Quantity must be greater than 0.' })
      return
    }

    if (isNaN(unitPrice) || unitPrice < 0) {
      setItemFeedback({ ok: false, msg: 'Unit price must be 0 or greater.' })
      return
    }

    const body = {
      bill_id: billId,
      item_type: itemType,
      item_id_ref: itemIdRef,
      description,
      quantity,
      unit_price: unitPrice,
    }

    try {
      const res = await fetch('/api/billing/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        setItemFeedback({
          ok: true,
          msg: `✔ ${json.message || 'Item added successfully'}`,
        })
        setNewItem({
          billId: '',
          itemType: 'Medicine',
          itemIdRef: '',
          description: '',
          quantity: '',
          unitPrice: '',
        })
        fetch('/api/billing', { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => setInvoices(Array.isArray(data) ? data : []))
          .catch(() => {})
      } else {
        setItemFeedback({ ok: false, msg: json.error || 'Add item failed' })
      }
    } catch (err) {
      console.error(err)
      setItemFeedback({ ok: false, msg: 'An unexpected error occurred' })
    }
  }

  useEffect(() => {
    async function load() {
      const [nurseRes, admRes] = await Promise.all([
        fetch('/api/admin/staff?type=Nurse', { credentials: 'include' }),
        fetch('/api/admission', { credentials: 'include' }),
      ])

      if (nurseRes.ok) {
        setNurses(await nurseRes.json())
      } else {
        console.error('staff load error', nurseRes.status)
      }

      if (admRes.ok) {
        const json = await admRes.json()
        console.log('admissions response', json) // → { data: [...] }
        setAdmissions(Array.isArray(json?.data) ? json.data : []) // now admissions is Admission[]
      }

      const patientsRes = await fetch('/api/admin/patient', {
        credentials: 'include',
      })

      if (patientsRes.ok) {
        const pts = await patientsRes.json()
        setPatients(
          Array.isArray(pts) ? pts : Array.isArray(pts?.data) ? pts.data : [],
        )
      } else {
        console.error('fetch patients error', patientsRes.status)
      }
      const invRes = await fetch('/api/billing', { credentials: 'include' })
      if (invRes.ok) {
        const inv = await invRes.json()
        setInvoices(Array.isArray(inv) ? inv : [])
      } else {
        console.error('fetch invoices failed', invRes.status)
      }
    }

    // Same requests as before — wrapped so the skeleton can clear when
    // every initial fetch has settled (success or failure).
    void Promise.all([
      load(),
      fetch('/api/staff', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          const list = Array.isArray(d)
            ? d
            : Array.isArray(d?.data)
              ? d.data
              : []
          setStaffList(list)
        })
        .catch(console.error),
      fetch('/api/admin/user', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          const list = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
              ? data.data
              : []
          setUserList(list)
        })
        .catch((err) => console.error('fetch users failed', err)),
    ]).finally(() => setIsLoading(false))
  }, [])

  // Smooth scroll to section when hash is present on load/refresh or hashchange
  useEffect(() => {
    if (isLoading) return
    const scrollToHash = () => {
      const hash = window.location.hash
      if (hash) {
        const id = hash.replace('#', '')
        const element = document.getElementById(id)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    }

    const timer = setTimeout(scrollToHash, 50)
    window.addEventListener('hashchange', scrollToHash)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('hashchange', scrollToHash)
    }
  }, [isLoading])

  function handleAdmissionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedAdm(
      admissions.find((a) => a.admission_id === +e.target.value) || null,
    )
  }
  function handleStaffSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    const staff = staffList.find((s) => String(s.staff_id) === id)
    if (staff) {
      setUpdateData({
        staffId: id,
        departmentId: String((staff as any).department_id),
        staffType: (staff as any).staff_type,
        licenseNumber: (staff as any).license_number,
        employmentStatus: (staff as any).employment_status,
      })
    }
  }

  async function handleAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedAdm) return

    const form = e.currentTarget
    setFeedback(null)
    setIsAssigning(true)

    try {
      const nurseId = Number(form.nurseId?.value)
      const admissionId = Number(selectedAdm.admission_id)
      const roomId = Number(selectedAdm.room_id)

      if (!admissionId || isNaN(admissionId) || !roomId || isNaN(roomId)) {
        setFeedback({ ok: false, msg: 'Invalid admission or room ID' })
        setIsAssigning(false)
        return
      }

      if (!nurseId || isNaN(nurseId)) {
        setFeedback({ ok: false, msg: 'Please select a nurse' })
        setIsAssigning(false)
        return
      }

      const res = await fetch('/api/admin/assign-nurse', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          admission_id: admissionId,
          nurse_id: nurseId,
          room_id: roomId,
        }),
      })

      const json = await res.json()

      if (res.ok) {
        // update your admissions list
        setAdmissions((prev) =>
          prev.map((a) =>
            a.admission_id === json.admission_id
              ? { ...a, nurse_id: json.nurse_id }
              : a,
          ),
        )
        setFeedback({ ok: true, msg: '✔ Assigned successfully' })
        form.reset()
        setSelectedAdm(null)
      } else {
        // server returned a 4xx/5xx
        setFeedback({ ok: false, msg: json.error || 'Assign failed' })
      }
    } catch (err) {
      console.error(err)
      setFeedback({ ok: false, msg: 'Unexpected error' })
    } finally {
      // ALWAYS run this after success or error
      setIsAssigning(false)
    }
  }

  const roomsByNurse = React.useMemo(() => {
    const map: Record<number, number[]> = {}
    for (const a of admissions) {
      if (!map[a.nurse_id]) map[a.nurse_id] = []
      map[a.nurse_id].push(a.room_id)
    }
    for (const nid in map) {
      map[+nid] = Array.from(new Set(map[+nid]))
    }
    return map
  }, [admissions])

  const handleCreateStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    setCreateFeedback(null)

    const payload = {
      user_id: form.userId.value,
      department_id: +form.departmentId.value,
      staff_type: form.staffType.value,
      license_number: form.licenseNumber.value,
      employment_status: form.employmentStatus.value,
      date_hired: form.dateHired.value,
      updated_at: new Date().toISOString(),
    }

    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (res.ok) {
        setCreateFeedback({ ok: true, msg: '✔ Created staff' })
        form.reset()
      } else {
        setCreateFeedback({ ok: false, msg: json.error || 'Create failed' })
      }
    } catch {
      setCreateFeedback({ ok: false, msg: 'Unexpected error' })
    }
  }

  const handleUpdateStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    setUpdateFeedback(null)

    const id = (form as any)?.staffId?.value || updateData.staffId
    if (!id) {
      setUpdateFeedback({
        ok: false,
        msg: 'Please select a staff member to update.',
      })
      return
    }

    const departmentId =
      (form as any)?.departmentId?.value || updateData.departmentId
    const staffType =
      (form as any)?.staffType?.value || updateData.staffType
    const licenseNumber =
      (form as any)?.licenseNumber?.value ?? updateData.licenseNumber
    const employmentStatus =
      (form as any)?.employmentStatus?.value ||
      updateData.employmentStatus

    const payload: any = {}
    if (departmentId) payload.department_id = Number(departmentId)
    if (staffType) payload.staff_type = staffType
    if (licenseNumber !== undefined && licenseNumber !== '')
      payload.license_number = licenseNumber
    if (employmentStatus) payload.employment_status = employmentStatus

    if (Object.keys(payload).length === 0) {
      setUpdateFeedback({
        ok: false,
        msg: 'No fields to update.',
      })
      return
    }

    try {
      const res = await fetch(`/api/admin/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (res.ok) {
        setUpdateFeedback({ ok: true, msg: '✔ Updated staff' })
        form.reset()
      } else {
        setUpdateFeedback({ ok: false, msg: json.error || 'Update failed' })
      }
    } catch {
      setUpdateFeedback({ ok: false, msg: 'Unexpected error' })
    }
  }

  const [newBilling, setNewBilling] = useState({
    patientId: '',
    totalPrice: '',
  })
  const [billingFeedback, setBillingFeedback] = useState<{
    ok: boolean
    msg: string
  } | null>(null)

  async function handleCreateBilling(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBillingFeedback(null)

    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: Number(newBilling.patientId),
          total_price: Number(newBilling.totalPrice),
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setBillingFeedback({
          ok: true,
          msg: `✔ Bill created successfully (ID: ${json.bill_id})`,
        })
        setNewBilling({ patientId: '', totalPrice: '' })
      } else {
        setBillingFeedback({
          ok: false,
          msg: json.error || 'Bill creation failed',
        })
      }
    } catch (err) {
      console.error(err)
      setBillingFeedback({ ok: false, msg: 'An error occurred.  ' })
    }
  }

  async function handleUpdateBilling(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBillingUpdateFeedback(null)

    // เอา ID มาก่อน
    const billId = updateBilling.billId
    if (!billId) return

    try {
      const res = await fetch(`/api/billing/${billId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: updateBilling.status, // send as field "status"
        }),
      })

      const json = await res.json()

      if (res.ok) {
        setBillingUpdateFeedback({ ok: true, msg: `✔ ${json.message}` })
        setUpdateBilling({ billId: '', status: 'Pending' })
      } else {
        setBillingUpdateFeedback({
          ok: false,
          msg: json.error || 'Update failed',
        })
      }
    } catch (err) {
      console.error(err)
      setBillingUpdateFeedback({ ok: false, msg: 'An error occurred.' })
    }
  }

  /* ---------- JSX ---------- */
  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:p-10">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-2 h-5 w-96 max-w-full" />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Skeleton className="h-80 w-full rounded-xl" />
            <div className="grid gap-6 md:grid-cols-2">
              <Skeleton className="h-96 w-full rounded-xl" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          </div>
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        <Skeleton className="mt-10 h-72 w-full rounded-xl" />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:p-10">
      {/* Page header */}
      <header className="mb-8">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Administration
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Manage nurse assignments, staff records, and patient billing across
          the hospital.
        </p>
      </header>

      <div className="space-y-10">
        {/* Staff & assignments */}
        <section aria-labelledby="staff-heading">
          <h2 id="staff-heading" className="sr-only">
            Staff management
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div id="appointments" className="scroll-mt-32">
                <AssignNurseSection
                  nurses={nurses}
                  admissions={admissions}
                  selectedAdm={selectedAdm}
                  isAssigning={isAssigning}
                  feedback={feedback}
                  handleAssign={handleAssign}
                  handleAdmissionChange={handleAdmissionChange}
                />
              </div>
              <div id="staff" className="grid grid-cols-1 gap-6 md:grid-cols-2 scroll-mt-32">
                <CreateStaffSection
                  userList={userList}
                  createFeedback={createFeedback}
                  handleCreateStaff={handleCreateStaff}
                />
                <UpdateStaffSection
                  staffList={staffList}
                  updateData={updateData}
                  updateFeedback={updateFeedback}
                  handleUpdateStaff={handleUpdateStaff}
                  handleStaffSelectChange={handleStaffSelectChange}
                  setUpdateData={setUpdateData}
                />
              </div>
            </div>
            <div id="patients" className="space-y-6 scroll-mt-32">
              <NurseAssignmentStatusSection
                nurses={nurses}
                roomsByNurse={roomsByNurse}
              />
            </div>
          </div>
        </section>

        {/* Billing */}
        <section
          aria-labelledby="billing-heading"
          id="billing"
          className="scroll-mt-32"
        >
          <h2 id="billing-heading" className="sr-only">
            Billing management
          </h2>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <CreateBillingSection
              patients={patients}
              newBilling={newBilling}
              billingFeedback={billingFeedback}
              setNewBilling={setNewBilling}
              handleCreateBilling={handleCreateBilling}
            />
            <UpdateBillingSection
              invoices={invoices}
              updateBilling={updateBilling}
              billingUpdateFeedback={billingUpdateFeedback}
              setUpdateBilling={setUpdateBilling}
              handleUpdateBilling={handleUpdateBilling}
            />
            <AddBillingItemSection
              invoices={invoices}
              newItem={newItem}
              itemFeedback={itemFeedback}
              setNewItem={setNewItem}
              handleAddItem={handleAddItem}
            />
          </div>
          <div className="mt-6">
            <BillingTableSection invoices={invoices} />
          </div>
        </section>
      </div>
    </main>
  )
}