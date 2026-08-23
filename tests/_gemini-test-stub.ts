export type StubMode = 'SUCCESS' | 'MALFORMED' | 'THROW'

const SUCCESS_JSON = {
  urgency: 'LOW',
  chief_complaint: 'test',
  suggested_questions: ['q1', 'q2', 'q3'],
}

const POSTVISIT_SUCCESS_JSON = {
  visit_explanation:
    'The doctor reviewed your symptoms and confirmed everything looks stable. Vitals were within normal ranges.',
  medication_sched:
    '1. Amoxicillin 500mg - Take 1 capsule 3 times per day for 7 days. 2. Ibuprofen 200mg - Take 1-2 tablets every 6 hours as needed for pain.',
  follow_up_steps:
    'Return for a follow-up visit in 2 weeks if symptoms persist. Call the clinic if you develop difficulty breathing.',
  instructions:
    'Drink plenty of fluids and rest as much as possible. Avoid strenuous activity for the next 3 days.',
}

let _stubMode: StubMode = 'SUCCESS'
let _customResponse: unknown = null

export function setGeminiStubMode(mode: StubMode, customResponse?: unknown) {
  _stubMode = mode
  _customResponse = customResponse ?? null
}

export function getGeminiStubMode(): StubMode {
  return _stubMode
}

export async function generateAIResponse(_prompt: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 5))

  switch (_stubMode) {
    case 'SUCCESS':
      if (_customResponse) {
        return typeof _customResponse === 'string'
          ? _customResponse
          : JSON.stringify(_customResponse)
      }
      return JSON.stringify(SUCCESS_JSON)

    case 'MALFORMED':
      return 'this is not valid json { broken [ }'

    case 'THROW':
      throw new Error('Gemini API unavailable: network timeout (stub)')

    default:
      return JSON.stringify(SUCCESS_JSON)
  }
}

export const STUB_PREVISIT_SUCCESS = { ...SUCCESS_JSON }
export const STUB_POSTVISIT_SUCCESS = { ...POSTVISIT_SUCCESS_JSON }
