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
  type: 'send_email' | 'read_email' | 'modify_email' | 'guidance_requested' | 'complete' | 'request_file_upload' | 'show_image_preview' | 'generate_image'
  parameters?: {
    to?: string
    subject?: string
    body?: string
    emailId?: string
    label?: string
    guidanceQuestion?: string
    // File upload request parameters
    fileType?: 'excel' | 'image' | 'document' | 'any'
    fileDescription?: string // What the agent needs the file for
    // Image preview parameters
    imageUrl?: string // URL or data URL of image to show
    imageCaption?: string // Caption explaining the image
    // Image generation parameters
    imagePrompt?: string // Prompt for generating an image
  }
}

export interface AgentExecutionResult {
  success: boolean
  actions: AgentAction[]
  message?: string
  error?: string
  needsGuidance?: boolean
  guidanceQuestion?: string
  // Enhanced capabilities
  requestedFileType?: 'excel' | 'image' | 'document' | 'any'
  fileDescription?: string
  previewImageUrl?: string
  previewImageCaption?: string
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

  // Build guidance context text - include all messages (user, agent, and system with file data)
  const guidanceText = guidanceContext && guidanceContext.length > 0
    ? `\n\nUSER GUIDANCE AND CONTEXT PROVIDED:\n${guidanceContext
        .map((msg) => {
          const prefix = msg.sender === 'user' ? 'User' : msg.sender === 'agent' ? 'Agent' : 'System'
          return `[${prefix}]: ${msg.text}`
        })
        .join('\n\n')}`
    : ''

  // Check if user has provided guidance/files
  const hasUserGuidance = guidanceContext && guidanceContext.length > 0
  const hasExcelData = hasUserGuidance && guidanceContext.some(msg => msg.text.includes('Excel Data:'))
  const hasUploadedFiles = hasUserGuidance && guidanceContext.some(msg => msg.text.includes('Uploaded file:'))

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

${hasUserGuidance ? `
IMPORTANT: The user has provided guidance above. You MUST:
1. Acknowledge that you received their guidance in your message
2. ${hasExcelData ? 'Reference the Excel data they provided and explain how you will use it' : ''}
3. ${hasUploadedFiles ? 'Acknowledge the file(s) they uploaded' : ''}
4. Explain specifically how their input helps you complete this step
` : ''}

CRITICAL RULES:
1. If this is a TRIGGER step, it's an event - just mark it as complete (use "complete" action type)
2. For ACTION steps: 
   - If GREEN LIST is empty AND no user guidance has been provided, request what you need
   - If GREEN LIST has items OR user has provided guidance, proceed with the allowed actions
3. You MUST NOT perform any actions in the RED LIST
4. If Gmail is available and the step involves email, use Gmail API actions
5. Be specific with action parameters

AVAILABLE ACTIONS:
- "complete": Mark step as done
- "send_email": Send an email (requires to, subject, body)
- "read_email": Read emails from inbox
- "modify_email": Modify email labels (requires emailId, label)
- "guidance_requested": Ask the user a question (requires guidanceQuestion)
- "request_file_upload": Request user to upload a file (requires fileType: excel|image|document|any, fileDescription)
- "generate_image": Generate an image using AI (requires imagePrompt describing what to create)
- "show_image_preview": Show an image to the user for approval (requires imageUrl, imageCaption)

WHEN TO USE EACH ACTION:
- Use "request_file_upload" when you need data from the user (e.g., Excel spreadsheet, images, documents)
- Use "generate_image" when you need to create visual content (marketing images, charts, diagrams)
- Use "show_image_preview" AFTER generating an image, to get user approval before proceeding
- Use "guidance_requested" for general questions that don't require a file

EXAMPLE WORKFLOW for image generation:
1. First request file: { type: "request_file_upload", parameters: { fileType: "excel", fileDescription: "Inventory data to identify items for marketing" }}
2. After receiving data, generate: { type: "generate_image", parameters: { imagePrompt: "Marketing poster for Peonies flower sale, 50% off, Valentine's special" }}
3. Then show preview: { type: "show_image_preview", parameters: { imageUrl: "[generated]", imageCaption: "Marketing image for Peonies - please approve or provide feedback" }}

Return ONLY plaintext JSON with this structure:
{
  "actions": [
    {
      "type": "complete" | "send_email" | "read_email" | "modify_email" | "guidance_requested" | "request_file_upload" | "generate_image" | "show_image_preview",
      "parameters": {
        "to": "email (for send_email)",
        "subject": "subject (for send_email)",
        "body": "body (for send_email)",
        "emailId": "id (for modify_email)",
        "label": "label (for modify_email)",
        "guidanceQuestion": "question (for guidance_requested)",
        "fileType": "excel|image|document|any (for request_file_upload)",
        "fileDescription": "what you need the file for (for request_file_upload)",
        "imagePrompt": "detailed description of image to generate (for generate_image)",
        "imageUrl": "URL of image (for show_image_preview)",
        "imageCaption": "explanation for user (for show_image_preview)"
      }
    }
  ],
  "message": "${hasUserGuidance ? 'Start with: Thank you for the guidance. Then explain what you are doing.' : 'Brief description of what you are doing'}",
  "needsGuidance": true/false,
  "guidanceQuestion": "Question if needsGuidance is true",
  "requestedFileType": "excel|image|document|any (if requesting a file)",
  "fileDescription": "What you need the file for (if requesting a file)",
  "previewImageUrl": "URL of image to preview (if showing image for approval)",
  "previewImageCaption": "Caption for the preview image"
}

Think step by step:
1. ${hasUserGuidance ? 'What guidance/data did the user provide? How does it help?' : 'What does this step require me to do?'}
2. What actions are allowed (greenList)?
3. What actions are forbidden (redList)?
4. Do I have enough information to proceed? If not, what do I need?
5. What specific actions should I take?

Return ONLY plaintext JSON. No markdown, no code blocks. Raw JSON only.`

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
        await executeSingleAction(action, hasGmail || false)
        executedActions.push(action)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`Error executing action ${action.type}:`, errorMessage)
        
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
        
        // If it's a file upload request, return with file info
        if (action.type === 'request_file_upload') {
          return {
            success: false,
            actions: executedActions,
            needsGuidance: true,
            guidanceQuestion: action.parameters?.fileDescription || 'Please upload the requested file',
            requestedFileType: action.parameters?.fileType,
            fileDescription: action.parameters?.fileDescription,
            message: executionData.message,
          }
        }
        
        // If it's an image preview request, return with image info
        if (action.type === 'show_image_preview') {
          return {
            success: false,
            actions: executedActions,
            needsGuidance: true,
            guidanceQuestion: action.parameters?.imageCaption || 'Please review this image',
            previewImageUrl: action.parameters?.imageUrl,
            previewImageCaption: action.parameters?.imageCaption,
            message: executionData.message,
          }
        }
        
        // For other errors, throw to be caught by caller
        throw error
      }
    }

    // Check if the response includes file request or image preview data (even without explicit action)
    const hasFileRequest = executionData.requestedFileType || executionData.fileDescription
    const hasImagePreview = executionData.previewImageUrl || executionData.previewImageCaption

    return {
      success: !hasFileRequest && !hasImagePreview,
      actions: executedActions,
      message: executionData.message || `Completed step: ${step.label}`,
      needsGuidance: executionData.needsGuidance || hasFileRequest || hasImagePreview,
      guidanceQuestion: executionData.guidanceQuestion,
      requestedFileType: executionData.requestedFileType,
      fileDescription: executionData.fileDescription,
      previewImageUrl: executionData.previewImageUrl,
      previewImageCaption: executionData.previewImageCaption,
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

    case 'request_file_upload':
      // Signal that we need a file upload - handled by caller
      console.log(`📁 [Agent Execution] Requesting file upload: ${action.parameters?.fileType} - ${action.parameters?.fileDescription}`)
      throw new Error(`File upload requested: ${action.parameters?.fileDescription || 'Please upload the requested file'}`)

    case 'generate_image':
      // This will be handled by the workflow execution service which has access to image generation
      console.log(`🎨 [Agent Execution] Requesting image generation: ${action.parameters?.imagePrompt}`)
      // For now, we store the prompt - the actual generation happens in workflowExecutionService
      break

    case 'show_image_preview':
      // Signal that we need to show an image for approval - handled by caller
      console.log(`🖼️ [Agent Execution] Showing image preview: ${action.parameters?.imageCaption}`)
      throw new Error(`Image preview: ${action.parameters?.imageCaption || 'Please review this image'}`)

    case 'complete':
      // Step completed, no action needed
      console.log(`✅ [Agent Execution] Step marked as complete`)
      break

    default:
      throw new Error(`Unknown action type: ${(action as any).type}`)
  }
}
