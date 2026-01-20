import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_CONFIG } from '../utils/constants'
import {
  logAgentBuildingStart,
  logAgentBuildingComplete,
} from './activityLogService'
import type {
  Workflow,
  WorkflowStep,
  AgentConfiguration,
  ConversationMessage,
  NodeData,
} from '../types'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY

if (!apiKey) {
  console.error('❌ VITE_GEMINI_API_KEY is not set in environment variables')
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

// Initialize model
const getModel = () => {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }
  return genAI.getGenerativeModel({ model: GEMINI_CONFIG.MODEL })
}

// Consultant chat - asks 3-5 questions to understand workflow
export async function consultWorkflow(
  conversationHistory: ConversationMessage[],
  questionCount: number
): Promise<{ response: string; isComplete: boolean }> {
  const maxQuestions = GEMINI_CONFIG.MAX_QUESTIONS

  // Get the last user message
  const lastUserMessage = conversationHistory
    .filter((msg) => msg.sender === 'user')
    .pop()
  const userInput = lastUserMessage?.text || ''

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const systemPrompt = `You are a friendly workflow consultant helping someone automate their business tasks using an AI agent platform. Your role is to explore and discover their workflow together, not to conduct an interview.

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

CRITICAL - QUESTION LIMIT: You have asked ${questionCount} questions so far. You have a MAXIMUM of 3-5 questions total to scope this workflow. After that, you should summarize and ask if they're ready to build, even if you don't have every detail.

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

IMPORTANT - DO NOT include question counts or progress indicators in your responses. Do not say things like "(Total questions asked: 2/5)" or similar. Just have a natural conversation.`

  // Detect if user is giving a FINAL confirmation (not just intermediate acknowledgment)
  const userInputLower = userInput.toLowerCase().trim()

  // Strong final confirmation phrases - these indicate the user is done
  const strongConfirmations = [
    'that works',
    'that\'s perfect',
    'sounds perfect',
    'sounds good',
    'looks good',
    'perfect',
    'great',
    'exactly',
    'correct',
    'that\'s correct',
    'sounds right',
    'that\'s right',
    'works for me',
    'perfect!',
    'great!',
    'sounds good!',
    'that works!'
  ]

  // Phrases that indicate user wants to move forward/build (standalone signals)
  const readinessPhrases = [
    'let\'s build',
    'let\'s build!',
    'ready to build',
    'ready to build!',
    'let\'s get started',
    'let\'s get started!',
    'let\'s go',
    'let\'s go!',
    'let\'s do it',
    'let\'s do it!',
    'ready',
    'ready!',
    'i\'m ready',
    'i\'m ready!',
    'ready to go',
    'ready to go!',
    'let\'s move forward',
    'let\'s move forward!',
    'move to workflows',
    'go to workflows',
    'check workflows',
    'look at workflows'
  ]

  // Check if the last assistant message was a summary/question
  const lastAssistantMessage = conversationHistory
    .filter(msg => msg.sender === 'system')
    .pop()
    
  const lastMessageWasSummary = lastAssistantMessage && (
    lastAssistantMessage.text.toLowerCase().includes('here\'s what i understand') ||
    lastAssistantMessage.text.toLowerCase().includes('here\'s what we discussed') ||
    lastAssistantMessage.text.toLowerCase().includes('does that sound right') ||
    lastAssistantMessage.text.toLowerCase().includes('are you ready') ||
    lastAssistantMessage.text.toLowerCase().includes('workflow steps') ||
    lastAssistantMessage.text.toLowerCase().includes('your workflows') ||
    lastAssistantMessage.text.toLowerCase().includes('ready to build')
  )

  // Check if we've already summarized recently (last 2 messages)
  const recentMessages = conversationHistory.slice(-2)
  const hasRecentSummary = recentMessages.some(msg => 
    msg.sender === 'system' && 
    (msg.text.toLowerCase().includes('here\'s what i understand') ||
     msg.text.toLowerCase().includes('here\'s what we discussed') ||
     msg.text.toLowerCase().includes('workflow steps') ||
     msg.text.toLowerCase().includes('1. you receive') ||
     msg.text.toLowerCase().includes('your workflows'))
  )

  // Check if user is indicating readiness to move forward (standalone signal)
  const isReadinessSignal = readinessPhrases.some(phrase => 
    userInputLower.includes(phrase)
  )

  // Final confirmation: either strong confirmation after summary, OR readiness signal
  const isFinalConfirmation = isReadinessSignal || (
    strongConfirmations.some(phrase => 
      userInputLower.includes(phrase) || userInputLower === phrase.replace(/[!?.]/g, '')
    ) && lastMessageWasSummary
  )

  // Intermediate acknowledgments (okay, ok, works, yep) - just acknowledge and continue
  const isIntermediateAck = !isFinalConfirmation && !isReadinessSignal && (
    userInputLower === 'ok' ||
    userInputLower === 'okay' ||
    userInputLower === 'works' ||
    userInputLower === 'yep' ||
    userInputLower === 'yes' ||
    userInputLower === 'got it'
  )

  const userPrompt = `Current conversation:
${conversationText}

The user just said: "${userInput}"

${isFinalConfirmation ? `The user has indicated they're ready to move forward and build. This is a clear signal to wrap up. Give a brief, friendly acknowledgment (1-2 sentences MAX) and let them know they can check "Your Workflows" tab to see the workflow and start configuring it. Do NOT ask any questions. Do NOT ask if they want to clarify anything. Do NOT summarize the workflow again. Just acknowledge and wrap up gracefully.` : isIntermediateAck ? `The user is acknowledging what you said. Simply acknowledge their acknowledgment briefly and continue the conversation naturally. Do NOT summarize. Just acknowledge and ask your next question or continue exploring.` : hasRecentSummary ? `The user is continuing the conversation after a recent summary. Do NOT summarize again - we just did that. If they're asking a question, answer it. If they're providing more info, acknowledge it. Do NOT ask new questions unless they're directly related to what they just said.` : questionCount >= maxQuestions ? `You have reached the maximum number of questions. Provide a helpful summary focusing on the workflow steps (what needs to happen, in what order). Tell the user that in "Your Workflows" tab, they can see the workflow and start configuring it. Do NOT list individual AI agents - just confirm the workflow steps. Do NOT ask if they're ready - just summarize and wrap up.` : questionCount >= 3 ? `You have asked ${questionCount} questions. Provide a summary of what you understand about the workflow, focusing on the workflow steps (what needs to happen, in what order). Tell the user that in "Your Workflows" tab, they can see the workflow and start configuring it. Do NOT ask if they're ready to build - just summarize and let them know where to go next.` : `Ask your next question to understand the workflow better. Focus on high-level workflow understanding, not technical details.`}`

  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()
  const prompt = `${systemPrompt}

${userPrompt}`

  const result = await model.generateContent(prompt)
  const response = result.response.text()
  
  // Mark as complete if: reached max questions OR user indicated readiness
  const isComplete = questionCount >= maxQuestions || (isFinalConfirmation === true)

  return { response, isComplete }
}

// Extract workflow from conversation - real-time background extraction
export async function extractWorkflowFromConversation(
  conversationHistory: ConversationMessage[],
  existingWorkflowId?: string
): Promise<Workflow | null> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const prompt = `You are a Workflow Visualization Agent. Analyze the following conversation and extract a complete workflow definition.

CRITICAL EXTRACTION RULES:
- Extract ALL sequential steps mentioned (don't skip any)
- Maintain chronological order exactly as discussed
- Extract verbatim when possible, infer logically when needed
- Look for patterns: "first... then... then... finally..." or "step 1, step 2, step 3"
- Each step should be a distinct action or event

STEP CLASSIFICATION RULES:
- Trigger: Event that starts the workflow (e.g., "Email received", "Form submitted", "Customer inquiry")
- Action: Specific action to perform (e.g., "Send reply", "Update Excel", "Generate PDF", "Notify worker")
- Decision: Conditional branch point (e.g., "If negative review", "If price > threshold", "Check if approved")
- End: Final completion step (e.g., "Email sent to customer", "Quote delivered", "Task completed")

AUTO-ASSIGNMENT LOGIC:
- If conversation mentions "worker", "staff", "person", "human", "someone", "employee", "team member" doing a step → assignedTo.type = "human"
- If conversation mentions "my worker", "the worker", "worker does", "worker handles", "worker conducts", "worker emails" → assignedTo.type = "human"
- If step explicitly mentions a person doing it (e.g., "worker conducts consultation", "worker emails results") → assignedTo.type = "human"
- If conversation mentions automation/AI/agent explicitly → assignedTo.type = "ai" with descriptive agentName
- If step involves email sending/receiving, Excel updates, PDF generation, calculations, data processing AND no human mentioned → default to "ai"
- If step involves review, approval, decision-making, consultation, manual work → default to "human"
- If step is explicitly described as manual or done by a person → assignedTo.type = "human"
- If unclear → default to "ai" for automatable steps (email, Excel, PDF, calculations)

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON only:
{
  "workflowName": "Descriptive workflow name",
  "description": "Brief description of what this workflow does",
  "steps": [
    {
      "id": "step-1",
      "label": "Verbose step description",
      "type": "trigger|action|decision|end",
      "order": 0,
      "assignedTo": {
        "type": "ai|human",
        "agentName": "Descriptive agent name (if AI)"
      }
    }
  ]
}

IMPORTANT:
- Always return a valid JSON object, even if workflow is incomplete
- Create at least 2-3 steps based on what was discussed
- Use "trigger" for the first step, "action" for middle steps, "end" for the last step
- Order should start at 0 and increment sequentially
- If no clear workflow can be extracted, create a simple workflow with steps based on the conversation

Conversation:
${conversationText}`

  // Retry logic with exponential backoff for network/timeout errors
  const maxRetries = 3
  const baseDelay = 1000 // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt)
      const response = result.response.text().trim()

      // Extract JSON object from plaintext response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return null
      }

      let workflowData
      try {
        workflowData = JSON.parse(jsonMatch[0])
      } catch (parseError) {
        return null
      }

      // Generate IDs for steps if not provided
      const steps: WorkflowStep[] = workflowData.steps.map((step: any, index: number) => ({
        id: step.id || `step-${index + 1}`,
        label: step.label,
        type: step.type || 'action',
        order: step.order !== undefined ? step.order : index,
        assignedTo: step.assignedTo || undefined,
      }))

      // Ensure at least one step
      if (steps.length === 0) {
        return null
      }

      const workflow: Workflow = {
        id: existingWorkflowId || `workflow-${Date.now()}`,
        name: workflowData.workflowName || workflowData.name || 'Untitled Workflow',
        description: workflowData.description,
        steps,
        status: 'draft',
        createdAt: existingWorkflowId ? undefined : new Date(),
        updatedAt: new Date(),
      }

      return workflow
    } catch (error) {
      // If not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // All retries failed - log but don't throw (background extraction should be silent)
  return null
}

// Requirements gathering LLM
export async function buildAutomation(
  step: WorkflowStep,
  conversationHistory: ConversationMessage[],
  createTaskConversation?: ConversationMessage[]
): Promise<{
  requirementsText: string
  blueprint: { 
    greenList: string[]
    redList: string[]
    outstandingQuestions?: string[]
  }
  customRequirements: string[]
}> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  // Add context from Create a Task conversation if available
  const createTaskContext = createTaskConversation
    ? `\n\nCONTEXT FROM INITIAL WORKFLOW CONVERSATION:\n${createTaskConversation
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `You are helping gather requirements for a workflow step: "${step.label}"

STEP TYPE: ${step.type}

${createTaskContext}

${step.type === 'trigger' 
  ? `SPECIAL HANDLING FOR TRIGGER STEPS:
- Trigger steps are events that start workflows (e.g., "every 1 minute", "when email received", "on schedule")
- CRITICAL: Trigger steps are UNIQUE - they are the ONLY step that starts workflow execution
- For greenList, extract REQUIRED CONDITIONS that must be met for the trigger to fire
  * Examples: "email received", "every 1 minute", "when form submitted", "customer inquiry comes in"
  * These are conditions that enable the trigger
- For redList, extract EXCEPTIONS that prevent the trigger from firing
  * Examples: "don't trigger on weekends", "don't trigger if workflow already running", "don't trigger during business hours"
  * These are conditions that would block/disable the trigger
- Focus on requirementsText describing when/how the trigger fires (schedule, event conditions, frequency, etc.)
- Outstanding questions should focus on trigger timing, conditions, or frequency`
  : `STRATEGIC APPROACH:
1. Analyze what information you have vs. what you need
2. Generate outstanding questions (what you still need to discover)
3. Based on answers so far, infer greenList (allowed actions) and redList (forbidden actions)
4. Use outstanding questions to identify gaps in greenList/redList

RELATIONSHIP BETWEEN QUESTIONS AND CONSTRAINTS:
- Outstanding questions help discover what should go in greenList/redList
- As questions are answered, you can infer more specific constraints
- GreenList/redList might reveal new questions (e.g., "If we can't do X, how do we handle Y?")
- They work together iteratively - questions → constraints → more questions`}

Based on the conversation${conversationText ? ' and context' : ' context'}, extract:
1. Requirements text (what needs to be done)
2. Outstanding questions - strategic questions you need answered to fully understand requirements (prioritize by importance)
${step.type === 'trigger' 
  ? `3. GreenList - REQUIRED CONDITIONS that must be met for the trigger to fire (conditions that enable the trigger)
4. RedList - EXCEPTIONS that prevent the trigger from firing (conditions that block/disable the trigger)`
  : step.type === 'end'
  ? `3. GreenList - COMPLETION CRITERIA that must be met for the workflow to complete successfully
4. RedList - EXCEPTIONS that prevent successful completion (conditions that block completion)`
  : `3. GreenList - allowed actions/behaviors (infer from what's been discussed, even if partially)
4. RedList - forbidden actions/behaviors (infer from what's been discussed, even if partially)`}
5. Custom requirements array

IMPORTANT:
- Generate outstanding questions FIRST based on gaps in understanding
- Then infer greenList/redList from what's been answered
- If a question hasn't been answered yet, you might not have enough info for certain greenList/redList items - that's okay
- Outstanding questions should help discover what's MISSING from greenList/redList
- Be specific and actionable with questions (not vague)
- Order questions by priority (most critical first)
${step.type === 'trigger' ? '- For triggers, extract required conditions (when trigger fires) and exceptions (when trigger is blocked)' : step.type === 'end' ? '- For end steps, extract completion criteria (what indicates success) and exceptions (what prevents completion)' : ''}

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON only:
{
  "requirementsText": "Description of requirements",
  "blueprint": {
    "greenList": ["allowed action 1", "allowed action 2"],
    "redList": ["forbidden action 1", "forbidden action 2"],
    "outstandingQuestions": ["question 1", "question 2"]
  },
  "customRequirements": ["requirement 1", "requirement 2"]
}

${conversationText ? `Conversation:\n${conversationText}` : 'Use only the Create a Task context provided above to infer initial requirements.'}`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text()

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to parse requirements')
    }

    let data
    try {
      data = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      throw new Error('Failed to parse requirements JSON')
    }

    return {
      requirementsText: data.requirementsText || '',
      blueprint: {
        greenList: data.blueprint?.greenList || [],
        redList: data.blueprint?.redList || [],
        outstandingQuestions: data.blueprint?.outstandingQuestions || [],
      },
      customRequirements: data.customRequirements || [],
    }
  } catch (error) {
    console.error('Error building automation:', error)
    throw new Error('Failed to build automation requirements')
  }
}

// Generate initial message for trigger step configuration
export async function getInitialTriggerMessage(
  step: WorkflowStep,
  workflowName: string,
  createTaskConversation?: ConversationMessage[]
): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const createTaskContext = createTaskConversation
    ? `\n\nCONTEXT FROM INITIAL WORKFLOW CONVERSATION:\n${createTaskConversation
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `You are helping configure a trigger step for a workflow. 

CRITICAL - TRIGGER STEP UNIQUENESS:
- A trigger step is UNIQUE - it is the ONLY step that starts the workflow execution
- When the trigger fires, it automatically initiates the entire workflow
- There is ONLY ONE trigger step per workflow - it is the entry point
- The trigger configuration determines WHEN the workflow begins (schedule, event, condition)
- This is NOT a regular action step - it's a special workflow starter

WORKFLOW: "${workflowName}"
TRIGGER STEP: "${step.label}"

${createTaskContext}

Your goal is to understand when this workflow should start through natural conversation. Ask questions about:
- Schedule (e.g., "every 1 minute", "daily at 9am", "weekly on Monday")
- Events (e.g., "when email received", "when form submitted")
- Conditions (e.g., "when customer inquiry comes in")

Generate a friendly, conversational initial message to start understanding when this workflow should trigger. Be exploratory and ask clarifying questions.

Return ONLY plaintext. Do not use markdown formatting, code blocks, or any markdown syntax. Return raw text only.`

  try {
    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch (error) {
    console.error('Error generating initial trigger message:', error)
    return `Hi! I'm here to help you configure when "${step.label}" should trigger. When should this workflow start automatically?`
  }
}

// Conversational trigger configuration LLM
export async function gatherTriggerConversation(
  step: WorkflowStep,
  conversationHistory: ConversationMessage[],
  createTaskConversation?: ConversationMessage[]
): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const createTaskContext = createTaskConversation
    ? `\n\nCONTEXT FROM INITIAL WORKFLOW CONVERSATION:\n${createTaskConversation
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `You are helping configure a trigger step for a workflow.

CRITICAL - TRIGGER STEP UNIQUENESS:
- A trigger step is UNIQUE - it is the ONLY step that starts the workflow execution
- When the trigger fires, it automatically initiates the entire workflow
- There is ONLY ONE trigger step per workflow - it is the entry point
- The trigger configuration determines WHEN the workflow begins (schedule, event, condition)
- This is NOT a regular action step - it's a special workflow starter

WORKFLOW STEP: "${step.label}"

${createTaskContext}

CONVERSATION STYLE:
- Be friendly, conversational, and helpful
- Acknowledge what the user just said before responding
- Ask clarifying questions about schedule, events, or conditions
- Focus on understanding WHEN the workflow should start
- Be exploratory and collaborative, not directive
- When you have enough information, summarize the trigger configuration

IMPORTANT:
- Respond conversationally to what the user just said
- If they answered a question, acknowledge their answer
- If they provided trigger information, acknowledge it and ask follow-ups if needed
- Keep responses concise and focused (2-4 sentences typically)

Conversation so far:
${conversationText}

Generate a conversational response to the user's last message. Be friendly, acknowledge what they said, and continue understanding the trigger configuration naturally. Return ONLY plaintext. Do not use markdown formatting, code blocks, or any markdown syntax. Return raw text only.`

  try {
    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch (error) {
    console.error('Error generating trigger conversation:', error)
    throw new Error('Failed to generate trigger conversation')
  }
}

// Generate initial message for end step configuration
export async function getInitialEndMessage(
  step: WorkflowStep,
  workflowName: string,
  createTaskConversation?: ConversationMessage[]
): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const createTaskContext = createTaskConversation
    ? `\n\nCONTEXT FROM INITIAL WORKFLOW CONVERSATION:\n${createTaskConversation
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `You are helping configure an end step for a workflow.

CRITICAL - END STEP UNIQUENESS:
- An end step is UNIQUE - it is the ONLY step that closes/completes the workflow execution
- When the end step is reached, the workflow automatically terminates
- There is ONLY ONE end step per workflow - it is the exit point
- The end step configuration determines WHAT happens when the workflow finishes (completion message, final actions)
- This is NOT a regular action step - it's a special workflow closer

WORKFLOW: "${workflowName}"
END STEP: "${step.label}"

${createTaskContext}

Your goal is to understand what should happen when this workflow completes through natural conversation. Ask questions about:
- Completion message (what to show when workflow finishes)
- Final actions (notifications, logging, etc.)
- Success criteria

Generate a friendly, conversational initial message to start understanding what happens when this workflow completes. Be exploratory and ask clarifying questions.

Return ONLY plaintext. Do not use markdown formatting, code blocks, or any markdown syntax. Return raw text only.`

  try {
    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch (error) {
    console.error('Error generating initial end message:', error)
    return `Hi! I'm here to help you configure what happens when "${step.label}" completes. What should happen when this workflow finishes?`
  }
}

// Conversational end step configuration LLM
export async function gatherEndConversation(
  step: WorkflowStep,
  conversationHistory: ConversationMessage[],
  createTaskConversation?: ConversationMessage[]
): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const createTaskContext = createTaskConversation
    ? `\n\nCONTEXT FROM INITIAL WORKFLOW CONVERSATION:\n${createTaskConversation
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `You are helping configure an end step for a workflow.

CRITICAL - END STEP UNIQUENESS:
- An end step is UNIQUE - it is the ONLY step that closes/completes the workflow execution
- When the end step is reached, the workflow automatically terminates
- There is ONLY ONE end step per workflow - it is the exit point
- The end step configuration determines WHAT happens when the workflow finishes (completion message, final actions)
- This is NOT a regular action step - it's a special workflow closer

WORKFLOW STEP: "${step.label}"

${createTaskContext}

CONVERSATION STYLE:
- Be friendly, conversational, and helpful
- Acknowledge what the user just said before responding
- Ask clarifying questions about completion message and final actions
- Focus on understanding WHAT happens when the workflow completes
- Be exploratory and collaborative, not directive
- When you have enough information, summarize the completion configuration

IMPORTANT:
- Respond conversationally to what the user just said
- If they answered a question, acknowledge their answer
- If they provided completion information, acknowledge it and ask follow-ups if needed
- Keep responses concise and focused (2-4 sentences typically)

Conversation so far:
${conversationText}

Generate a conversational response to the user's last message. Be friendly, acknowledge what they said, and continue understanding the completion configuration naturally. Return ONLY plaintext. Do not use markdown formatting, code blocks, or any markdown syntax. Return raw text only.`

  try {
    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch (error) {
    console.error('Error generating end conversation:', error)
    throw new Error('Failed to generate end conversation')
  }
}

// Extract trigger configuration from conversation
export async function extractTriggerConfiguration(
  step: WorkflowStep,
  conversationHistory: ConversationMessage[],
  createTaskConversation?: ConversationMessage[]
): Promise<{
  requirementsText: string
  blueprint: {
    greenList: string[]
    redList: string[]
    outstandingQuestions?: string[]
  }
}> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const createTaskContext = createTaskConversation
    ? `\n\nCONTEXT FROM INITIAL WORKFLOW CONVERSATION:\n${createTaskConversation
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `Extract trigger configuration from this conversation. A trigger determines when a workflow should automatically start.

CRITICAL - TRIGGER STEP UNIQUENESS:
- A trigger step is UNIQUE - it is the ONLY step that starts the workflow execution
- When the trigger fires, it automatically initiates the entire workflow
- There is ONLY ONE trigger step per workflow - it is the entry point

WORKFLOW STEP: "${step.label}"

${createTaskContext}

Based on the conversation, extract:
1. Requirements text: Description of when/how the trigger fires (schedule, event conditions, frequency, etc.)
2. Required Conditions (greenList): Conditions that MUST be met for the trigger to fire
   - Examples: "email received", "every 1 minute", "when form submitted", "customer inquiry comes in"
   - These are the conditions that enable the trigger
3. Exceptions (redList): Conditions that PREVENT the trigger from firing
   - Examples: "don't trigger on weekends", "don't trigger if workflow already running", "don't trigger during business hours"
   - These are conditions that would block/disable the trigger
4. Outstanding Questions: Questions about trigger timing, conditions, or frequency that still need answers

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON only:
{
  "requirementsText": "Description of when/how the trigger fires",
  "blueprint": {
    "greenList": ["required condition 1", "required condition 2"],
    "redList": ["exception 1", "exception 2"],
    "outstandingQuestions": ["question 1", "question 2"]
  }
}

Conversation:
${conversationText}`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text().trim()

    // Extract JSON object from plaintext response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to parse trigger configuration: No JSON found in response')
    }

    let data
    try {
      data = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      throw new Error('Failed to parse trigger configuration JSON')
    }

    return {
      requirementsText: data.requirementsText || '',
      blueprint: {
        greenList: data.blueprint?.greenList || [],
        redList: data.blueprint?.redList || [],
        outstandingQuestions: data.blueprint?.outstandingQuestions || [],
      },
    }
  } catch (error) {
    console.error('Error extracting trigger configuration:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract trigger configuration: ${errorMessage}`)
  }
}

// Extract end step configuration from conversation
export async function extractEndConfiguration(
  step: WorkflowStep,
  conversationHistory: ConversationMessage[],
  createTaskConversation?: ConversationMessage[]
): Promise<{
  requirementsText: string
  blueprint: {
    greenList: string[]
    redList: string[]
    outstandingQuestions?: string[]
  }
}> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const createTaskContext = createTaskConversation
    ? `\n\nCONTEXT FROM INITIAL WORKFLOW CONVERSATION:\n${createTaskConversation
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `Extract end step configuration from this conversation. An end step defines what happens when a workflow completes.

CRITICAL - END STEP UNIQUENESS:
- An end step is UNIQUE - it is the ONLY step that closes/completes the workflow execution
- When the end step is reached, the workflow automatically terminates
- There is ONLY ONE end step per workflow - it is the exit point

WORKFLOW STEP: "${step.label}"

${createTaskContext}

Based on the conversation, extract:
1. Requirements text: Description of what happens when the workflow completes (completion message, final actions, etc.)
2. Completion Criteria (greenList): Criteria that MUST be met for the workflow to be considered complete
   - Examples: "email sent to customer", "quote delivered", "all steps completed successfully", "notification sent"
   - These are the conditions that indicate successful completion
3. Exceptions (redList): Conditions that PREVENT the workflow from completing successfully
   - Examples: "don't complete if email fails", "don't complete if quote is invalid", "don't complete if errors occur"
   - These are conditions that would block successful completion
4. Outstanding Questions: Questions about completion message, final actions, or success criteria that still need answers

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON only:
{
  "requirementsText": "Description of what happens when workflow completes",
  "blueprint": {
    "greenList": ["completion criterion 1", "completion criterion 2"],
    "redList": ["exception 1", "exception 2"],
    "outstandingQuestions": ["question 1", "question 2"]
  }
}

Conversation:
${conversationText}`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text().trim()

    // Extract JSON object from plaintext response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to parse end configuration: No JSON found in response')
    }

    let data
    try {
      data = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      throw new Error('Failed to parse end configuration JSON')
    }

    return {
      requirementsText: data.requirementsText || '',
      blueprint: {
        greenList: data.blueprint?.greenList || [],
        redList: data.blueprint?.redList || [],
        outstandingQuestions: data.blueprint?.outstandingQuestions || [],
      },
    }
  } catch (error) {
    console.error('Error extracting end configuration:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract end configuration: ${errorMessage}`)
  }
}

// Generate initial message for requirements gathering
export async function getInitialRequirementsMessage(
  step: WorkflowStep,
  workflowName: string,
  createTaskConversation?: ConversationMessage[]
): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const createTaskContext = createTaskConversation
    ? `\n\nCONTEXT FROM INITIAL WORKFLOW CONVERSATION:\n${createTaskConversation
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `You are a requirements gathering specialist. A user is about to configure requirements for a workflow step.

WORKFLOW: ${workflowName}
STEP: "${step.label}"
STEP TYPE: ${step.type}
ASSIGNED TO: ${step.assignedTo?.type === 'ai' ? 'AI Agent' : 'Human'}

${createTaskContext}

Generate a friendly, conversational initial message to start gathering requirements for this step. The message should:
- Welcome them to requirements gathering
- Reference the workflow context if available
- Ask an initial exploratory question to understand what this step needs to accomplish
- Be conversational and friendly, not directive

Return ONLY plaintext. Do not use markdown formatting, code blocks, or any markdown syntax. Return raw text only.`

  try {
    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch (error) {
    console.error('Error generating initial message:', error)
    return `Hi! I'm here to help you configure requirements for "${step.label}". What does this step need to accomplish?`
  }
}

// Conversational requirements gathering LLM - responds to user messages
export async function gatherRequirementsConversation(
  step: WorkflowStep,
  conversationHistory: ConversationMessage[],
  createTaskConversation?: ConversationMessage[]
): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  // Add context from Create a Task conversation if available
  const createTaskContext = createTaskConversation
    ? `\n\nCONTEXT FROM INITIAL WORKFLOW CONVERSATION:\n${createTaskConversation
        .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `You are a friendly requirements gathering specialist helping configure an AI agent for a specific workflow step. Your role is to understand what the agent needs to do and gather detailed requirements through natural conversation.

WORKFLOW STEP: "${step.label}"
STEP TYPE: ${step.type}
ASSIGNED TO: ${step.assignedTo?.type === 'ai' ? 'AI Agent' : 'Human'}

${createTaskContext}

CONVERSATION STYLE:
- Be friendly, conversational, and helpful
- Acknowledge what the user just said before responding
- Ask one question at a time when you need clarification
- Reference the workflow context when relevant
- Focus on understanding the specific requirements for this step
- Be exploratory and collaborative, not directive
- When you have enough information, acknowledge it naturally

IMPORTANT:
- Respond conversationally to what the user just said
- If they answered a question, acknowledge their answer
- If they provided information, acknowledge it and ask a follow-up if needed
- If they're asking a question, answer it helpfully
- Keep responses concise and focused (2-4 sentences typically)

Conversation so far:
${conversationText}

Generate a conversational response to the user's last message. Be friendly, acknowledge what they said, and continue gathering requirements naturally. Return ONLY plaintext. Do not use markdown formatting, code blocks, or any markdown syntax. Return raw text only.`

  try {
    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch (error) {
    console.error('Error generating requirements conversation:', error)
    throw new Error('Failed to generate requirements conversation')
  }
}

// Intelligent agent grouping - LLM-based
export async function buildAgentsFromWorkflowRequirements(
  workflow: Workflow,
  digitalWorkerName?: string
): Promise<AgentConfiguration[]> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const startTime = Date.now()
  const workerName = digitalWorkerName || workflow.assignedTo?.stakeholderName || 'default'

  // Log agent building start
  logAgentBuildingStart(workflow.id, workerName, workflow.steps.length)
  console.log(`🤖 [Agent Building] Starting to build agents for workflow "${workflow.name}" (${workflow.steps.length} steps) for digital worker "${workerName}"`)

  const model = getModel()

  const workflowInfo = {
    name: workflow.name,
    steps: workflow.steps.map((step) => ({
      id: step.id,
      label: step.label,
      type: step.type,
      requirements: step.requirements,
    })),
  }

  const prompt = `Analyze this workflow and intelligently group steps into shared AI agents.

CRITICAL - TRIGGER AND END STEP UNIQUENESS:
- TRIGGER steps (type: "trigger") are UNIQUE - they are the ONLY step that starts workflow execution
  * DO NOT include trigger steps in agent configurations - they don't need agents
  * Trigger steps are events/schedules that initiate workflows, not actions to execute
  * When a trigger fires, it automatically starts the workflow - no agent needed
  
- END steps (type: "end") are UNIQUE - they are the ONLY step that closes workflow execution
  * DO NOT include end steps in agent configurations - they don't need agents
  * End steps are completion markers that terminate workflows, not actions to execute
  * When an end step is reached, the workflow automatically completes - no agent needed

- ONLY group ACTION and DECISION steps (type: "action" or "decision") into agents
- Trigger configuration (requirementsText) describes when workflow starts - use this context to understand workflow frequency/pattern
- End step configuration (requirementsText) describes completion - use this to understand workflow goals

Group ACTION and DECISION steps that:
- Share similar integrations (e.g., Gmail)
- Have related actions
- Can be efficiently handled by the same agent

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON array only:
[
  {
    "name": "Agent name",
    "stepIds": ["step1", "step2"], // Only include action/decision step IDs
    "blueprint": {
      "greenList": ["allowed actions"],
      "redList": ["forbidden actions"]
    },
    "integrations": {
      "gmail": true/false
    }
  }
]

Workflow:
${JSON.stringify(workflowInfo, null, 2)}`

  // Retry logic with exponential backoff
  const maxRetries = 3
  const baseDelay = 1000 // 1 second
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt)
      const response = result.response.text()

      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('Failed to parse agent configurations')
      }

      let agentDataArray
      try {
        agentDataArray = JSON.parse(jsonMatch[0])
      } catch (parseError) {
        throw new Error('Failed to parse agent configurations JSON')
      }

      const agents: AgentConfiguration[] = agentDataArray.map((agentData: any, index: number) => {
        // Create agent for first step in group, assign other steps to it
        const primaryStepId = agentData.stepIds[0]

        return {
          id: `agent-${Date.now()}-${index}`,
          name: agentData.name || `Agent ${index + 1}`,
          stepId: primaryStepId,
          workflowId: workflow.id,
          blueprint: agentData.blueprint || { greenList: [], redList: [] },
          integrations: agentData.integrations || {},
          status: 'configured',
          createdAt: new Date(),
        }
      })

      const duration = Date.now() - startTime

      // Log agent building complete
      logAgentBuildingComplete(workflow.id, workerName, agents, duration)
      console.log(`✅ [Agent Building] Successfully built ${agents.length} agents for workflow "${workflow.name}":`, agents.map(a => a.name).join(', '))
      console.log(`⏱️ [Agent Building] Took ${duration}ms`)

      return agents
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // If not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // All retries failed
  const duration = Date.now() - startTime
  logAgentBuildingComplete(workflow.id, workerName, [], duration)
  console.error(`Failed to build agents after ${maxRetries} attempts`)
  
  // Provide helpful error message
  const errorMsg = lastError?.message || 'Unknown error'
  if (errorMsg.includes('Failed to fetch') || errorMsg.includes('ERR_CONNECTION_CLOSED')) {
    throw new Error(`Failed to build agents: Network error. Please check your internet connection and API key. Original error: ${errorMsg}`)
  }
  throw new Error(`Failed to build agents after ${maxRetries} attempts: ${errorMsg}`)
}

// Extract agent context
export async function extractAgentContext(
  agentConfig: AgentConfiguration,
  workflow: Workflow
): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const step = workflow.steps.find((s) => s.id === agentConfig.stepId)
  if (!step) {
    throw new Error('Step not found')
  }

  const stepLabel = step.label
  const requirementsText = step.requirements?.requirementsText || 'None'

  const prompt = `Extract and summarize the context for this agent:
Agent: ${agentConfig.name}
Step: ${stepLabel}
Blueprint: ${JSON.stringify(agentConfig.blueprint)}
Requirements: ${requirementsText}

Provide a concise context summary for this agent.`

  try {
    const result = await model.generateContent(prompt)
    return result.response.text()
  } catch (error) {
    console.error('Error extracting agent context:', error)
    throw new Error('Failed to extract agent context')
  }
}

// Extract people/stakeholders from conversation
export async function extractPeopleFromConversation(
  conversationHistory: ConversationMessage[]
): Promise<NodeData[]> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const prompt = `Extract people/stakeholders mentioned in this conversation. Focus on entities that are involved in the workflow process.

EXTRACTION RULES:
- Extract people, workers, staff, team members, or digital workers mentioned
- Include roles/titles if mentioned (e.g., "consultant", "manager", "assistant")
- Distinguish between human workers and AI/digital workers
- If someone is mentioned as "my worker", "the worker", "staff member" → type: "human"
- If mentioned as "AI agent", "digital worker", "automated system" → type: "ai"
- If unclear, default to "human" for people and "ai" for systems/agents
- Skip generic references like "customer", "user", "client" unless they're part of the team structure
- Only extract entities that would be part of the organizational structure

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON array only:
[
  {
    "name": "Person/Entity name",
    "type": "ai|human",
    "role": "Role/title (optional)"
  }
]

If no relevant people/stakeholders are mentioned, return an empty array.

Conversation:
${conversationText}`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text()

    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return []
    }

    let people
    try {
      people = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      return []
    }

    return people.map((person: any) => ({
      name: person.name,
      type: person.type || 'human',
      role: person.role,
      status: 'inactive',
      assignedWorkflows: [],
    }))
  } catch (error) {
    console.error('Error extracting people:', error)
    return []
  }
}

// Parse node creation request from chat message
export async function parseNodeCreationRequest(
  userMessage: string,
  existingNodes: NodeData[]
): Promise<{
  name: string
  type: 'ai' | 'human'
  role?: string
  parentName?: string
} | null> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const existingNodeNames = existingNodes.map((n) => n.name).join(', ')

  const prompt = `Parse this user request to create a new team member/digital worker. Extract the information needed to add them to the organizational chart.

USER REQUEST: "${userMessage}"

EXISTING NODES IN TEAM: ${existingNodeNames || 'None'}

EXTRACTION RULES:
- Extract the name of the new person/entity
- Determine if it's a "human" or "ai" (digital worker)
- Extract role/title if mentioned
- If user mentions "reports to", "under", "works for", "child of", "belongs to", extract the parent node name
- If parent is mentioned, match it to one of the existing node names (use closest match)
- If no parent is mentioned, the new node will be added without a parent (will be a root node)

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON only:
{
  "name": "Name of the new person/entity",
  "type": "ai|human",
  "role": "Role/title (optional)",
  "parentName": "Name of parent node (optional, only if mentioned)"
}

If the request is not about creating a team member, return null.

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON object or null only, no other text.`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text()

    // Try to extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    let parsed
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      return null
    }
    
    // Validate required fields
    if (!parsed.name || !parsed.type) {
      console.warn(`⚠️ [parseNodeCreationRequest] Parsed JSON missing required fields (name or type)`)
      return null
    }

    // Validate type
    if (parsed.type !== 'ai' && parsed.type !== 'human') {
      parsed.type = 'human' // Default to human
    }

    return parsed
  } catch (error) {
    console.error('Error parsing node creation request:', error)
    return null
  }
}
