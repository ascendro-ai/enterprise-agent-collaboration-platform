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

  const systemPrompt = `You are a workflow consultant helping users discover and define their workflows through conversation.
Your goal is to ask thoughtful questions (maximum ${maxQuestions} questions) to understand what workflow the user wants to create.
After ${maxQuestions} questions, you should have enough information to help them create a workflow.
Be concise, friendly, and focused on understanding the workflow steps and requirements.`

  const conversationText = conversationHistory
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n')

  const prompt = `${systemPrompt}

Current conversation:
${conversationText}

${questionCount >= maxQuestions ? 'You have reached the maximum number of questions. Provide a helpful summary and next steps.' : `You have asked ${questionCount} question(s) so far. ${questionCount < maxQuestions ? `Ask your next question to understand the workflow better.` : 'Provide a summary.'}`}`

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
