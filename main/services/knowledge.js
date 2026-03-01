import fs from 'fs'
import { generateEmbedding, cosineSimilarity } from './gemini.js'

function loadStore(dbPath) {
  if (!fs.existsSync(dbPath)) return []
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf-8')) } catch { return [] }
}

function saveStore(dbPath, store) {
  fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf-8')
}

export async function addKnowledge(text, dbPath) {
  const embedding = await generateEmbedding(text)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const item = { id, text, embedding, createdAt: new Date().toISOString() }
  const store = loadStore(dbPath)
  store.push(item)
  saveStore(dbPath, store)
  return { id, message: `Stored knowledge entry (id: ${id})` }
}

export async function retrieveKnowledge(query, topK = 3, dbPath) {
  const store = loadStore(dbPath)
  if (store.length === 0) return []
  const queryEmbedding = await generateEmbedding(query)
  const scored = store.map(item => ({
    ...item,
    score: cosineSimilarity(queryEmbedding, item.embedding),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).map(({ id, text, score, createdAt }) => ({ id, text, score, createdAt }))
}
