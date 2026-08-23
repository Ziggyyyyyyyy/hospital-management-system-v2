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

const DEMO_USER_IDS = [
  '00000000-0000-4000-a000-000000000001', // demo-admin@hms.local
  '00000000-0000-4000-a000-000000000002', // demo-doctor@hms.local
  '00000000-0000-4000-a000-000000000003', // demo-nurse@hms.local
  '00000000-0000-4000-a000-000000000004', // demo-pharmacist@hms.local
  '00000000-0000-4000-a000-000000000005', // demo-patient@hms.local
]

export async function cleanDemoDataset() {
  console.log('🧹 Cleaning up Demo Test Dataset...')
  const supabase = createServiceClientRaw()

  // 1. Delete demo batch medications
  await supabase.from('medicine_stock').delete().like('batch_number', 'DEMO-BATCH-%')

  // 2. Cascade delete demo users (Foreign keys on delete cascade will clean up medical_staff, patients, appointments, etc.)
  for (const userId of DEMO_USER_IDS) {
    try {
      await supabase.from('users').delete().eq('user_id', userId)
      await supabase.auth.admin.deleteUser(userId)
    } catch (e: any) {
      console.warn(`Cleanup notice for user ${userId}:`, e.message)
    }
  }

  console.log('✅ Demo test dataset cleaned up successfully.')
}

if (require.main === module || process.argv[1]?.includes('clean-demo-dataset')) {
  cleanDemoDataset().catch((err) => {
    console.error('❌ Failed to clean demo dataset:', err)
    process.exit(1)
  })
}
