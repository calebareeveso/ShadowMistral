# ShadowMistral
> Your ultimate digital proxy. Never break focus for a status update again.

ShadowMistral is a local, agentic meeting proxy designed for engineers. By combining ultra-realistic 2.5D avatars, near-instant voice cloning, and local RAG memory, your AI proxy can attend meetings, answer routine standup questions in your voice, and even execute technical directives post-meeting—all autonomously.

## Core Features

### 1. Single-Image 2.5D Avatar Generation
Transform a single, flat portrait photo into a live, fully-animated 2.5D talking avatar that perfectly visualizes your digital proxy. 
* **Solves**: The Friction of Digital Presence. Eliminates the need for 3D scanning, expensive mocap rigs, or specialized equipment to build a responsive virtual clone.
* **Technical Challenge**: It turns your flat image into a 2.5D face by detecting 71 facial landmarks to deform a base 3D mesh to match your facial geometry, and then projecting your original photo onto that mesh using UV coordinates. It maps lip movements to real-time audio amplitudes.

### 2. Near-Instant Voice Cloning
Capture and synthesize an ultra-realistic clone of your voice, retaining your unique vocal timbre from just a brief audio sample.
* **Solves**: Synthetic Uncanny Valley. Prevents your AI proxy from sounding like a generic text-to-speech engine, maintaining a natural, human-like presence in meetings.
* **Technical Challenge**: Integrating ElevenLabs' low-latency voice cloning APIs over HTTP/WebSockets, managing streaming audio buffers, and dynamically syncing the audio output byte streams with the UI's facial mesh deformation.

### 3. Context-Aware Proxy (RAG Memory)
Feed your digital proxy a summary of Jira tickets, recent commits, and architecture documents so it can autonomously answer routine standup questions in your cloned voice.
* **Solves**: The Flow State Killer. Engineers no longer need to break deep work focus just to give a 30-second status update on a morning call.
* **Technical Challenge**: Implementing a local Retrieval-Augmented Generation (RAG) loop to parse incoming meeting audio, embed context via Mistral APIs, and utilize Mistral's reasoning to generate accurate dialog without hallucinating.

### 4. The "Ping" Failsafe
If the AI proxy encounters a question outside its context, it politely states "Let me ping them on that" and silently alerts you. Click one button to instantly drop into the call.
* **Solves**: The AI Trust Barrier. Overcomes the fear of deploying AI in professional settings by keeping the human safely in the loop as the ultimate fallback.
* **Technical Challenge**: Engineering complex A/V routing via OBS Virtual Camera and BlackHole audio pipelines, orchestrating seamless UI/IPC state handoffs between the autonomous WebGL avatar loop and the live hardware webcam feed.

### 5. Interactive Transcript Chatting
Treat your ongoing or past meetings like a live database by chatting directly with the transcript. Ask Mistral questions about what was discussed, decisions made, or what you missed while AFK.
* **Solves**: Context Degradation. Prevents vital technical context from slipping through the cracks during dense discussions and eliminates the distraction of manual note-taking.
* **Technical Challenge**: Building a continuous vector embedding pipeline for live audio transcriptions, mapping semantic utterance chunks, and utilizing cosine similarity for high-speed retrieval to pipe into Mistral's context window.

### 6. Independent Agentic Web Search
Empowers the AI proxy with the ability to autonomously browse the live internet to retrieve documentation, read API specs, or answer questions requiring up-to-date knowledge.
* **Solves**: AI Knowledge Cutoff. Prevents the meeting proxy from being strictly bottlenecked by its pre-training data or local uploaded files.
* **Technical Challenge**: Integrating Stagehand (headless browser automation) with Mistral's system function-calling, enabling dynamic sub-agent orchestration to navigate DOM trees, parse layout logic, and extract targeted answers on the fly from the Node process.

### 7. Agentic Execution with Claude Code
Post-meeting, the system parses the transcript, extracts technical action items, and connects directly to your local terminal using Claude Code to autonomously execute tasks, search the codebase, and write code.
* **Solves**: The Post-Meeting Chore List. Eliminates the manual effort required to transfer discussed technical decisions into actual shell commands and repository modifications.
* **Technical Challenge**: Establishing a robust IPC bridge between the Electron Main process and local PTY environments, managing child-process lifecycles, parsing recursive ANSI outputs, and actively piping I/O to navigate Anthropic's terminal-native Claude Code TUI execution loop.

## Setup & Installation

**Prerequisites:**
- Node.js \`v18+\`
- OBS Studio (for the virtual camera routing)
- BlackHole (for MacOS audio routing)
- Claude Code CLI installed globally (\`npm install -g @anthropic-ai/claude-code\`)

### 1. Install Dependencies
\`\`\`bash
npm install
# or
yarn install
\`\`\`

### 2. Environment Variables
Create a \`.env\` file inside the \`renderer/\` directory and configure your API keys:
\`\`\`env
NEXT_PUBLIC_ELEVENLABS_API_KEY=your_elevenlabs_key
NEXT_PUBLIC_MISTRAL_API_KEY=your_mistral_key
NEXT_PUBLIC_FAL_KEY=your_key_id:your_key_secret
\`\`\`

### 3. Run the Development Server
\`\`\`bash
npm run dev
# or
yarn dev
\`\`\`

### 4. Build for Production
\`\`\`bash
npm run build
# or
yarn build
\`\`\`

## A/V Routing (OBS & BlackHole)
To route the AI's visual and audio output into a meeting client (Zoom, Meet, Teams):
1. **Video**: Use OBS Studio's "Virtual Camera". Capture the ShadowMistral application window in OBS and start the virtual camera.
2. **Audio**: Route the application's audio output through BlackHole (Virtual Audio Driver), and set BlackHole as your microphone input in your meeting client. 

*See \`OBS_SETUP.md\` for detailed instructions.*

---
*Built with Nextron, Mistral, ElevenLabs, Fal.ai, Stagehand, and Claude Code.*
