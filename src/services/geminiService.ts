import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_CONFIG } from '../utils/constants'
import type {
  Workflow,
  WorkflowStep,
  AgentConfiguration,
  ConversationMessage,
  NodeData,
} from '../types'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY

if (!apiKey) {
  console.warn('VITE_GEMINI_API_KEY is not set')
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
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()
  const maxQuestions = GEMINI_CONFIG.MAX_QUESTIONS

  // Get the last user message
  const lastUserMessage = conversationHistory
    .filter((msg) => msg.sender === 'user')
    .pop()
  const userInput = lastUserMessage?.text || ''

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const systemPrompt = `You are a friendly workflow consultant helping someone automate their business tasks using an AI agent platform.

PLATFORM CONTEXT - You should know about these features and their functions:

1. "Create a Task" tab (where you are now): This is the workspace where users can talk about issues they're facing and build workflows. As the consultant, you help users understand their business problems and map out workflows to solve them. The workflow steps, tasks, and process flow that you extract from the conversation will automatically appear in "Your Workflows" tab.

2. "Your Workflows" tab: This is where users can customize and build AI agents easily to solve those tasks. Each workflow shows the sequence of steps, and each step can be assigned to an AI agent (which users can build using the agent builder) or to a human. The workflow steps, tasks, and process flow all go to "Your Workflows" tab - NOT "Your Team". Users can then assign each step to an AI agent or to a human, and build/configure those agents directly in this tab.

3. "Your Team" tab: This is where users can manage their fleet of digital workers who run those workflows (e.g., manage those processes) and have their humans collaborate with those digital workers. Stakeholders include:
  * Digital Workers (AI Agents): Automated workers that execute workflows (e.g., "Email Monitor Agent", "PDF Generator Agent")
  * Humans: People involved in the process who collaborate with digital workers
  * NOTE: The workflow steps themselves (the process flow) go to "Your Workflows", not "Your Team". "Your Team" is for managing the stakeholders/agents who run the workflows.

4. "Control Room" tab: This is a dashboard where users can track progress and updates from all their active agents. It shows what agents are working on, what needs review, and what's been completed.

Your goal is to quickly understand the WORKFLOW at a high level - what needs to happen, in what order. The workflow steps, tasks, and process flow will automatically appear in "Your Workflows" tab, NOT "Your Team". The organizational structure (stakeholders/agents) goes to "Your Team".

CRITICAL - STAKEHOLDER CREATION STRATEGY:
- "Your Team" represents STAKEHOLDERS involved in the process, not departments
- Stakeholders can be:
  * Digital Workers (AI Agents): Automated workers that coordinate and orchestrate workflows. Digital workers can intelligently route tasks, coordinate between different steps, and use AI agents as needed - they don't need to be one agent per task.
  * Humans: People involved in the process (e.g., "Worker", "Manager", "Owner")
- IMPORTANT - Digital Worker Strategy:
  * Digital workers should coordinate and orchestrate entire workflows, not be created for every single task
  * A digital worker can handle multiple related steps in a workflow and intelligently route/orchestrate as needed
  * For example, if the workflow involves: "get emails → reply with form → notify worker → update Excel → calculate quote → generate PDF → send email"
  * You might create a "Consultation Coordinator" digital worker that handles the entire consultation workflow, or a "Quote Manager" digital worker that handles quote generation and delivery
  * Digital workers can use AI agents as tools/resources when needed, but don't need one agent per task
  * Focus on creating digital workers that coordinate logical groups of tasks, not individual task agents
- Also identify HUMAN STAKEHOLDERS mentioned in the conversation (e.g., "worker", "husband", "team member", "manager")
- Digital workers can have workflows assigned to them (they execute and coordinate those workflows)
- Humans can have workflows assigned to them (they oversee/manage those workflows)
- The structure should show stakeholders (both digital workers and humans) - NO DEPARTMENTS

CRITICAL - QUESTION LIMIT: You have asked ${questionCount} questions so far. You have a MAXIMUM of 3-5 questions total to scope this workflow. After that, you should summarize and ask if they're ready to build, even if you don't have every detail.

CRITICAL - SUMMARY MESSAGE RULES:
- When summarizing, DO NOT list individual AI agents (e.g., "Email Monitor Agent", "Response Agent", "CRM Agent", etc.)
- Just confirm the WORKFLOW steps (what needs to happen, in what order)
- Tell the user that in "Your Team" tab, they can build their own org structure and create digital workers to execute these workflows
- Keep the summary focused on the workflow, not the agents

Focus on ONLY these essential questions (prioritize the most important):
1. What kind of business/work they do
2. What main tasks or processes they want to automate (each distinct task = separate digital worker)
3. Which tasks should be AUTOMATED vs which should remain HUMAN TASKS
4. Who are the stakeholders involved (humans and digital workers) - NO DEPARTMENTS

IMPORTANT - DO NOT ask about:
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
- Just focus on understanding their workflow through conversation

Keep it HIGH-LEVEL and FAST. Focus on understanding WHAT needs to be done, not HOW. All granular details will be handled in the agent setup phase when they configure each agent individually.

Be concise. Ask 1-2 questions at a time. After 3-5 questions total, summarize what you understand. The workflow steps will appear in "Your Workflows" tab, and the stakeholders/agents will appear in "Your Team" tab - both update automatically as we chat.

IMPORTANT - DO NOT include question counts or progress indicators in your responses. Do not say things like "(Total questions asked: 2/5)" or similar. Just have a natural conversation.`

  const prompt = `${systemPrompt}

Current conversation:
${conversationText}

The user just said: "${userInput}"

${questionCount >= maxQuestions ? `You have reached the maximum number of questions. Provide a helpful summary focusing on the workflow steps (what needs to happen, in what order). Tell the user that in "Your Team" tab, they can build their own org structure and create digital workers to execute these workflows. Do NOT list individual AI agents - just confirm the workflow steps.` : questionCount >= 3 ? `You have asked ${questionCount} questions. Provide a summary of what you understand about the workflow, focusing on the workflow steps (what needs to happen, in what order). Tell the user that in "Your Team" tab, they can build their own org structure and create digital workers to execute these workflows. Ask if they're ready to build or if they want to clarify anything.` : `Ask your next question to understand the workflow better. Focus on high-level workflow understanding, not technical details.`}`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text()
    const isComplete = questionCount >= maxQuestions

    return { response, isComplete }
  } catch (error) {
    console.error('Error in consultWorkflow:', error)
    throw new Error('Failed to get consultant response')
  }
}

// Extract workflow from conversation - real-time background extraction
export async function extractWorkflowFromConversation(
  conversationHistory: ConversationMessage[]
): Promise<Workflow | null> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const prompt = `Analyze the following conversation and extract a workflow definition.
Return ONLY a valid JSON object with this structure:
{
  "name": "Workflow name",
  "description": "Brief description",
  "steps": [
    {
      "id": "step1",
      "label": "Step name",
      "type": "trigger|action|decision|end",
      "order": 1
    }
  ]
}

If no clear workflow can be extracted, return null.
Conversation:
${conversationText}`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text()

    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    const workflowData = JSON.parse(jsonMatch[0])

    // Generate IDs for steps if not provided
    const steps: WorkflowStep[] = workflowData.steps.map((step: any, index: number) => ({
      id: step.id || `step-${index + 1}`,
      label: step.label,
      type: step.type || 'action',
      order: step.order || index + 1,
    }))

    const workflow: Workflow = {
      id: `workflow-${Date.now()}`,
      name: workflowData.name || 'Untitled Workflow',
      description: workflowData.description,
      steps,
      status: 'draft',
      createdAt: new Date(),
    }

    return workflow
  } catch (error) {
    console.error('Error extracting workflow:', error)
    return null
  }
}

// Requirements gathering LLM
export async function buildAutomation(
  step: WorkflowStep,
  conversationHistory: ConversationMessage[]
): Promise<{
  requirementsText: string
  blueprint: { greenList: string[]; redList: string[] }
  customRequirements: string[]
}> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const prompt = `You are helping gather requirements for a workflow step: "${step.label}"

Based on the conversation, extract:
1. Requirements text (what needs to be done)
2. Blueprint with greenList (allowed actions/behaviors) and redList (forbidden actions/behaviors)
3. Custom requirements array

Return ONLY a valid JSON object:
{
  "requirementsText": "Description of requirements",
  "blueprint": {
    "greenList": ["allowed action 1", "allowed action 2"],
    "redList": ["forbidden action 1", "forbidden action 2"]
  },
  "customRequirements": ["requirement 1", "requirement 2"]
}

Conversation:
${conversationText}`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text()

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to parse requirements')
    }

    const data = JSON.parse(jsonMatch[0])

    return {
      requirementsText: data.requirementsText || '',
      blueprint: data.blueprint || { greenList: [], redList: [] },
      customRequirements: data.customRequirements || [],
    }
  } catch (error) {
    console.error('Error building automation:', error)
    throw new Error('Failed to build automation requirements')
  }
}

// Intelligent agent grouping - LLM-based
export async function buildAgentsFromWorkflowRequirements(
  workflow: Workflow
): Promise<AgentConfiguration[]> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

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
Group steps that:
- Share similar integrations (e.g., Gmail)
- Have related actions
- Can be efficiently handled by the same agent

Return ONLY a valid JSON array of agent configurations:
[
  {
    "name": "Agent name",
    "stepIds": ["step1", "step2"],
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

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text()

    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error('Failed to parse agent configurations')
    }

    const agentDataArray = JSON.parse(jsonMatch[0])

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

    return agents
  } catch (error) {
    console.error('Error building agents:', error)
    throw new Error('Failed to build agents from workflow requirements')
  }
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

  const prompt = `Extract people/stakeholders mentioned in this conversation.
Return ONLY a valid JSON array:
[
  {
    "name": "Person name",
    "type": "ai|human",
    "role": "Role/title"
  }
]

If no people are mentioned, return an empty array.

Conversation:
${conversationText}`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text()

    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return []
    }

    const people = JSON.parse(jsonMatch[0])
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
