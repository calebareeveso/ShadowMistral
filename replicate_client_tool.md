# ShadowMistral Replication Guide

This document provides exact instructions and code snippets for another AI coding agent to replicate the `clientTools` functionality, RAG capability, and ElevenLabs agent setup for an AI agent named **ShadowMistral**. ShadowMistral acts as a proxy (shadow) of the user, having their knowledge to answer questions, but if the AI cannot answer something, it pings the user.

## 1. RAG Capability Implementation

The agent requires continuous access to a knowledge base. You must replicate the specific Gemini embedding and vector search functions exactly.

### Required: `main/services/gemini.js`
This file connects to Google's Gemini to handle text/image generation and embeddings. Place the exact matching code snippet below in your replicated codebase:

```javascript
import { GoogleGenAI } from '@google/genai'
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

let ai = null
function getAI() {
  if (!ai) {
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      console.warn('Warning: NEXT_PUBLIC_GEMINI_API_KEY missing in main process environment')
    }
    ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' })
  }
  return ai
}

export async function generateEmbedding(text) {
  const result = await getAI().models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
  })
  return result.embeddings[0].values
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
  const result = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  })
  return result.text
}
```

### Required: `main/services/knowledge.js`
This file implements the RAG memory store using the cosine similarity check. Place the exact matching code snippet below in your codebase:

```javascript
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
```

## 2. ElevenLabs `clientTools` for ShadowMistral frontend

Inside the frontend component (e.g. `renderer/pages/home.jsx`), set up the ElevenLabs `useConversation` hook with the ShadowMistral client tools (`add_knowledge`, `retrieve_knowledge`, and `no_knowledge`).

```javascript
  const conversation = useConversation({
    clientTools: {
      add_knowledge: async ({ text }) => {
        console.log('[add_knowledge] Storing:', text?.slice(0, 80))
        isThinkingRef.current = true
        try {
          const result = await window.ipc.invoke('add-knowledge', text)
          return result?.message || 'Knowledge stored.'
        } catch (err) {
          console.error('[add_knowledge] Error:', err)
          return 'Failed to store knowledge.'
        } finally {
          isThinkingRef.current = false
        }
      },

      retrieve_knowledge: async ({ query, topK }) => {
        console.log('[retrieve_knowledge] Query:', query)
        isThinkingRef.current = true
        try {
          const results = await window.ipc.invoke('retrieve-knowledge', query, topK || 3)
          if (!results || results.length === 0) return 'No relevant knowledge found.'
          return results.map((r, i) => `[${i + 1}] ${r.text}`).join('\n\n')
        } catch (err) {
          console.error('[retrieve_knowledge] Error:', err)
          return 'Failed to retrieve knowledge.'
        } finally {
          isThinkingRef.current = false
        }
      },

      no_knowledge: async ({ query }) => {
        console.log('[no_knowledge] Ping! Sending query to user because LLM could not answer:', query);
        // This tool simply pings the console when the AI doesn't know the answer 
        // and cannot find an answer in the retrieved knowledge.
        return "Pinged the user successfully. Please wait for the user to respond.";
      }
    },
    // Include onConnect, onDisconnect, onMessage handlers here...
  })
```

## 3. Updating the Agent in ElevenLabs

To configure this agent in ElevenLabs, use an update script (similar to `scripts/update_agent.js`).

### How the API configuration works:
1. Create or update each tool individually via `POST/PATCH /v1/convai/tools`. Each tool gets a stable workspace ID.
2. Assign those IDs to the agent via `PATCH /v1/convai/agents/{id}` by setting `conversation_config.agent.prompt.tool_ids` to an array of those IDs. (Note: using inline `prompt.tools` on PATCH gets silently ignored, you must use ID patches).

### System Prompt for ShadowMistral:
The system prompt should define ShadowMistral. Inject the following into the update script:

```javascript
const SYSTEM_PROMPT = `You are an AI agent named ShadowMistral. You are a shadow and proxy of the user. You have access to their knowledge and you stand in for the user to ask and answer questions on their behalf. You try to answer any questions by looking up your knowledge base. 

CRITICAL: If you cannot answer a question based on your retrieved knowledge, you MUST NOT guess or invent an answer. You MUST ping the user by immediately calling the \`no_knowledge\` client tool and relaying their query so the user can assist.`;
```

### Required `TOOLS` JSON Definition Payload:
Define these tool configurations in your API syncing script:

```javascript
const TOOLS = [
  {
    name: 'add_knowledge',
    description: 'Stores a piece of information into the persistent knowledge base.',
    response_timeout_secs: 20,
    parameters: {
      type: 'object',
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          description: 'The precise information to store.',
        },
      },
    },
  },
  {
    name: 'retrieve_knowledge',
    description: 'Searches the persistent knowledge base for information relevant to a query. Call this before answering any question about personal details, facts, or proxy memories. Never fabricate — call this first.',
    response_timeout_secs: 20,
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'A natural-language question describing what to recall.',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return. Defaults to 3.',
        },
      },
    },
  },
  {
    name: 'no_knowledge',
    description: 'Call this ONLY when you cannot answer a question or find the answer in your retrieved knowledge. This acts as a proxy bridge, pinging the user for help.',
    response_timeout_secs: 10,
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'The exact question that you could not answer.',
        },
      },
    },
  }
];
```

### Required Syncing Script (`scripts/update_agent.js`)
To actually sync the `TOOLS` and `SYSTEM_PROMPT` to the ElevenLabs agent, you will need a fully functional syncing script with helper functions that interact with the ElevenLabs API. 

Create a script (e.g., `scripts/update_agent.js`) and include the following code, combining it with the `SYSTEM_PROMPT` and `TOOLS` definitions above:

```javascript
const API_KEY  = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = 'YOUR_AGENT_ID_HERE'; // Replace with the ShadowMistral Agent ID
const BASE     = 'https://api.elevenlabs.io/v1/convai'

const HEADERS = {
  'xi-api-key': API_KEY,
  'Content-Type': 'application/json',
}

// ... Insert SYSTEM_PROMPT string here ...
// ... Insert TOOLS array here ...

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function listWorkspaceTools() {
  const res = await fetch(`${BASE}/tools`, { headers: HEADERS })
  if (!res.ok) throw new Error(`listWorkspaceTools failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.tools // [{ id, tool_config: { name, ... } }]
}

async function createTool(toolDef) {
  const res = await fetch(`${BASE}/tools`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      tool_config: {
        type: 'client',
        expects_response: true,
        ...toolDef,
      },
    }),
  })
  if (!res.ok) throw new Error(`createTool(${toolDef.name}) failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  console.log(`  ✅ Created  "${toolDef.name}" → ${data.id}`)
  return data.id
}

async function updateTool(id, toolDef) {
  const res = await fetch(`${BASE}/tools/${id}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({
      tool_config: {
        type: 'client',
        expects_response: true,
        ...toolDef,
      },
    }),
  })
  if (!res.ok) throw new Error(`updateTool(${toolDef.name}) failed: ${res.status} ${await res.text()}`)
  console.log(`  ✅ Updated  "${toolDef.name}" → ${id}`)
  return id
}

async function patchAgent(toolIds, systemPrompt) {
  const res = await fetch(`${BASE}/agents/${AGENT_ID}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            prompt: systemPrompt,
            tool_ids: toolIds,
          },
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`patchAgent failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.conversation_config.agent.prompt.tools.map(t => t.name)
}

// ─── Main Execution ───────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Fetching existing workspace tools...')
  const existing = await listWorkspaceTools()
  const existingByName = Object.fromEntries(existing.map(t => [t.tool_config.name, t.id]))
  console.log('   Found:', Object.keys(existingByName).join(', ') || '(none)')

  console.log('\n🔧 Syncing tools...')
  const toolIds = []
  for (const toolDef of TOOLS) {
    const existingId = existingByName[toolDef.name]
    const id = existingId
      ? await updateTool(existingId, toolDef)
      : await createTool(toolDef)
    toolIds.push(id)
  }

  console.log('\n🤖 Patching agent...')
  const assignedTools = await patchAgent(toolIds, SYSTEM_PROMPT)
  console.log('   Tools on agent:', assignedTools.join(', '))
  console.log('\n✅ Agent updated successfully.')
}

main().catch(err => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
```

By putting these building blocks together in a script like `scripts/update_agent.js`, you can safely deploy and update your newly generated client tools and system prompt directly to ElevenLabs, fully enabling ShadowMistral's architecture and proxy features.
