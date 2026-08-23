import fs from 'node:fs'
import path from 'node:path'

function loadEnvFiles() {
  const root = process.cwd()
  const envFiles = ['.env.local', '.env']
  for (const file of envFiles) {
    const fullPath = path.resolve(root, file)
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          let val = trimmed.slice(eqIdx + 1).trim()
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1)
          }
          if (!process.env[key]) {
            process.env[key] = val
          }
        }
      }
    }
  }
}
loadEnvFiles()

import { createServiceClientRaw } from '../utils/supabase/service'

const DEMO_USERS = [
  {
    id: '00000000-0000-4000-a000-000000000001',
    email: 'demo-admin@hms.local',
    password: 'DemoAdmin123!',
    role: 'Admin',
    firstName: 'Alexander',
    lastName: 'Vance',
    gender: 'Male',
    dob: '1980-05-12',
    phone: '+1-555-0101',
    address: '100 Hospital Plaza, Suite 400',
    nationalId: 'DEMO-NAT-001',
    license: 'DEMO-LIC-ADM-01',
  },
  {
    id: '00000000-0000-4000-a000-000000000002',
    email: 'demo-doctor@hms.local',
    password: 'DemoDoctor123!',
    role: 'Doctor',
    firstName: 'Evelyn',
    lastName: 'Reed',
    gender: 'Female',
    dob: '1985-08-23',
    phone: '+1-555-0102',
    address: '204 Medical Arts Blvd',
    nationalId: 'DEMO-NAT-002',
    license: 'DEMO-LIC-DOC-02',
  },
  {
    id: '00000000-0000-4000-a000-000000000003',
    email: 'demo-nurse@hms.local',
    password: 'DemoNurse123!',
    role: 'Nurse',
    firstName: 'Clara',
    lastName: 'Barton',
    gender: 'Female',
    dob: '1992-11-15',
    phone: '+1-555-0103',
    address: '310 Health Care Way',
    nationalId: 'DEMO-NAT-003',
    license: 'DEMO-LIC-NUR-03',
  },
  {
    id: '00000000-0000-4000-a000-000000000004',
    email: 'demo-pharmacist@hms.local',
    password: 'DemoPharmacist123!',
    role: 'Pharmacist',
    firstName: 'James',
    lastName: 'Wilson',
    gender: 'Male',
    dob: '1988-03-30',
    phone: '+1-555-0104',
    address: '415 Dispensary Row',
    nationalId: 'DEMO-NAT-004',
    license: 'DEMO-LIC-PHR-04',
  },
  {
    id: '00000000-0000-4000-a000-000000000005',
    email: 'demo-patient@hms.local',
    password: 'DemoPatient123!',
    role: 'Patient',
    firstName: 'Sarah',
    lastName: 'Connor',
    gender: 'Female',
    dob: '1995-07-19',
    phone: '+1-555-0105',
    address: '500 Skyline Drive, Apt 2B',
    nationalId: 'DEMO-NAT-005',
    bloodType: 'O+',
    emergencyContact: 'John Connor (+1-555-0999)',
  },
]

export async function seedDemoDataset() {
  console.log('🚀 Starting HMS Demo Dataset Provisioning...')
  const supabase = createServiceClientRaw()

  // 1. Ensure departments
  console.log('📦 Ensuring departments...')
  await supabase.from('departments').upsert(
    [
      { name: 'General Medicine', description: 'Primary care and internal medicine' },
      { name: 'Cardiology', description: 'Heart and cardiovascular care' },
      { name: 'Pharmacy', description: 'Pharmaceutical dispensing' },
      { name: 'General Ward', description: 'Inpatient recovery ward' },
    ],
    { onConflict: 'name' },
  )

  const { data: depts } = await supabase.from('departments').select('department_id, name')
  const deptGen = (depts as any[])?.find((d: any) => d.name === 'General Medicine')?.department_id ?? 1
  const deptPharm = (depts as any[])?.find((d: any) => d.name === 'Pharmacy')?.department_id ?? 1
  const deptWard = (depts as any[])?.find((d: any) => d.name === 'General Ward')?.department_id ?? deptGen

  // 2. Create Auth Users via Supabase Admin Auth API
  console.log('👤 Provisioning Demo Auth Accounts...')
  for (const user of DEMO_USERS) {
    try {
      const { data: existingUser } = await supabase.auth.admin.getUserById(user.id)
      if (!existingUser?.user) {
        const { error: authErr } = await supabase.auth.admin.createUser({
          id: user.id,
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: {
            first_name: user.firstName,
            last_name: user.lastName,
          },
        })
        if (authErr) console.warn(`Auth user warning (${user.email}):`, authErr.message)
      } else {
        await supabase.auth.admin.updateUserById(user.id, {
          password: user.password,
          email_confirm: true,
        })
      }
    } catch (e: any) {
      console.warn(`Auth creation fallback for ${user.email}:`, e.message)
    }

    // Upsert public user profile
    await supabase.from('users').upsert(
      {
        user_id: user.id,
        national_id: user.nationalId,
        first_name: user.firstName,
        last_name: user.lastName,
        date_of_birth: user.dob,
        gender: user.gender,
        address: user.address,
        phone_number: user.phone,
      },
      { onConflict: 'user_id' },
    )

    // Upsert staff or patient record
    if (user.role === 'Patient') {
      await supabase.from('patients').upsert(
        {
          user_id: user.id,
          blood_type: user.bloodType,
          emergency_contact_id: user.emergencyContact,
        },
        { onConflict: 'user_id' },
      )
    } else {
      const staffDept = user.role === 'Pharmacist' ? deptPharm : user.role === 'Nurse' ? deptWard : deptGen
      await supabase.from('medical_staff').upsert(
        {
          user_id: user.id,
          department_id: staffDept,
          staff_type: user.role,
          license_number: user.license,
          employment_status: 'Active',
          date_hired: '2021-01-01',
        },
        { onConflict: 'user_id' },
      )
    }
  }

  // Retrieve IDs
  const { data: docStaff } = await supabase.from('medical_staff').select('staff_id').eq('user_id', DEMO_USERS[1].id).single()
  const { data: nurseStaff } = await supabase.from('medical_staff').select('staff_id').eq('user_id', DEMO_USERS[2].id).single()
  const { data: pharmStaff } = await supabase.from('medical_staff').select('staff_id').eq('user_id', DEMO_USERS[3].id).single()
  const { data: patientRecord } = await supabase.from('patients').select('patient_id').eq('user_id', DEMO_USERS[4].id).single()

  const docId = docStaff?.staff_id
  const nurseId = nurseStaff?.staff_id
  const pharmId = pharmStaff?.staff_id
  const patId = patientRecord?.patient_id

  // 3. Hospital Rooms
  console.log('🏥 Provisioning Hospital Rooms...')
  await supabase.from('rooms').upsert(
    [
      { room_type: 'General', department_id: deptWard, price_per_night: 150.0, capacity: 4 },
      { room_type: 'ICU', department_id: deptGen, price_per_night: 500.0, capacity: 2 },
    ],
    { onConflict: 'room_id' },
  )

  const { data: roomGen } = await supabase.from('rooms').select('room_id').eq('room_type', 'General').limit(1).maybeSingle()
  const roomId = roomGen?.room_id

  // 4. Pharmacy Medication Stock
  console.log('💊 Provisioning Pharmacy Medicine Inventory...')
  const today = new Date().toISOString().slice(0, 10)
  const demoMedicines = [
    {
      name: 'Amoxicillin 500mg',
      generic_name: 'Amoxicillin',
      category: 'Antibiotic',
      dosage_form: 'Capsule',
      strength: '500mg',
      quantity: 79,
      reorder_level: 20,
      unit_price: 2.5,
      expiry_date: '2027-08-01',
      manufacturer: 'PharmaCare Labs',
      batch_number: 'DEMO-BATCH-AMX1',
    },
    {
      name: 'Paracetamol 650mg',
      generic_name: 'Acetaminophen',
      category: 'Analgesic',
      dosage_form: 'Tablet',
      strength: '650mg',
      quantity: 150,
      reorder_level: 30,
      unit_price: 1.0,
      expiry_date: '2028-01-01',
      manufacturer: 'HealthMed Inc',
      batch_number: 'DEMO-BATCH-PCM1',
    },
    {
      name: 'Azithromycin 250mg',
      generic_name: 'Azithromycin',
      category: 'Antibiotic',
      dosage_form: 'Tablet',
      strength: '250mg',
      quantity: 5, // Low stock demo
      reorder_level: 15,
      unit_price: 4.0,
      expiry_date: '2027-02-15',
      manufacturer: 'GlobalPharma',
      batch_number: 'DEMO-BATCH-AZT1',
    },
    {
      name: 'Salbutamol Inhaler 100mcg',
      generic_name: 'Salbutamol',
      category: 'Respiratory',
      dosage_form: 'Inhaler',
      strength: '100mcg',
      quantity: 0, // Out of stock demo
      reorder_level: 10,
      unit_price: 12.5,
      expiry_date: '2027-04-10',
      manufacturer: 'BreatheEasy',
      batch_number: 'DEMO-BATCH-SLB1',
    },
  ]

  for (const med of demoMedicines) {
    const { data: existingMed } = await supabase
      .from('medicine_stock')
      .select('medicine_id')
      .eq('name', med.name)
      .maybeSingle()

    if (existingMed) {
      await supabase
        .from('medicine_stock')
        .update(med)
        .eq('medicine_id', existingMed.medicine_id)
    } else {
      await supabase.from('medicine_stock').insert(med)
    }
  }

  const { data: medAmox } = await supabase.from('medicine_stock').select('medicine_id').eq('name', 'Amoxicillin 500mg').single()
  const { data: medPara } = await supabase.from('medicine_stock').select('medicine_id').eq('name', 'Paracetamol 650mg').single()

  // 5. Doctor Specialty & Availability & Slots
  if (docId) {
    console.log('🩺 Linking Doctor Specialty & Availability...')
    
    // Ensure specialties exist
    await supabase.from('specialties').upsert(
      [
        { name: 'General Practice', description: 'Primary care and general consultations', active: true },
        { name: 'Cardiology', description: 'Heart and cardiovascular conditions', active: true },
      ],
      { onConflict: 'name' },
    )

    const { data: specData } = await supabase
      .from('specialties')
      .select('specialty_id')
      .eq('name', 'General Practice')
      .limit(1)
      .maybeSingle()

    if (specData?.specialty_id) {
      await supabase.from('doctor_specialties').upsert(
        {
          doctor_id: docId,
          specialty_id: specData.specialty_id,
          is_primary: true,
        },
        { onConflict: 'doctor_id,specialty_id' },
      )
    }

    // Availability for all days (0 = Sunday to 6 = Saturday)
    for (let day = 0; day <= 6; day++) {
      const availRow = {
        doctor_id: docId,
        day_of_week: day,
        start_time: '08:00:00',
        end_time: '18:00:00',
        slot_duration_minutes: 30,
        active: true,
      }
      const { data: existingAvail } = await supabase
        .from('doctor_availability')
        .select('id')
        .eq('doctor_id', docId)
        .eq('day_of_week', day)
        .eq('start_time', '08:00:00')
        .maybeSingle()

      if (!existingAvail) {
        await supabase.from('doctor_availability').insert(availRow)
      } else {
        await supabase.from('doctor_availability').update(availRow).eq('id', existingAvail.id)
      }
    }

    // Seed bookable slots (TIMESTAMPTZ with start_time & end_time)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)

    const slotsToSeed = [
      // Completed appointment slot for today
      {
        doctor_id: docId,
        start_time: `${today}T10:00:00Z`,
        end_time: `${today}T10:30:00Z`,
        duration_minutes: 30,
        status: 'BOOKED' as const,
      },
      // Fixed 2026-08-24 slots for demo consistency (11:00 AM & 2:00 PM)
      {
        doctor_id: docId,
        start_time: '2026-08-24T11:00:00Z',
        end_time: '2026-08-24T11:30:00Z',
        duration_minutes: 30,
        status: 'AVAILABLE' as const,
      },
      {
        doctor_id: docId,
        start_time: '2026-08-24T14:00:00Z',
        end_time: '2026-08-24T14:30:00Z',
        duration_minutes: 30,
        status: 'AVAILABLE' as const,
      },
      // Relative tomorrow slots
      {
        doctor_id: docId,
        start_time: `${tomorrowStr}T11:00:00Z`,
        end_time: `${tomorrowStr}T11:30:00Z`,
        duration_minutes: 30,
        status: 'AVAILABLE' as const,
      },
      {
        doctor_id: docId,
        start_time: `${tomorrowStr}T14:00:00Z`,
        end_time: `${tomorrowStr}T14:30:00Z`,
        duration_minutes: 30,
        status: 'AVAILABLE' as const,
      },
    ]

    for (const s of slotsToSeed) {
      const { data: existingSlot } = await supabase
        .from('appointment_slots')
        .select('slot_id')
        .eq('doctor_id', s.doctor_id)
        .eq('start_time', s.start_time)
        .maybeSingle()

      if (!existingSlot) {
        await supabase.from('appointment_slots').insert(s)
      } else {
        await supabase.from('appointment_slots').update(s).eq('slot_id', existingSlot.slot_id)
      }
    }
  }

  // 6. Complete Medical Journey: Completed Appointment for Sarah Connor
  if (docId && patId) {
    console.log('🩺 Provisioning Completed Clinical Encounter & AI Summaries...')
    const { data: bookedSlot } = await supabase
      .from('appointment_slots')
      .select('slot_id')
      .eq('doctor_id', docId)
      .eq('start_time', `${today}T10:00:00Z`)
      .maybeSingle()

    const slotId = bookedSlot?.slot_id

    const { data: existingAppt } = await supabase
      .from('appointments')
      .select('appointment_id')
      .eq('slot_id', slotId)
      .maybeSingle()

    let apptId = existingAppt?.appointment_id

    if (!apptId) {
      const { data: appt, error: apptError } = await supabase
        .from('appointments')
        .insert({
          slot_id: slotId,
          patient_id: patId,
          doctor_id: docId,
          status: 'COMPLETED',
          reason_for_visit: 'Persistent dry cough, fever for 3 days, mild chest tightness',
          booked_by_user_id: DEMO_USERS[4].id,
          booked_at: `${today}T10:00:00Z`,
          confirmed_at: `${today}T10:00:00Z`,
          completed_at: `${today}T10:30:00Z`,
          timezone: 'UTC',
        })
        .select('appointment_id')
        .single()

      if (apptError) {
        console.error('Appt insert error in seed:', apptError)
      }
      apptId = appt?.appointment_id
    }

    if (apptId) {
      // Pre-visit symptom intake & AI summary
      await supabase.from('symptom_intakes').upsert(
        {
          appointment_id: apptId,
          patient_id: patId,
          symptoms: JSON.stringify(['Dry cough', 'Fever 101F', 'Mild chest congestion']),
          severity: 'MODERATE',
          duration_text: '3 days',
          worsening: true,
          additional_context: 'Symptoms started after cold exposure. No prior asthma history.',
          ai_processing_consent: true,
        },
        { onConflict: 'appointment_id' },
      )

      await supabase.from('ai_previsit_summaries').upsert(
        {
          appointment_id: apptId,
          patient_id: patId,
          doctor_id: docId,
          urgency: 'MEDIUM',
          chief_complaint: '3-day history of moderate productive cough with fever and chest discomfort.',
          suggested_questions: [
            'Are you experiencing any wheezing or difficulty breathing when lying down?',
            'Have you noticed any discolored sputum or blood when coughing?',
            'Have you taken any over-the-counter fever reducers and did they help?',
          ],
          status: 'COMPLETED',
        },
        { onConflict: 'appointment_id' },
      )

      // Post-visit clinical notes
      const { data: note } = await supabase
        .from('post_visit_notes')
        .upsert(
          {
            appointment_id: apptId,
            patient_id: patId,
            doctor_id: docId,
            clinical_notes:
              'Patient evaluated for acute lower respiratory symptoms. Temperature 38.2C, BP 120/80, SpO2 97% on room air. Chest auscultation reveals mild bilateral rhonchi with no consolidation. Diagnosed with acute bronchitis. Prescribed Amoxicillin 500mg TID for 7 days and Paracetamol 650mg PRN. Recommended 24h inpatient ward observation for monitoring.',
            diagnosis: 'Acute Bronchitis (J20.9)',
            follow_up_instr:
              'Stay well hydrated. Take complete antibiotic course with food. Return immediately if high fever recurs or breathlessness worsens. Follow-up clinic review in 7 days.',
            created_by: DEMO_USERS[1].id,
          },
          { onConflict: 'appointment_id' },
        )
        .select('note_id')
        .single()

      // Post-visit AI summary
      await supabase.from('post_visit_summaries').upsert(
        {
          appointment_id: apptId,
          patient_id: patId,
          doctor_id: docId,
          note_id: note?.note_id,
          visit_explanation:
            'During your visit today, Dr. Evelyn Reed diagnosed you with Acute Bronchitis, an inflammation of the airways that causes cough and fever. Your lung oxygen levels are healthy at 97%.',
          medication_sched:
            '• Amoxicillin 500mg: Take 1 capsule 3 times daily (Morning 8am, Afternoon 2pm, Night 8pm) after meals for 7 full days.\n• Paracetamol 650mg: Take 1 tablet every 6 hours as needed if fever rises above 100°F.',
          follow_up_steps:
            'Rest in the hospital observation room today. Schedule a follow-up appointment in 7 days if symptoms do not fully resolve.',
          instructions: 'Drink plenty of warm fluids. Avoid cold drafts and smoke exposure.',
          status: 'COMPLETED',
        },
        { onConflict: 'appointment_id' },
      )

      // Medical record
      const { data: record } = await supabase
        .from('medical_records')
        .insert({
          patient_id: patId,
          doctor_id: docId,
          symptoms: 'Fever, dry cough, chest tightness',
          diagnosis: 'Acute Bronchitis (J20.9)',
          treatment_plan: 'Antibiotic therapy, antipyretics, supportive fluids, inpatient observation',
          medicine_prescribed: 'Amoxicillin 500mg TID x 7d, Paracetamol 650mg PRN x 5d',
          visit_date: today,
          visit_status: 'Completed',
          patient_status: 'Admitted for Observation',
        })
        .select('record_id')
        .single()

      const recordId = record?.record_id

      // E-Prescription & Items
      const { data: rx } = await supabase
        .from('prescriptions')
        .insert({
          appointment_id: apptId,
          patient_id: patId,
          doctor_id: docId,
          record_id: recordId,
          issue_date: today,
          expiry_date: '2026-09-06',
          notes: 'Take antibiotics with full glass of water. Complete entire course.',
          status: 'DISPENSED',
        })
        .select('prescription_id')
        .single()

      const rxId = rx?.prescription_id

      if (rxId && medAmox?.medicine_id && medPara?.medicine_id) {
        await supabase.from('prescription_items').insert([
          {
            prescription_id: rxId,
            medicine_id: medAmox.medicine_id,
            medicine_name: 'Amoxicillin 500mg',
            dosage: '500mg',
            frequency: 'THREE_TIMES_DAILY',
            duration_days: 7,
            quantity: 21,
            instructions: 'Take 1 capsule every 8 hours with meals',
          },
          {
            prescription_id: rxId,
            medicine_id: medPara.medicine_id,
            medicine_name: 'Paracetamol 650mg',
            dosage: '650mg',
            frequency: 'AS_NEEDED',
            duration_days: 5,
            quantity: 10,
            instructions: 'Take 1 tablet every 6 hours if fever exceeds 100F',
          },
        ])

        // Medication reminders
        await supabase.from('medication_reminders').insert([
          {
            patient_id: patId,
            prescription_id: rxId,
            medicine_name: 'Amoxicillin 500mg',
            dosage: '500mg',
            scheduled_date: today,
            scheduled_time: '08:00:00',
            status: 'SENT',
          },
          {
            patient_id: patId,
            prescription_id: rxId,
            medicine_name: 'Amoxicillin 500mg',
            dosage: '500mg',
            scheduled_date: today,
            scheduled_time: '14:00:00',
            status: 'SENT',
          },
          {
            patient_id: patId,
            prescription_id: rxId,
            medicine_name: 'Amoxicillin 500mg',
            dosage: '500mg',
            scheduled_date: today,
            scheduled_time: '20:00:00',
            status: 'PENDING',
          },
        ])

        // Pharmacy Dispensing record
        if (pharmId) {
          await supabase.from('medicine_dispense').insert({
            record_id: recordId,
            pharmacist_id: pharmId,
            medicine_id: medAmox.medicine_id,
            quantity: 21,
            dispense_date: new Date().toISOString(),
            instructions: 'Dispensed full 21 capsules course. Patient counseled on adherence.',
          })
        }
      }

      // Inpatient Admission
      if (roomId && nurseId) {
        await supabase.from('admissions').insert({
          patient_id: patId,
          room_id: roomId,
          nurse_id: nurseId,
          doctor_id: docId,
          admission_date: new Date().toISOString(),
          discharge_date: null,
        })
      }

      // Billing & Invoice
      const { data: bill } = await supabase
        .from('billing')
        .insert({
          patient_id: patId,
          total_price: 127.5,
          status: 'Pending',
        })
        .select('bill_id')
        .single()

      if (bill?.bill_id) {
        await supabase.from('billing_items').insert([
          {
            bill_id: bill.bill_id,
            item_type: 'Consultation',
            item_id_ref: apptId,
            description: 'Specialist Clinical Consultation - Dr. Evelyn Reed',
            quantity: 1,
            unit_price: 75.0,
            total_price: 75.0,
          },
          {
            bill_id: bill.bill_id,
            item_type: 'Medication',
            item_id_ref: medAmox?.medicine_id,
            description: 'Amoxicillin 500mg (21 capsules dispensed)',
            quantity: 21,
            unit_price: 2.5,
            total_price: 52.5,
          },
        ])
      }
    }
  }

  console.log('✅ Demo test dataset successfully provisioned!')
}

// Run directly if executed as main module
if (require.main === module || process.argv[1]?.includes('seed-demo-dataset')) {
  seedDemoDataset().catch((err) => {
    console.error('❌ Failed to seed demo dataset:', err)
    process.exit(1)
  })
}
