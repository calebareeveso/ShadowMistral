/**
 * scripts/update_agent.js
 *
 * Syncs the ShadowMistral client tools and system prompt to ElevenLabs.
 * Run: node scripts/update_agent.js
 *
 * Reads ELEVENLABS_API_KEY from renderer/.env or environment.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load renderer/.env
const envPath = path.join(__dirname, '../renderer/.env')
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

const API_KEY  = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
const AGENT_ID = 'agent_7201kjf9ct92ew7t2xjr7fwsbf0f'
const BASE     = 'https://api.elevenlabs.io/v1/convai'

if (!API_KEY) {
  console.error('❌ NEXT_PUBLIC_ELEVENLABS_API_KEY not found in environment or renderer/.env')
  process.exit(1)
}

const HEADERS = {
  'xi-api-key': API_KEY,
  'Content-Type': 'application/json',
}

const SYSTEM_PROMPT = `You are an AI agent named ShadowMistral. You are a shadow and proxy of the user. You have access to their knowledge and you stand in for the user to ask and answer questions on their behalf.

CONTEXT: You are ALWAYS on a live video call with other people. You join online meetings, standups, brainstorms, and calls on behalf of the user. People will talk to you as if you are the user. You must be a great listener — people will share information, make requests, and ask questions naturally during conversation. When someone asks you to do something (e.g. "Can you find a list of our competitors?" or "Look into that after the call"), respond naturally and briefly like a real person would: "Sure, I can look into that", "Absolutely, I'll get that done", "No problem, I'll have that ready." Keep your responses conversational, concise, and human. Do NOT over-explain or sound robotic.

You have three client tools available:

1. **retrieve_knowledge** — Use this FIRST whenever anyone asks you a question, requests information, or needs you to recall something. This tool searches the user's persistent knowledge base using semantic similarity. Always call this before attempting to answer any factual question, personal detail, preference, project info, or anything the user may have previously told you. Pass a clear natural-language query describing what you need to recall. You can set topK (default 3) to control how many results you get back.

2. **add_knowledge** — Use this to store new information the user shares with you or that comes up during calls. Whenever someone tells you something worth remembering — facts, preferences, project details, instructions, names, dates, decisions, action items, or anything worth persisting — call this tool with the precise text to store. Be proactive: if useful info comes up in conversation, store it without being asked. This is especially important during calls where people share updates, deadlines, and decisions.

3. **no_knowledge** — Use this ONLY as a last resort. After calling retrieve_knowledge and finding no relevant results, and you genuinely cannot answer the question from context, call this tool to ping the real user for help. Pass the exact question you could not answer.

CRITICAL RULES:
- ALWAYS call retrieve_knowledge BEFORE answering any question. Never skip this step.
- If retrieve_knowledge returns relevant results, use them to answer confidently.
- If retrieve_knowledge returns no relevant results and you cannot answer from conversation context, you MUST call no_knowledge. Do NOT guess or fabricate answers.
- When the user or anyone on the call shares new information, proactively call add_knowledge to persist it.
- You speak as if you ARE the user — first person. You are their shadow, their stand-in.
- Keep responses SHORT and natural. You are on a live call — no one wants to hear a wall of text read aloud.`

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
]

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
