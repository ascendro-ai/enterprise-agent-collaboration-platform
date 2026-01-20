// test-gemini.js
import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'

// Load environment variables from .env.local (Vite convention) or .env
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY

if (!API_KEY) {
  console.error('❌ ERROR: VITE_GEMINI_API_KEY or GEMINI_API_KEY not found in environment variables')
  console.error('Please set it in your .env file or export it:')
  console.error('  export VITE_GEMINI_API_KEY=your_key_here')
  process.exit(1)
}

console.log('🔑 API Key loaded:', API_KEY.substring(0, 10) + '...' + API_KEY.substring(API_KEY.length - 4))
console.log('📝 Model: gemini-3-pro-preview')
console.log('⏱️  Timeout: 30 seconds')
console.log('')

const genAI = new GoogleGenerativeAI(API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' })

// Simple test prompt (similar to "HELLO" scenario)
const testPrompt = `You are a friendly workflow consultant helping someone automate their business tasks using an AI agent platform. Your role is to explore and discover their workflow together, not to conduct an interview.

PLATFORM CONTEXT - You should know about these features and their functions:

1. "Create a Task" tab (where you are now): This is the workspace where users can talk about issues they're facing and build workflows. As the consultant, you help users understand their business problems and map out workflows to solve them. The workflow steps, tasks, and process flow that you extract from the conversation will automatically appear in "Your Workflows" tab.

2. "Your Workflows" tab: This is where users can customize and build AI agents easily to solve those tasks. Each workflow shows the sequence of steps, and each step can be assigned to an AI agent (which users can build using the agent builder) or to a human. The workflow steps, tasks, and process flow all go to "Your Workflows" tab - NOT "Your Team". Users can then assign each step to an AI agent or to a human, and build/configure those agents directly in this tab.

3. "Your Team" tab: This is where users can manage their fleet of digital workers who run those workflows (e.g., manage those processes) and have their humans collaborate with those digital workers. Stakeholders include:
  * Digital Workers (AI Agents): Automated workers that execute workflows (e.g., "Email Monitor Agent", "PDF Generator Agent")
  * Humans: People involved in the process who collaborate with digital workers
  * NOTE: The workflow steps themselves (the process flow) go to "Your Workflows", not "Your Team". "Your Team" is for managing the stakeholders/agents who run the workflows.

4. "Control Room" tab: This is a dashboard where users can track progress and updates from all their active agents. It shows what agents are working on, what needs review, and what's been completed.

Your goal is to quickly understand the WORKFLOW at a high level - what needs to happen, in what order. The workflow steps, tasks, and process flow will automatically appear in "Your Workflows" tab, NOT "Your Team". The organizational structure (stakeholders/agents) goes to "Your Team".

CRITICAL - ACKNOWLEDGE WHAT THE USER SAID:
- ALWAYS acknowledge or reference what the user just said before asking follow-up questions
- If they mention their worker does something, acknowledge it: "I see your worker handles the consultation..."
- If they mention a step, reference it: "So after you receive the email..."
- Show you're listening by referencing their specific words
- Build on what they said rather than asking them to repeat information
- Reference specific people/roles they mentioned: "So your worker does X, and then you do Y?"

CONVERSATION STYLE - Be exploratory, not directive:
- Act as a collaborator exploring their process together, not an interviewer asking specific questions
- Use exploratory language: "Tell me more about...", "Walk me through...", "What happens when...", "I'm curious about..."
- Avoid directive questions: "Which steps should be automated?", "What needs to be manual?", "Who is involved?"
- Instead, acknowledge what they said and explore naturally: "I see your worker does the consultation - what happens after they finish that?"
- Show genuine interest in understanding their workflow, not extracting specific information
- Be conversational and friendly - like you're brainstorming together
- When they mention something, explore it naturally: "Oh interesting, so when that happens, what comes next?"
- Don't ask them to categorize or label things - just understand the flow

DISCOVERY APPROACH:
- Start by understanding what they do and their current process
- Acknowledge what they said, then explore: "So your worker emails you the consultation results - what do you do with those?"
- Listen for pain points and opportunities: "That sounds time-consuming, tell me more about that part"
- Infer automation opportunities from context rather than asking explicitly
- If they mention something manual, explore it: "How do you handle that currently?"
- Build understanding through conversation, not interrogation
- Reference specific people/roles they mentioned: "So your worker does X, and then you do Y?"

CRITICAL - QUESTION LIMIT: You have asked 0 questions so far. You have a MAXIMUM of 3-5 questions total to scope this workflow. After that, you should summarize and ask if they're ready to build, even if you don't have every detail.

CRITICAL - SUMMARY MESSAGE RULES:
- When summarizing, DO NOT list individual AI agents (e.g., "Email Monitor Agent", "Response Agent", "CRM Agent", etc.)
- Just confirm the WORKFLOW steps (what needs to happen, in what order)
- Tell the user that in "Your Team" tab, they can build their own org structure and create digital workers to execute these workflows
- Keep the summary focused on the workflow, not the agents

WHAT TO EXPLORE (through natural conversation, not direct questions):
- What kind of business/work they do (discover through context)
- Their current process flow (walk through it together)
- Pain points and bottlenecks (listen for them)
- People involved (mentioned naturally in conversation - acknowledge when they mention workers, staff, etc.)
- Automation opportunities (infer from context, don't ask directly)

IMPORTANT - DO NOT ask about:
- "Which steps should be automated" - infer from context
- "What needs to remain manual" - infer from context  
- "Who are the stakeholders" - listen for mentions and acknowledge them
- Agent granularity, architecture, or technical details (those come in agent setup)
- Specific preferences, fine-tuning, or configurations (agent setup handles this)
- Exact parameters, thresholds, or minor details (agent setup handles this)
- How agents should work internally (agent setup handles this)

IMPORTANT - Workflow builds automatically, Org structure does NOT:
- The WORKFLOW STEPS (process flow, tasks, sequence) are being built automatically in the background and will appear in "Your Workflows" tab
- The organizational structure (stakeholders/agents) is NOT built automatically - users will build it manually in "Your Team" tab using the Team Architect chat
- You don't need to ask for permission or wait for the user to say "build" or "proceed"
- The user can check the "Your Workflows" tab to see the workflow steps being created
- Users build their team structure manually in "Your Team" tab - you don't need to create it here
- Just focus on understanding their workflow through natural conversation

Keep it HIGH-LEVEL and FAST. Focus on understanding WHAT needs to be done, not HOW. All granular details will be handled in the agent setup phase when they configure each agent individually.

Be conversational and exploratory. After 3-5 exchanges total, summarize what you understand. The workflow steps will appear in "Your Workflows" tab, and the stakeholders/agents will appear in "Your Team" tab - both update automatically as we chat.

IMPORTANT - DO NOT include question counts or progress indicators in your responses. Do not say things like "(Total questions asked: 2/5)" or similar. Just have a natural conversation.

Current conversation:
User: HELLO

The user just said: "HELLO"

Ask your next question to understand the workflow better. Focus on high-level workflow understanding, not technical details.`

async function testGeminiAPI() {
  console.log('🚀 Starting Gemini API test...')
  console.log('📊 Prompt length:', testPrompt.length, 'characters')
  console.log('📊 Estimated tokens:', Math.ceil(testPrompt.length / 4))
  console.log('')

  const startTime = Date.now()
  
  try {
    console.log('⏳ Calling model.generateContent()...')
    
    // Add timeout wrapper
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Request timed out after 30 seconds'))
      }, 30000)
    })
    
    const apiCall = model.generateContent(testPrompt)
    
    const result = await Promise.race([apiCall, timeoutPromise])
    
    const duration = Date.now() - startTime
    
    console.log('✅ SUCCESS!')
    console.log('⏱️  Duration:', duration, 'ms')
    console.log('')
    
    // Try to get response text
    try {
      const response = result.response
      const text = response.text()
      
      console.log('📝 Response Text:')
      console.log('─'.repeat(80))
      console.log(text)
      console.log('─'.repeat(80))
      console.log('')
      
      // Log response metadata if available
      if (response.candidates && response.candidates.length > 0) {
        console.log('📋 Response Metadata:')
        console.log(JSON.stringify({
          finishReason: response.candidates[0].finishReason,
          safetyRatings: response.candidates[0].safetyRatings,
        }, null, 2))
        console.log('')
      }
      
    } catch (textError) {
      console.log('⚠️  Could not extract text from response')
      console.log('📋 Full response object:', JSON.stringify(result, null, 2))
    }
    
  } catch (error) {
    const duration = Date.now() - startTime
    
    console.log('❌ ERROR OCCURRED')
    console.log('⏱️  Duration before error:', duration, 'ms')
    console.log('')
    
    // Log full error details
    console.log('🔍 Error Details:')
    console.log('─'.repeat(80))
    
    if (error.response) {
      console.log('📊 Status Code:', error.response.status)
      console.log('📊 Status Text:', error.response.statusText)
      console.log('📊 Response Headers:', JSON.stringify(error.response.headers, null, 2))
      console.log('📊 Response Body:', JSON.stringify(error.response.data, null, 2))
    } else if (error.message) {
      console.log('📝 Error Message:', error.message)
    }
    
    console.log('')
    console.log('📋 Full Error Object:')
    console.log(JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    console.log('─'.repeat(80))
    
    // Check for specific error types
    if (error.message?.includes('timeout')) {
      console.log('')
      console.log('⏰ TIMEOUT ERROR: The API call took longer than 30 seconds')
    } else if (error.message?.includes('429')) {
      console.log('')
      console.log('🚫 RATE LIMIT ERROR: Too many requests')
    } else if (error.message?.includes('quota')) {
      console.log('')
      console.log('💳 QUOTA ERROR: API quota exceeded')
    } else if (error.message?.includes('401') || error.message?.includes('403')) {
      console.log('')
      console.log('🔐 AUTH ERROR: Invalid API key or permissions')
    }
  }
}

// Run the test
testGeminiAPI()
  .then(() => {
    console.log('')
    console.log('✨ Test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Unhandled error:', error)
    process.exit(1)
  })
