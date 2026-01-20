import { CONTROL_ROOM_EVENT } from '../utils/constants'
import { getWorkflowById } from './workflowReadinessService'
import {
  logWorkflowExecutionStart,
  logWorkflowStepExecution,
  logWorkflowStepComplete,
  logWorkflowComplete,
  logErrorOrBlocker,
} from './activityLogService'
import { executeAgentAction } from './agentExecutionService'
import { generateImage } from './imageGenerationService'
import type { Workflow, ControlRoomUpdate, ReviewItem, WorkflowStep } from '../types'

// Execution state
interface ExecutionState {
  workflowId: string
  currentStepIndex: number
  isRunning: boolean
  startTime: Date
  stepStartTimes: Map<string, number> // Track step start times for duration calculation
  guidanceContext?: Array<{
    stepId: string
    chatHistory: Array<{ 
      sender: 'user' | 'agent' | 'system'
      text: string
      timestamp: Date
      excelData?: string
      uploadedFileName?: string
    }>
    timestamp: Date
  }>
}

const executionStates = new Map<string, ExecutionState>()

// Trace logging function for narrative workflow execution logs
function logTrace(workflowId: string, message: string): void {
  const workflow = getWorkflowById(workflowId)
  if (!workflow) {
    console.log(`[Trace] ${message}`)
    return
  }
  
  const digitalWorkerName = workflow.assignedTo?.stakeholderName || 'default'
  const workflowName = workflow.name || workflowId
  
  console.log(`Digital Worker ${digitalWorkerName} is executing workflow ${workflowName}. ${message}`)
}

// Start workflow execution
export function startWorkflowExecution(workflowId: string, digitalWorkerName?: string): void {
  console.log(`🚀 [Workflow Execution] Starting execution for workflow "${workflowId}" (digital worker: ${digitalWorkerName || 'default'})`)
  
  const workflow = getWorkflowById(workflowId)
  if (!workflow) {
    console.error(`❌ [Workflow Execution] Workflow not found: ${workflowId}`)
    throw new Error('Workflow not found')
  }

  const workerName = digitalWorkerName || workflow.assignedTo?.stakeholderName || 'default'
  
  console.log(`📋 [Workflow Execution] Workflow "${workflow.name}" status: ${workflow.status}, steps: ${workflow.steps.length}`)

  if (workflow.status !== 'active') {
    // Log this as a blocker instead of silently failing
    console.error(`❌ [Workflow Execution] Workflow must be active to execute. Current status: ${workflow.status}`)
    logErrorOrBlocker(
      workflowId,
      '',
      workflow.name,
      workerName,
      `Workflow must be active to execute. Current status: ${workflow.status}`,
      'blocker'
    )
    throw new Error('Workflow must be active to execute')
  }

  executionStates.set(workflowId, {
    workflowId,
    currentStepIndex: 0,
    isRunning: true,
    startTime: new Date(),
    stepStartTimes: new Map(),
    guidanceContext: [],
  })

  console.log(`✅ [Workflow Execution] Execution state initialized, starting step execution...`)

  // Log workflow execution start
  logWorkflowExecutionStart(
    workflowId,
    workerName,
    workflow.name,
    workflow.steps.length
  )

  // Trace log: workflow execution start
  logTrace(workflowId, `Starting execution of workflow with ${workflow.steps.length} steps`)

  // Emit start event
  emitControlRoomUpdate({
    type: 'workflow_update',
    data: {
      workflowId,
      message: `Workflow "${workflow.name}" started`,
      timestamp: new Date(),
    },
  })

  // Start executing steps
  executeWorkflowSteps(workflowId)
}

// Execute workflow steps sequentially
async function executeWorkflowSteps(workflowId: string): Promise<void> {
  console.log(`🔄 [Workflow Execution] executeWorkflowSteps called for workflow "${workflowId}"`)
  
  const state = executionStates.get(workflowId)
  if (!state || !state.isRunning) {
    console.warn(`⚠️ [Workflow Execution] No execution state or not running for workflow "${workflowId}"`)
    return
  }

  const workflow = getWorkflowById(workflowId)
  if (!workflow) {
    console.error(`❌ [Workflow Execution] Workflow not found: ${workflowId}`)
    stopExecution(workflowId, 'Workflow not found')
    return
  }

  console.log(`📊 [Workflow Execution] Step ${state.currentStepIndex + 1}/${workflow.steps.length} for workflow "${workflow.name}"`)

  if (state.currentStepIndex >= workflow.steps.length) {
    // Workflow completed
    console.log(`✅ [Workflow Execution] Workflow "${workflow.name}" completed!`)
    logTrace(workflowId, `Has successfully completed workflow`)
    completeWorkflow(workflowId, workflow)
    return
  }

  const step = workflow.steps[state.currentStepIndex]
  const stepNumber = state.currentStepIndex + 1
  const totalSteps = workflow.steps.length
  const assignedTo = step.assignedTo?.type === 'ai' 
    ? `AI agent ${step.assignedTo.agentName || 'unnamed'}`
    : step.assignedTo?.type === 'human'
    ? 'Human worker'
    : 'unassigned'
  
  console.log(`▶️ [Workflow Execution] Executing step: "${step.label}" (${step.type}, assigned to: ${step.assignedTo?.type || 'none'})`)
  logTrace(workflowId, `Preparing to execute step ${stepNumber} of ${totalSteps}: ${step.label}`)
  logTrace(workflowId, `Now executing step ${step.label}. This step is assigned to ${assignedTo}`)

  try {
    // Execute the step
    await executeAgentStep(workflowId, step)
    
    // Check if execution was paused (state might have been set to not running)
    const currentState = executionStates.get(workflowId)
    if (!currentState || !currentState.isRunning) {
      console.log(`⏸️ [Workflow Execution] Execution paused for step "${step.label}"`)
      return // Don't continue if execution was paused
    }
    
    console.log(`✅ [Workflow Execution] Step "${step.label}" completed successfully`)
    logTrace(workflowId, `Successfully completed step ${step.label}`)
    logTrace(workflowId, `Moving to the next step in the workflow`)

    // Move to next step
    state.currentStepIndex++
    executionStates.set(workflowId, state)

    // Continue with next step
    console.log(`⏭️ [Workflow Execution] Moving to next step in 1 second...`)
    setTimeout(() => {
      executeWorkflowSteps(workflowId)
    }, 1000) // Small delay between steps
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage === 'EXECUTION_PAUSED_FOR_GUIDANCE') {
      // Execution paused for guidance - this is expected, don't log as error
      console.log(`⏸️ [Workflow Execution] Execution paused for guidance on step "${step.label}"`)
      return
    }
    console.error(`❌ [Workflow Execution] Error executing step "${step.label}":`, error)
    logTrace(workflowId, `Encountered an error while executing step ${step.label}: ${errorMessage}`)
    const workflow = getWorkflowById(workflowId)
    const digitalWorkerName = workflow?.assignedTo?.stakeholderName || 'default'
    
    // Log the error
    logErrorOrBlocker(
      workflowId,
      step.id,
      step.label,
      digitalWorkerName,
      errorMessage,
      'error'
    )
    
    // Emit review_needed event for error - this will show up in Control Room
    emitControlRoomUpdate({
      type: 'review_needed',
      data: {
        workflowId,
        stepId: step.id,
        digitalWorkerName,
        action: {
          type: 'error',
          payload: {
            step: step.label,
            message: `Error in step "${step.label}": ${errorMessage}`,
            error: errorMessage,
          },
        },
        timestamp: new Date(),
      },
    })
    
    stopExecution(workflowId, `Error in step "${step.label}": ${error}`)
  }
}

// Execute individual agent step
async function executeAgentStep(workflowId: string, step: WorkflowStep): Promise<void> {
  const workflow = getWorkflowById(workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }

  const state = executionStates.get(workflowId)
  const digitalWorkerName = workflow.assignedTo?.stakeholderName || 'default'
  const stepStartTime = Date.now()

  // Track step start time
  if (state) {
    state.stepStartTimes.set(step.id, stepStartTime)
  }

  // Log workflow step execution
  logWorkflowStepExecution(
    workflowId,
    step.id,
    step.label,
    step.type,
    digitalWorkerName,
    state?.currentStepIndex || 0,
    step.assignedTo
  )

  // Emit step start event
  emitControlRoomUpdate({
    type: 'workflow_update',
    data: {
      workflowId,
      stepId: step.id,
      message: `Executing step: ${step.label}`,
      timestamp: new Date(),
    },
  })

  // Skip execution for human-assigned steps
  if (step.assignedTo?.type === 'human') {
    console.log(`⏭️ [Agent Execution] Skipping human-assigned step: ${step.label}`)
    const stepDuration = Date.now() - stepStartTime
    logWorkflowStepComplete(workflowId, step.id, step.label, digitalWorkerName, stepDuration)
    emitControlRoomUpdate({
      type: 'workflow_update',
      data: {
        workflowId,
        stepId: step.id,
        message: `Skipped human step: ${step.label}`,
        timestamp: new Date(),
      },
    })
    return
  }

  // Skip blueprint validation for trigger steps (they're events, not actions)
  if (step.type === 'trigger') {
    console.log(`⏭️ [Agent Execution] Trigger step (event): ${step.label} - marking as complete`)
    const stepDuration = Date.now() - stepStartTime
    logWorkflowStepComplete(workflowId, step.id, step.label, digitalWorkerName, stepDuration)
    emitControlRoomUpdate({
      type: 'workflow_update',
      data: {
        workflowId,
        stepId: step.id,
        message: `Trigger step completed: ${step.label}`,
        timestamp: new Date(),
      },
    })
    return
  }

  // Get blueprint from step requirements
  const blueprint = step.requirements?.blueprint || { greenList: [], redList: [] }
  
  // Get guidance context for this step if available
  const guidanceContextRaw = state?.guidanceContext?.find((g) => g.stepId === step.id)?.chatHistory
  // Include system messages that have file data, and map to include Excel data
  const guidanceContext = guidanceContextRaw?.filter((msg) => {
    // Include user and agent messages, OR system messages with file data
    return msg.sender !== 'system' || ('excelData' in msg && msg.excelData) || ('uploadedFileName' in msg && msg.uploadedFileName)
  }).map((msg) => {
    // Include Excel data in the message text if available
    let text = msg.text
    if ('excelData' in msg && msg.excelData) {
      text = `${text}\n\nExcel Data:\n${msg.excelData}`
    }
    if ('uploadedFileName' in msg && msg.uploadedFileName) {
      text = `${text}\n\nUploaded file: ${msg.uploadedFileName}`
    }
    return {
      sender: msg.sender as 'user' | 'agent',
      text,
      timestamp: msg.timestamp,
    }
  }) as Array<{ sender: 'user' | 'agent'; text: string; timestamp: Date }> | undefined

  // Get integrations
  const integrations = {
    gmail: step.requirements?.integrations?.gmail || false,
  }

  try {
    // Execute agent action using LLM
    console.log(`🚀 [Agent Execution] Starting execution for step "${step.label}"...`)
    const result = await executeAgentAction(
      step,
      blueprint,
      guidanceContext,
      integrations,
      workflowId
    )

    const stepDuration = Date.now() - stepStartTime

    // Log step completion
    logWorkflowStepComplete(workflowId, step.id, step.label, digitalWorkerName, stepDuration)

    // Check if agent requested image generation
    const generateImageAction = result.actions.find(a => a.type === 'generate_image')
    let generatedImageUrl: string | undefined
    
    if (generateImageAction && generateImageAction.parameters?.imagePrompt) {
      console.log(`🎨 [Agent Execution] Generating image: ${generateImageAction.parameters.imagePrompt}`)
      logTrace(workflowId, `Generating image for step ${step.label}`)
      
      // Emit loading state for image generation
      emitControlRoomUpdate({
        type: 'workflow_update',
        data: {
          workflowId,
          stepId: step.id,
          digitalWorkerName,
          message: `🎨 Generating image... This may take a moment.`,
          action: {
            type: 'image_generating',
            payload: {
              step: step.label,
              prompt: generateImageAction.parameters.imagePrompt.substring(0, 100) + '...',
            },
          },
          timestamp: new Date(),
        },
      })
      
      try {
        // Get Excel data from guidance context if available
        const excelData = state?.guidanceContext?.find(g => g.stepId === step.id)
          ?.chatHistory.find(m => 'excelData' in m && m.excelData)?.excelData as string | undefined
        
        generatedImageUrl = await generateImage(generateImageAction.parameters.imagePrompt, excelData)
        console.log(`✅ [Agent Execution] Image generated successfully`)
        
        // Emit success state
        emitControlRoomUpdate({
          type: 'workflow_update',
          data: {
            workflowId,
            stepId: step.id,
            digitalWorkerName,
            message: `✅ Image generated successfully!`,
            timestamp: new Date(),
          },
        })
        
        // Check if agent wants to show the image for approval
        const showPreviewAction = result.actions.find(a => a.type === 'show_image_preview')
        if (showPreviewAction || result.previewImageCaption) {
          // Override the result to show the generated image for approval
          result.needsGuidance = true
          result.previewImageUrl = generatedImageUrl
          result.previewImageCaption = showPreviewAction?.parameters?.imageCaption || 
            result.previewImageCaption || 
            'Please review this generated image and approve or provide feedback'
        }
      } catch (imageError) {
        console.error(`❌ [Agent Execution] Failed to generate image:`, imageError)
        logTrace(workflowId, `Failed to generate image: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`)
        
        // Emit error state
        emitControlRoomUpdate({
          type: 'workflow_update',
          data: {
            workflowId,
            stepId: step.id,
            digitalWorkerName,
            message: `❌ Failed to generate image: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`,
            timestamp: new Date(),
          },
        })
        // Don't fail the whole step, just log the error
      }
    }

    // Check if agent needs guidance or wants to show something for review
    if (result.needsGuidance) {
      const guidanceQuestion = result.guidanceQuestion || `Agent needs guidance for step: ${step.label}`
      
      // Determine what type of request this is
      const hasFileRequest = result.requestedFileType || result.fileDescription
      const hasImagePreview = result.previewImageUrl || result.previewImageCaption
      
      if (hasFileRequest) {
        console.log(`📁 [Agent Execution] Agent requesting file upload: ${result.requestedFileType} - ${result.fileDescription}`)
        logTrace(workflowId, `Is requesting file upload for step ${step.label}. Type: ${result.requestedFileType}`)
      } else if (hasImagePreview) {
        console.log(`🖼️ [Agent Execution] Agent showing image for approval: ${result.previewImageCaption}`)
        logTrace(workflowId, `Is showing image preview for step ${step.label}`)
      } else {
        console.log(`💬 [Agent Execution] Agent requested guidance: ${guidanceQuestion}`)
        logTrace(workflowId, `Is requesting guidance for step ${step.label}. The agent needs to know: ${guidanceQuestion}`)
      }
      
      // Stop execution and request guidance
      if (state) {
        state.isRunning = false
        executionStates.set(workflowId, state)
      }

      emitControlRoomUpdate({
        type: 'review_needed',
        data: {
          workflowId,
          stepId: step.id,
          digitalWorkerName,
          action: {
            type: hasFileRequest ? 'file_upload_requested' : (hasImagePreview ? 'image_preview' : 'guidance_requested'),
            payload: {
              step: step.label,
              message: guidanceQuestion,
              needsGuidance: true,
              // File request fields
              requestedFileType: result.requestedFileType,
              fileDescription: result.fileDescription,
              // Image preview fields
              previewImageUrl: result.previewImageUrl,
              previewImageCaption: result.previewImageCaption,
            },
          },
          timestamp: new Date(),
        },
      })
      throw new Error('EXECUTION_PAUSED_FOR_GUIDANCE')
    }

    // Check if step requires review (decision steps or steps with blueprint that need approval)
    if (step.type === 'decision' || (step.requirements?.blueprint && result.actions.length > 0)) {
      // Emit review needed event
      emitControlRoomUpdate({
        type: 'review_needed',
        data: {
          workflowId,
          stepId: step.id,
          digitalWorkerName, // Use main digital worker name, not sub-agent
          action: {
            type: 'approval_required',
            payload: {
              step: step.label,
              message: result.message || `Action completed for step: ${step.label}. Review required.`,
            },
          },
          timestamp: new Date(),
        },
      })
      
      // Stop execution until approved
      if (state) {
        state.isRunning = false
        executionStates.set(workflowId, state)
      }
      return
    }

    // Step completed successfully
    console.log(`✅ [Agent Execution] Step "${step.label}" completed: ${result.message}`)
    emitControlRoomUpdate({
      type: 'workflow_update',
      data: {
        workflowId,
        stepId: step.id,
        message: result.message || `Completed step: ${step.label}`,
        timestamp: new Date(),
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ [Agent Execution] Error executing step "${step.label}":`, errorMessage)
    
    // Check if it's a guidance request error
    if (errorMessage.includes('guidance') || errorMessage.includes('Guidance requested')) {
      if (state) {
        state.isRunning = false
        executionStates.set(workflowId, state)
      }

      emitControlRoomUpdate({
        type: 'review_needed',
        data: {
          workflowId,
          stepId: step.id,
          digitalWorkerName, // Use main digital worker name, not sub-agent
          action: {
            type: 'guidance_requested',
            payload: {
              step: step.label,
              message: errorMessage,
              needsGuidance: true,
            },
          },
          timestamp: new Date(),
        },
      })
      return
    }
    
    // Re-throw other errors to be caught by executeWorkflowSteps
    throw error
  }
}

// Complete workflow
function completeWorkflow(workflowId: string, workflow: Workflow): void {
  const state = executionStates.get(workflowId)
  const digitalWorkerName = workflow.assignedTo?.stakeholderName || 'default'
  const totalDuration = state
    ? Date.now() - state.startTime.getTime()
    : 0

  // Get end step configuration message if available
  const endStep = workflow.steps.find((s) => s.type === 'end')
  const completionMessage = endStep?.requirements?.requirementsText 
    ? endStep.requirements.requirementsText 
    : `Workflow "${workflow.name}" completed`

  // Log workflow completion
  logWorkflowComplete(workflowId, digitalWorkerName, totalDuration, workflow.steps.length)

  stopExecution(workflowId)

  emitControlRoomUpdate({
    type: 'completed',
    data: {
      workflowId,
      digitalWorkerName,
      message: completionMessage,
      timestamp: new Date(),
    },
  })
}

// Stop execution
function stopExecution(workflowId: string, reason?: string): void {
  const state = executionStates.get(workflowId)
  if (state) {
    state.isRunning = false
    executionStates.set(workflowId, state)

    if (reason) {
      emitControlRoomUpdate({
        type: 'workflow_update',
        data: {
          workflowId,
          message: `Workflow stopped: ${reason}`,
          timestamp: new Date(),
        },
      })
    }
  }
}

// Emit control room update event
function emitControlRoomUpdate(update: ControlRoomUpdate): void {
  const event = new CustomEvent(CONTROL_ROOM_EVENT, {
    detail: update,
  })
  window.dispatchEvent(event)
}

// Get execution state
export function getExecutionState(workflowId: string): ExecutionState | null {
  return executionStates.get(workflowId) || null
}

// Approve review item
export function approveReviewItem(reviewItem: ReviewItem): void {
  const workflow = getWorkflowById(reviewItem.workflowId)
  if (!workflow) {
    return
  }

  const state = executionStates.get(reviewItem.workflowId)
  const isError = reviewItem.action.type === 'error'
  // Handle all guidance-related action types (including file uploads and image previews)
  const isGuidance = reviewItem.action.type === 'guidance_requested' ||
                     reviewItem.action.type === 'file_upload_requested' ||
                     reviewItem.action.type === 'image_preview'

  // Store chat history/guidance in execution state for agent to use
  if (reviewItem.chatHistory && reviewItem.chatHistory.length > 0 && state) {
    // Store guidance context for the agent
    if (!state.guidanceContext) {
      state.guidanceContext = []
    }
    state.guidanceContext.push({
      stepId: reviewItem.stepId,
      chatHistory: reviewItem.chatHistory,
      timestamp: new Date(),
    })
    executionStates.set(reviewItem.workflowId, state)
  }

  if ((isError || isGuidance) && state) {
    // For errors or guidance, retry the current step (don't increment)
    // Reset the step start time if it exists
    if (state.stepStartTimes) {
      state.stepStartTimes.delete(reviewItem.stepId)
    }
    // Restart execution (set isRunning back to true)
    state.isRunning = true
    executionStates.set(reviewItem.workflowId, state)
    // Continue execution from current step (retry/continue with guidance)
    executeWorkflowSteps(reviewItem.workflowId)
  } else if (state && state.isRunning) {
    // For approval_required, continue to next step
    executeWorkflowSteps(reviewItem.workflowId)
  }

  // Emit approval/retry event
  emitControlRoomUpdate({
    type: 'workflow_update',
    data: {
      workflowId: reviewItem.workflowId,
      stepId: reviewItem.stepId,
      message: isError 
        ? `Retrying step after error` 
        : isGuidance 
        ? `Guidance provided for step`
        : `Approved: ${reviewItem.action.type}`,
      timestamp: new Date(),
    },
  })
}

// Provide guidance to a review item (chat message)
export function provideGuidanceToReviewItem(reviewItemId: string, message: string): void {
  // This function is called when user sends a chat message
  // The message is already added to the review item's chatHistory in the component
  // Here we can emit an event to notify the agent or log it
  console.log(`💬 [Guidance] User provided guidance to review item ${reviewItemId}: ${message}`)
  
  // In a real implementation, this would notify the agent with the guidance
  // For now, it's stored in the review item's chatHistory and will be passed
  // to the agent when approveReviewItem is called
}

// Reject review item (optionally retry with feedback)
export function rejectReviewItem(reviewItem: ReviewItem, retryWithFeedback: boolean = false): void {
  const workflow = getWorkflowById(reviewItem.workflowId)
  
  if (retryWithFeedback && workflow) {
    // Store feedback in guidance context and retry the step
    const state = executionStates.get(reviewItem.workflowId)
    
    if (state && reviewItem.chatHistory && reviewItem.chatHistory.length > 0) {
      // Store the rejection feedback in guidance context
      if (!state.guidanceContext) {
        state.guidanceContext = []
      }
      state.guidanceContext.push({
        stepId: reviewItem.stepId,
        chatHistory: reviewItem.chatHistory,
        timestamp: new Date(),
      })
      executionStates.set(reviewItem.workflowId, state)
      
      // Reset step and restart execution
      state.isRunning = true
      if (state.stepStartTimes) {
        state.stepStartTimes.delete(reviewItem.stepId)
      }
      
      emitControlRoomUpdate({
        type: 'workflow_update',
        data: {
          workflowId: reviewItem.workflowId,
          stepId: reviewItem.stepId,
          message: `Retrying with feedback: ${reviewItem.action.type}`,
          timestamp: new Date(),
        },
      })
      
      // Retry the step
      executeWorkflowSteps(reviewItem.workflowId)
      return
    }
  }
  
  // Just dismiss without retry
  emitControlRoomUpdate({
    type: 'workflow_update',
    data: {
      workflowId: reviewItem.workflowId,
      stepId: reviewItem.stepId,
      message: `Rejected: ${reviewItem.action.type}`,
      timestamp: new Date(),
    },
  })
}
