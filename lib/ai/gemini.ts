import { GoogleGenAI } from '@google/genai'

let cachedClient: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  cachedClient = new GoogleGenAI({ apiKey })
  return cachedClient
}

export async function generateAIResponse(prompt: string): Promise<string> {
  try {
    const ai = getClient()
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
    })

    return response.text ?? ''
  } catch (error) {
    console.error('Gemini API error:', error)

    if (error instanceof Error) {
      throw new Error(error.message)
    }

    throw new Error(String(error))
  }
}