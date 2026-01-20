import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_CONFIG } from '../utils/constants'
import { sendEmail, readEmails, getGmailAccessToken } from './gmailService'
import { getWorkflowById } from './workflowReadinessService'
import type { WorkflowStep, AgentConfiguration } from '../types'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

const getModel = () => {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }
  return genAI.getGenerativeModel({ model: GEMINI_CONFIG.MODEL })
}

export interface AgentAction {
  type: 'send_email' | 'read_email' | 'modify_email' | 'guidance_requested' | 'complete'
  parameters?: {
    to?: string
    subject?: string
    body?: string
    emailId?: string
    label?: string
    guidanceQuestion?: string
  }
}

export interface AgentExecutionResult {
  success: boolean
  actions: AgentAction[]
  message?: string
  error?: string
  needsGuidance?: boolean
  guidanceQuestion?: string
}

/**
 * Execute an agent step using LLM to decide actions based on blueprint
 */
export async function executeAgentAction(
  step: WorkflowStep,
  blueprint: { greenList: string[]; redList: string[] },
  guidanceContext?: Array<{ sender: 'user' | 'agent'; text: string; timestamp: Date }>,
  integrations?: { gmail?: boolean },
  workflowId?: string
): Promise<AgentExecutionResult> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  const model = getModel()
  const hasGmail = integrations?.gmail && (await getGmailAccessToken()) !== null

  // Get workflow context for trace logging
  let workflowName = 'Unknown Workflow'
  let digitalWorkerName = 'default'
  if (workflowId) {
    const workflow = getWorkflowById(workflowId)
    if (workflow) {
      workflowName = workflow.name || workflowId
      digitalWorkerName = workflow.assignedTo?.stakeholderName || 'default'
    }
  }
  const agentName = step.assignedTo?.agentName || 'unnamed agent'

  // Helper function for trace logging
  const logAgentTrace = (message: string) => {
    console.log(`Agent ${agentName} is analyzing step requirements: ${step.label}. The step requires: ${step.requirements?.requirementsText || 'No specific requirements provided'}. ${message}`)
  }

  // Build guidance context text
  const guidanceText = guidanceContext && guidanceContext.length > 0
    ? `\n\nUSER GUIDANCE PROVIDED:\n${guidanceContext
        .filter((msg) => msg.sender === 'user')
        .map((msg) => `- ${msg.text}`)
        .join('\n')}`
    : ''

  const prompt = `You are an AI agent executing a workflow step. Your job is to decide what actions to take based on the step requirements and blueprint constraints.

STEP TO EXECUTE: "${step.label}"
STEP TYPE: ${step.type}
STEP REQUIREMENTS: ${step.requirements?.requirementsText || 'No specific requirements provided'}

BLUEPRINT CONSTRAINTS:
- GREEN LIST (Allowed): ${blueprint.greenList.length > 0 ? blueprint.greenList.join(', ') : 'None specified'}
- RED LIST (Forbidden): ${blueprint.redList.length > 0 ? blueprint.redList.join(', ') : 'None specified'}

AVAILABLE INTEGRATIONS:
- Gmail: ${hasGmail ? 'Available' : 'Not available'}

${guidanceText}

CRITICAL RULES:
1. If this is a TRIGGER step, it's an event - just mark it as complete (use "complete" action type)
2. For ACTION steps: 
   - If GREEN LIST is empty AND this is the first execution attempt, request guidance with: "The Green List is empty. I need to know what actions are allowed for this step before I can proceed."
   - If GREEN LIST has items, you MUST only perform actions that are in the GREEN LIST
3. You MUST NOT perform any actions in the RED LIST
4. If you need clarification or guidance, request it using "guidance_requested" action type
5. If Gmail is available and the step involves email, use Gmail API actions
6. Be specific with action parameters (to, subject, body for emails)

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON only with this structure:
{
  "actions": [
    {
      "type": "send_email" | "read_email" | "modify_email" | "guidance_requested" | "complete",
      "parameters": {
        "to": "email@example.com" (for send_email),
        "subject": "Email subject" (for send_email),
        "body": "Email body" (for send_email),
        "emailId": "email-id" (for modify_email),
        "label": "label-name" (for modify_email),
        "guidanceQuestion": "What should I do about X?" (for guidance_requested)
      }
    }
  ],
  "message": "Brief description of what you're doing",
  "needsGuidance": true/false,
  "guidanceQuestion": "Question if needsGuidance is true"
}

Think step by step:
1. What does this step require me to do?
2. What actions are allowed (greenList)?
3. What actions are forbidden (redList)?
4. Do I have enough information to proceed?
5. What specific actions should I take?

Return ONLY plaintext JSON. Do not use markdown code blocks, formatting, or any markdown syntax. Return raw JSON object only, no other text.`

  try {
    logAgentTrace('Starting to analyze what actions to take')
    
    // Add timeout to prevent indefinite hangs
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`executeAgentAction timed out after 30000ms`))
      }, 30000)
    })
    
    const result = await Promise.race([
      model.generateContent(prompt),
      timeoutPromise
    ])
    const response = result.response.text()

    // Extract JSON from plaintext response
    const jsonMatch = response.trim().match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to parse agent execution response: No JSON found')
    }

    let executionData
    try {
      executionData = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      throw new Error('Failed to parse agent execution response: Invalid JSON')
    }

    // Validate actions
    if (!Array.isArray(executionData.actions)) {
      throw new Error('Invalid actions array in agent response')
    }

    // Execute actions
    const executedActions: AgentAction[] = []
    let lastError: string | undefined

    for (const action of executionData.actions) {
      try {
        await executeSingleAction(action, hasGmail)
        executedActions.push(action)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`Error executing action ${action.type}:`, errorMessage)
        lastError = errorMessage
        
        // If it's a guidance request, don't fail - just return it
        if (action.type === 'guidance_requested') {
          return {
            success: false,
            actions: executedActions,
            needsGuidance: true,
            guidanceQuestion: action.parameters?.guidanceQuestion || 'Agent needs guidance',
            message: executionData.message,
          }
        }
        
        // For other errors, throw to be caught by caller
        throw error
      }
    }

    return {
      success: true,
      actions: executedActions,
      message: executionData.message || `Completed step: ${step.label}`,
      needsGuidance: executionData.needsGuidance || false,
      guidanceQuestion: executionData.guidanceQuestion,
    }
  } catch (error) {
    console.error('Error executing agent action:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Check if it's a guidance request
    if (errorMessage.includes('guidance') || errorMessage.includes('clarification')) {
      return {
        success: false,
        actions: [],
        needsGuidance: true,
        guidanceQuestion: errorMessage,
        error: errorMessage,
      }
    }
    
    throw new Error(`Agent execution failed: ${errorMessage}`)
  }
}

/**
 * Execute a single action (send email, read email, etc.)
 */
async function executeSingleAction(action: AgentAction, hasGmail: boolean): Promise<void> {
  switch (action.type) {
    case 'send_email':
      if (!hasGmail) {
        throw new Error('Gmail integration not available')
      }
      if (!action.parameters?.to || !action.parameters?.subject || !action.parameters?.body) {
        throw new Error('Missing required email parameters (to, subject, body)')
      }
      await sendEmail(
        action.parameters.to,
        action.parameters.subject,
        action.parameters.body
      )
      console.log(`📧 [Agent Execution] Sent email to ${action.parameters.to}`)
      break

    case 'read_email':
      if (!hasGmail) {
        throw new Error('Gmail integration not available')
      }
      await readEmails(10) // Read last 10 emails
      console.log(`📬 [Agent Execution] Read emails`)
      break

    case 'modify_email':
      if (!hasGmail) {
        throw new Error('Gmail integration not available')
      }
      // TODO: Implement email modification (labels, etc.)
      console.log(`✏️ [Agent Execution] Modify email not yet implemented`)
      break

    case 'guidance_requested':
      // This is handled by the caller
      throw new Error(`Guidance requested: ${action.parameters?.guidanceQuestion || 'Agent needs guidance'}`)

    case 'complete':
      // Step completed, no action needed
      console.log(`✅ [Agent Execution] Step marked as complete`)
      break

    default:
      throw new Error(`Unknown action type: ${(action as any).type}`)
  }
}
