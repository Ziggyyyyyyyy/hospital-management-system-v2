-- ============================================================
-- DEMO TEST DATASET FOR HOSPITAL MANAGEMENT SYSTEM (HMS)
-- Coherent Single Medical Journey:
-- Admin -> Patient -> Doctor -> Nurse -> Pharmacy -> Booking
-- -> AI Pre-Visit -> Consultation -> Rx -> Dispensing -> Inpatient -> Billing -> AI Post-Visit
-- ============================================================
-- NOTE: Uses deterministic fixed UUIDs prefixed with '00000000-demo-'
-- Marked with DEMO metadata. Idempotent (ON CONFLICT DO UPDATE / NOTHING).
-- ============================================================

BEGIN;

-- 1. Ensure Departments Exist
INSERT INTO public.departments (name, description) VALUES
  ('General Medicine', 'Primary care, outpatient clinic, and general medicine'),
  ('Cardiology',       'Heart and cardiovascular care'),
  ('Pharmacy',         'Hospital dispensary and medication storage'),
  ('General Ward',     'Inpatient recovery and general observation')
ON CONFLICT (name) DO NOTHING;

-- Retrieve department IDs
DO $$
DECLARE
  dept_gen_id BIGINT;
  dept_pharm_id BIGINT;
  dept_ward_id BIGINT;
  
  -- Fixed Demo Auth UUIDs
  admin_uid  UUID := '00000000-0000-4000-a000-000000000001';
  doctor_uid UUID := '00000000-0000-4000-a000-000000000002';
  nurse_uid  UUID := '00000000-0000-4000-a000-000000000003';
  pharm_uid  UUID := '00000000-0000-4000-a000-000000000004';
  pat_uid    UUID := '00000000-0000-4000-a000-000000000005';

  -- Variables for generated serial IDs
  doc_staff_id BIGINT;
  nurse_staff_id BIGINT;
  pharm_staff_id BIGINT;
  admin_staff_id BIGINT;
  demo_pat_id BIGINT;
  room_101_id BIGINT;
  room_icu_id BIGINT;
  med_amox_id BIGINT;
  med_para_id BIGINT;
  med_azith_id BIGINT;
  med_salb_id BIGINT;
  slot_avail_id BIGINT;
  slot_booked_id BIGINT;
  appt_id BIGINT;
  rec_id BIGINT;
  note_id BIGINT;
  rx_id BIGINT;
  disp_id BIGINT;
  bill_id BIGINT;
BEGIN
  SELECT department_id INTO dept_gen_id FROM public.departments WHERE name = 'General Medicine' LIMIT 1;
  SELECT department_id INTO dept_pharm_id FROM public.departments WHERE name = 'Pharmacy' LIMIT 1;
  SELECT department_id INTO dept_ward_id FROM public.departments WHERE name = 'General Ward' LIMIT 1;
  IF dept_ward_id IS NULL THEN dept_ward_id := dept_gen_id; END IF;

  -- 2. Create / Upsert Auth Users (in auth.users if not present)
  -- Uses Supabase standard encrypted password for 'DemoPassword123!'
  -- Salt: $2a$10$DEMO...
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (admin_uid,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-admin@hms.local',      crypt('DemoAdmin123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"first_name":"Alexander","last_name":"Vance"}', NOW(), NOW()),
    (doctor_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-doctor@hms.local',     crypt('DemoDoctor123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"first_name":"Evelyn","last_name":"Reed"}', NOW(), NOW()),
    (nurse_uid,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-nurse@hms.local',      crypt('DemoNurse123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"first_name":"Clara","last_name":"Barton"}', NOW(), NOW()),
    (pharm_uid,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-pharmacist@hms.local', crypt('DemoPharmacist123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"first_name":"James","last_name":"Wilson"}', NOW(), NOW()),
    (pat_uid,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-patient@hms.local',    crypt('DemoPatient123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"first_name":"Sarah","last_name":"Connor"}', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = NOW();

  -- 3. Public User Profiles
  INSERT INTO public.users (user_id, national_id, first_name, last_name, date_of_birth, gender, address, phone_number) VALUES
    (admin_uid,  'DEMO-NAT-001', 'Alexander', 'Vance',  '1980-05-12', 'Male',   '100 Hospital Plaza, Suite 400', '+1-555-0101'),
    (doctor_uid, 'DEMO-NAT-002', 'Evelyn',    'Reed',   '1985-08-23', 'Female', '204 Medical Arts Blvd',         '+1-555-0102'),
    (nurse_uid,  'DEMO-NAT-003', 'Clara',     'Barton', '1992-11-15', 'Female', '310 Health Care Way',          '+1-555-0103'),
    (pharm_uid,  'DEMO-NAT-004', 'James',     'Wilson', '1988-03-30', 'Male',   '415 Dispensary Row',            '+1-555-0104'),
    (pat_uid,    'DEMO-NAT-005', 'Sarah',     'Connor', '1995-07-19', 'Female', '500 Skyline Drive, Apt 2B',     '+1-555-0105')
  ON CONFLICT (user_id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone_number = EXCLUDED.phone_number;

  -- 4. Medical Staff Roles
  INSERT INTO public.medical_staff (user_id, department_id, staff_type, license_number, employment_status, date_hired) VALUES
    (admin_uid,  dept_gen_id,   'Admin',      'DEMO-LIC-ADM-01', 'Active', '2020-01-15'),
    (doctor_uid, dept_gen_id,   'Doctor',     'DEMO-LIC-DOC-02', 'Active', '2021-03-01'),
    (nurse_uid,  dept_ward_id,  'Nurse',      'DEMO-LIC-NUR-03', 'Active', '2022-06-15'),
    (pharm_uid,  dept_pharm_id, 'Pharmacist', 'DEMO-LIC-PHR-04', 'Active', '2021-09-10')
  ON CONFLICT (user_id) DO UPDATE SET
    staff_type = EXCLUDED.staff_type,
    department_id = EXCLUDED.department_id;

  SELECT staff_id INTO admin_staff_id FROM public.medical_staff WHERE user_id = admin_uid;
  SELECT staff_id INTO doc_staff_id   FROM public.medical_staff WHERE user_id = doctor_uid;
  SELECT staff_id INTO nurse_staff_id FROM public.medical_staff WHERE user_id = nurse_uid;
  SELECT staff_id INTO pharm_staff_id FROM public.medical_staff WHERE user_id = pharm_uid;

  -- 5. Patient Profile
  INSERT INTO public.patients (user_id, blood_type, emergency_contact_id) VALUES
    (pat_uid, 'O+', 'John Connor (+1-555-0999)')
  ON CONFLICT (user_id) DO UPDATE SET
    blood_type = EXCLUDED.blood_type,
    emergency_contact_id = EXCLUDED.emergency_contact_id;

  SELECT patient_id INTO demo_pat_id FROM public.patients WHERE user_id = pat_uid;

  -- 6. Hospital Rooms
  INSERT INTO public.rooms (room_type, department_id, price_per_night, capacity) VALUES
    ('General', dept_ward_id, 150.00, 4),
    ('ICU',     dept_gen_id,  500.00, 2)
  ON CONFLICT DO NOTHING;

  SELECT room_id INTO room_101_id FROM public.rooms WHERE room_type = 'General' LIMIT 1;
  SELECT room_id INTO room_icu_id FROM public.rooms WHERE room_type = 'ICU' LIMIT 1;

  -- 7. Pharmacy Medication Stock
  INSERT INTO public.medicine_stock (name, generic_name, category, dosage_form, strength, quantity, reorder_level, unit_price, expiry_date, manufacturer, batch_number) VALUES
    ('Amoxicillin 500mg',      'Amoxicillin',      'Antibiotic',   'Capsule', '500mg', 79,  20, 2.50,  CURRENT_DATE + INTERVAL '365 days', 'PharmaCare Labs', 'DEMO-BATCH-AMX1'),
    ('Paracetamol 650mg',      'Acetaminophen',    'Analgesic',    'Tablet',  '650mg', 150, 30, 1.00,  CURRENT_DATE + INTERVAL '500 days', 'HealthMed Inc',   'DEMO-BATCH-PCM1'),
    ('Azithromycin 250mg',     'Azithromycin',     'Antibiotic',   'Tablet',  '250mg', 5,   15, 4.00,  CURRENT_DATE + INTERVAL '180 days', 'GlobalPharma',    'DEMO-BATCH-AZT1'),
    ('Salbutamol Inhaler 100mcg','Salbutamol',     'Respiratory',  'Inhaler', '100mcg',0,   10, 12.50, CURRENT_DATE + INTERVAL '240 days', 'BreatheEasy',     'DEMO-BATCH-SLB1')
  ON CONFLICT (name, COALESCE(batch_number, '')) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price;

  SELECT medicine_id INTO med_amox_id FROM public.medicine_stock WHERE name = 'Amoxicillin 500mg' LIMIT 1;
  SELECT medicine_id INTO med_para_id FROM public.medicine_stock WHERE name = 'Paracetamol 650mg' LIMIT 1;
  SELECT medicine_id INTO med_azith_id FROM public.medicine_stock WHERE name = 'Azithromycin 250mg' LIMIT 1;
  SELECT medicine_id INTO med_salb_id FROM public.medicine_stock WHERE name = 'Salbutamol Inhaler 100mcg' LIMIT 1;

  -- 8. Doctor Specialty & Availability & Slots
  INSERT INTO public.specialties (name, description, active) VALUES
    ('General Practice', 'Primary care and general consultations', true),
    ('Cardiology',       'Heart and cardiovascular conditions', true)
  ON CONFLICT (name) WHERE active = TRUE DO NOTHING;

  INSERT INTO public.doctor_specialties (doctor_id, specialty_id, is_primary)
  SELECT doc_staff_id, specialty_id, true
  FROM public.specialties WHERE name = 'General Practice' LIMIT 1
  ON CONFLICT (doctor_id, specialty_id) DO NOTHING;

  INSERT INTO public.doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, active) VALUES
    (doc_staff_id, 0, '08:00:00', '18:00:00', 30, true),
    (doc_staff_id, 1, '08:00:00', '18:00:00', 30, true),
    (doc_staff_id, 2, '08:00:00', '18:00:00', 30, true),
    (doc_staff_id, 3, '08:00:00', '18:00:00', 30, true),
    (doc_staff_id, 4, '08:00:00', '18:00:00', 30, true),
    (doc_staff_id, 5, '08:00:00', '18:00:00', 30, true),
    (doc_staff_id, 6, '08:00:00', '18:00:00', 30, true)
  ON CONFLICT (doctor_id, day_of_week, start_time) DO UPDATE SET active = true;

  -- Create completed slot for today + bookable slots for 2026-08-24 and tomorrow
  INSERT INTO public.appointment_slots (doctor_id, start_time, end_time, duration_minutes, status) VALUES
    (doc_staff_id, (CURRENT_DATE::TEXT || ' 10:00:00+00')::TIMESTAMPTZ, (CURRENT_DATE::TEXT || ' 10:30:00+00')::TIMESTAMPTZ, 30, 'BOOKED'),
    (doc_staff_id, '2026-08-24 11:00:00+00'::TIMESTAMPTZ, '2026-08-24 11:30:00+00'::TIMESTAMPTZ, 30, 'AVAILABLE'),
    (doc_staff_id, '2026-08-24 14:00:00+00'::TIMESTAMPTZ, '2026-08-24 14:30:00+00'::TIMESTAMPTZ, 30, 'AVAILABLE'),
    (doc_staff_id, ((CURRENT_DATE + INTERVAL '1 day')::TEXT || ' 11:00:00+00')::TIMESTAMPTZ, ((CURRENT_DATE + INTERVAL '1 day')::TEXT || ' 11:30:00+00')::TIMESTAMPTZ, 30, 'AVAILABLE'),
    (doc_staff_id, ((CURRENT_DATE + INTERVAL '1 day')::TEXT || ' 14:00:00+00')::TIMESTAMPTZ, ((CURRENT_DATE + INTERVAL '1 day')::TEXT || ' 14:30:00+00')::TIMESTAMPTZ, 30, 'AVAILABLE')
  ON CONFLICT (doctor_id, start_time) WHERE status IN ('AVAILABLE','HELD','BOOKED') DO NOTHING;

  SELECT slot_id INTO slot_booked_id FROM public.appointment_slots
  WHERE doctor_id = doc_staff_id AND start_time = (CURRENT_DATE::TEXT || ' 10:00:00+00')::TIMESTAMPTZ LIMIT 1;

  -- 9. Appointment Record (Completed Encounter for Sarah Connor)
  INSERT INTO public.appointments (
    slot_id, patient_id, doctor_id, status, reason_for_visit,
    booked_by_user_id, start_time, end_time, timezone
  ) VALUES (
    slot_booked_id, demo_pat_id, doc_staff_id, 'COMPLETED',
    'Persistent dry cough, fever for 3 days, mild shortness of breath',
    pat_uid,
    (CURRENT_DATE::TEXT || ' 10:00:00+00')::TIMESTAMPTZ,
    (CURRENT_DATE::TEXT || ' 10:30:00+00')::TIMESTAMPTZ,
    'UTC'
  )
  RETURNING appointment_id INTO appt_id;

  -- 10. AI Pre-visit Symptom Intake & Summary
  INSERT INTO public.symptom_intakes (
    appointment_id, patient_id, symptoms, severity, duration_text, worsening, additional_context, ai_processing_consent
  ) VALUES (
    appt_id, demo_pat_id, '["Dry cough", "Fever 101F", "Mild chest congestion"]', 'MODERATE',
    '3 days', true, 'Patient reports symptoms started after cold exposure. No prior asthma history.', true
  )
  ON CONFLICT (appointment_id) DO NOTHING;

  INSERT INTO public.ai_previsit_summaries (
    appointment_id, patient_id, doctor_id, urgency, chief_complaint, suggested_questions, status
  ) VALUES (
    appt_id, demo_pat_id, doc_staff_id, 'MEDIUM',
    '3-day history of moderate productive cough with fever and chest discomfort.',
    '["Are you experiencing any wheezing or difficulty breathing when lying down?", "Have you noticed any discolored sputum or blood when coughing?", "Have you taken any over-the-counter fever reducers and did they help?"]'::JSONB,
    'COMPLETED'
  )
  ON CONFLICT (appointment_id) DO NOTHING;

  -- 11. Doctor Post-Visit Clinical Note
  INSERT INTO public.post_visit_notes (
    appointment_id, patient_id, doctor_id, clinical_notes, diagnosis, follow_up_instr, created_by
  ) VALUES (
    appt_id, demo_pat_id, doc_staff_id,
    'Patient evaluated for acute lower respiratory symptoms. Temperature 38.2C, BP 120/80, SpO2 97% on room air. Chest auscultation reveals mild bilateral rhonchi with no consolidation. Diagnosed with acute bronchitis. Prescribed Amoxicillin 500mg TID for 7 days and Paracetamol 650mg PRN. Recommended 24h inpatient ward observation for monitoring.',
    'Acute Bronchitis (J20.9)',
    'Stay well hydrated. Take complete antibiotic course with food. Return immediately if high fever recurs or breathlessness worsens. Follow-up clinic review in 7 days.',
    doctor_uid
  )
  ON CONFLICT (appointment_id) DO UPDATE SET
    clinical_notes = EXCLUDED.clinical_notes,
    diagnosis = EXCLUDED.diagnosis;

  SELECT note_id INTO note_id FROM public.post_visit_notes WHERE appointment_id = appt_id;

  -- 12. AI Post-Visit Summary for Patient
  INSERT INTO public.post_visit_summaries (
    appointment_id, patient_id, doctor_id, note_id,
    visit_explanation, medication_sched, follow_up_steps, instructions, status
  ) VALUES (
    appt_id, demo_pat_id, doc_staff_id, note_id,
    'During your visit today, Dr. Evelyn Reed diagnosed you with Acute Bronchitis, an inflammation of the airways that causes cough and fever. Your lung oxygen levels are healthy at 97%.',
    '• Amoxicillin 500mg: Take 1 capsule 3 times daily (Morning 8am, Afternoon 2pm, Night 8pm) after meals for 7 full days.
• Paracetamol 650mg: Take 1 tablet every 6 hours as needed if fever rises above 100°F.',
    'Rest in the hospital observation room today. Schedule a follow-up appointment in 7 days if symptoms do not fully resolve.',
    'Drink plenty of warm fluids. Avoid cold drafts and smoke exposure.',
    'COMPLETED'
  )
  ON CONFLICT (appointment_id) DO NOTHING;

  -- 13. Medical Record
  INSERT INTO public.medical_records (
    patient_id, doctor_id, symptoms, diagnosis, treatment_plan, medicine_prescribed, visit_date, visit_status, patient_status
  ) VALUES (
    demo_pat_id, doc_staff_id,
    'Fever, dry cough, chest tightness',
    'Acute Bronchitis (J20.9)',
    'Antibiotic therapy, antipyretics, supportive fluids, inpatient observation',
    'Amoxicillin 500mg TID x 7d, Paracetamol 650mg PRN x 5d',
    CURRENT_DATE, 'Completed', 'Admitted for Observation'
  )
  RETURNING record_id INTO rec_id;

  -- 14. E-Prescription & Items
  INSERT INTO public.prescriptions (
    appointment_id, patient_id, doctor_id, record_id, issue_date, expiry_date, notes, status
  ) VALUES (
    appt_id, demo_pat_id, doc_staff_id, rec_id, CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days',
    'Take antibiotics with full glass of water. Complete entire course.',
    'DISPENSED'
  )
  RETURNING prescription_id INTO rx_id;

  INSERT INTO public.prescription_items (
    prescription_id, medicine_id, medicine_name, dosage, frequency, duration_days, quantity, instructions
  ) VALUES
    (rx_id, med_amox_id, 'Amoxicillin 500mg', '500mg', 'THREE_TIMES_DAILY', 7, 21, 'Take 1 capsule every 8 hours with meals'),
    (rx_id, med_para_id, 'Paracetamol 650mg', '650mg', 'AS_NEEDED', 5, 10, 'Take 1 tablet every 6 hours if fever exceeds 100F')
  ON CONFLICT DO NOTHING;

  -- 15. Medication Reminders Schedule
  INSERT INTO public.medication_reminders (
    patient_id, prescription_id, medicine_name, dosage, scheduled_date, scheduled_time, status
  ) VALUES
    (demo_pat_id, rx_id, 'Amoxicillin 500mg', '500mg', CURRENT_DATE, '08:00:00', 'SENT'),
    (demo_pat_id, rx_id, 'Amoxicillin 500mg', '500mg', CURRENT_DATE, '14:00:00', 'SENT'),
    (demo_pat_id, rx_id, 'Amoxicillin 500mg', '500mg', CURRENT_DATE, '20:00:00', 'PENDING'),
    (demo_pat_id, rx_id, 'Amoxicillin 500mg', '500mg', CURRENT_DATE + INTERVAL '1 day', '08:00:00', 'PENDING')
  ON CONFLICT DO NOTHING;

  -- 16. Pharmacy Dispensing Record (Amoxicillin 21 units dispensed by James Wilson)
  INSERT INTO public.medicine_dispense (
    record_id, pharmacist_id, medicine_id, quantity, dispense_date, instructions
  ) VALUES (
    rec_id, pharm_staff_id, med_amox_id, 21, NOW(), 'Dispensed full 21 capsules course. Patient counseled on adherence.'
  )
  RETURNING dispense_id INTO disp_id;

  -- 17. Inpatient Ward Admission (Sarah Connor assigned to Nurse Clara Barton in Room 101)
  INSERT INTO public.admissions (
    patient_id, room_id, nurse_id, doctor_id, admission_date, discharge_date
  ) VALUES (
    demo_pat_id, room_101_id, nurse_staff_id, doc_staff_id, NOW(), NULL
  )
  ON CONFLICT DO NOTHING;

  -- 18. Billing & Itemized Invoice
  INSERT INTO public.billing (
    patient_id, total_price, status
  ) VALUES (
    demo_pat_id, 127.50, 'Pending'
  )
  RETURNING bill_id INTO bill_id;

  INSERT INTO public.billing_items (
    bill_id, item_type, item_id_ref, description, quantity, unit_price, total_price
  ) VALUES
    (bill_id, 'Consultation', appt_id, 'Specialist Clinical Consultation - Dr. Evelyn Reed', 1, 75.00, 75.00),
    (bill_id, 'Medication',   med_amox_id, 'Amoxicillin 500mg (21 capsules dispensed)', 21, 2.50, 52.50)
  ON CONFLICT DO NOTHING;

END $$;

COMMIT;
