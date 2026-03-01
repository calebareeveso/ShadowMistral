import { Mistral } from '@mistralai/mistralai'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

let __dirname
if (typeof __dirname === 'undefined') {
  // ESM equivalent if needed, though Webpack might polyfill it
  try {
    __dirname = path.dirname(fileURLToPath(import.meta.url))
  } catch (e) {
    __dirname = process.cwd()
  }
}

// Load renderer/.env into process.env if available (useful for dev in the main process)
const envPath = path.join(__dirname, '../../renderer/.env')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8')
    .split('\n')
    .forEach(line => {
      const trimLine = line.trim()
      if (trimLine && !trimLine.startsWith('#')) {
        const parts = trimLine.split('=')
        if (parts.length > 1) {
          const key = parts[0].trim()
          let val = parts.slice(1).join('=').trim()
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
          else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
          if (key && !process.env[key]) process.env[key] = val
        }
      }
    })
}

/**
 * Normalize model IDs like "mistralai/mistral-embed-2312" → "mistral-embed-2312"
 */
function normalizeModelId(id) {
  if (!id) return id
  return id.includes('/') ? id.split('/').pop() : id
}

let mistral = null
function getMistral() {
  if (!mistral) {
    if (!process.env.MISTRAL_API_KEY) {
      console.warn('Warning: MISTRAL_API_KEY missing in main process environment')
    }
    mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY ?? '' })
  }
  return mistral
}

const embedModelRaw = process.env.MISTRAL_EMBED_MODEL || 'mistralai/mistral-embed-2312'
const embedModel = normalizeModelId(embedModelRaw) || 'mistral-embed-2312'

export async function generateEmbedding(text) {
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY is not set. Cannot generate embeddings.')
  }
  const res = await getMistral().embeddings.create({
    model: embedModel,
    inputs: [text],
  })
  if (!res?.data?.[0]?.embedding) {
    throw new Error('Mistral embeddings response missing data[0].embedding')
  }
  return res.data[0].embedding
}

export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function generateText(prompt) {
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY is not set. Cannot generate text.')
  }
  const textModel = process.env.MISTRAL_TEXT_MODEL || 'mistral-small-latest'
  const res = await getMistral().chat.complete({
    model: textModel,
    messages: [{ role: 'user', content: prompt }],
  })
  const content = res?.choices?.[0]?.message?.content
  if (content === undefined || content === null) {
    throw new Error('Mistral chat response missing choices[0].message.content')
  }
  if (Array.isArray(content)) {
    return content.map(p => (typeof p === 'string' ? p : (p?.text ?? ''))).join('')
  }
  return (content ?? '').toString()
}
