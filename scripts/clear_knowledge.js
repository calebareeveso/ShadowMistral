/**
 * scripts/clear_knowledge.js
 *
 * Clears the ShadowMistral RAG knowledge store.
 * Run: node scripts/clear_knowledge.js
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// Electron stores userData at ~/Library/Application Support/<appName>
// In dev mode nextron appends " (development)"
const appName = 'my-nextron-app'
const home = process.env.HOME || process.env.USERPROFILE
const candidates = [
  path.join(home, 'Library', 'Application Support', `${appName} (development)`, 'knowledge_store.json'),
  path.join(home, 'Library', 'Application Support', appName, 'knowledge_store.json'),
]

let cleared = false
for (const dbPath of candidates) {
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath)
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
    const count = Array.isArray(data) ? data.length : 0
    fs.writeFileSync(dbPath, '[]', 'utf-8')
    console.log(`✅ Cleared ${count} entries from: ${dbPath}`)
    console.log(`   (was ${(stat.size / 1024).toFixed(1)} KB)`)
    cleared = true
  }
}

if (!cleared) {
  console.log('ℹ️  No knowledge_store.json found — nothing to clear.')
  console.log('   Looked in:')
  candidates.forEach(p => console.log(`   - ${p}`))
}
