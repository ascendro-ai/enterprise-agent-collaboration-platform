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
    chatHistory: Array<{ sender: 'user' | 'agent'; text: string; timestamp: Date }>
    timestamp: Date
  }>
}

const executionStates = new Map<string, ExecutionState>()

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
    completeWorkflow(workflowId, workflow)
    return
  }

  const step = workflow.steps[state.currentStepIndex]
  console.log(`▶️ [Workflow Execution] Executing step: "${step.label}" (${step.type}, assigned to: ${step.assignedTo?.type || 'none'})`)

  try {
    // Execute the step
    await executeAgentStep(workflowId, step)
    
    console.log(`✅ [Workflow Execution] Step "${step.label}" completed successfully`)

    // Move to next step
    state.currentStepIndex++
    executionStates.set(workflowId, state)

    // Continue with next step
    console.log(`⏭️ [Workflow Execution] Moving to next step in 1 second...`)
    setTimeout(() => {
      executeWorkflowSteps(workflowId)
    }, 1000) // Small delay between steps
  } catch (error) {
    console.error(`❌ [Workflow Execution] Error executing step "${step.label}":`, error)
    const workflow = getWorkflowById(workflowId)
    const digitalWorkerName = workflow?.assignedTo?.stakeholderName || 'default'
    const errorMessage = error instanceof Error ? error.message : String(error)
    
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

  // Get blueprint from step requirements
  const blueprint = step.requirements?.blueprint || { greenList: [], redList: [] }
  
  // Get guidance context for this step if available
  const guidanceContext = state?.guidanceContext?.find((g) => g.stepId === step.id)?.chatHistory

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
      integrations
    )

    const stepDuration = Date.now() - stepStartTime

    // Log step completion
    logWorkflowStepComplete(workflowId, step.id, step.label, digitalWorkerName, stepDuration)

    // Check if agent needs guidance
    if (result.needsGuidance) {
      console.log(`💬 [Agent Execution] Agent requested guidance: ${result.guidanceQuestion}`)
      
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
          digitalWorkerName: step.assignedTo?.agentName || digitalWorkerName,
          action: {
            type: 'guidance_requested',
            payload: {
              step: step.label,
              message: result.guidanceQuestion || `Agent needs guidance for step: ${step.label}`,
              needsGuidance: true,
            },
          },
          timestamp: new Date(),
        },
      })
      return // Don't continue until guidance is provided
    }

    // Check if step requires review (decision steps or steps with blueprint that need approval)
    if (step.type === 'decision' || (step.requirements?.blueprint && result.actions.length > 0)) {
      // Emit review needed event
      emitControlRoomUpdate({
        type: 'review_needed',
        data: {
          workflowId,
          stepId: step.id,
          digitalWorkerName: step.assignedTo?.agentName || digitalWorkerName,
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
          digitalWorkerName: step.assignedTo?.agentName || digitalWorkerName,
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

  // Log workflow completion
  logWorkflowComplete(workflowId, digitalWorkerName, totalDuration, workflow.steps.length)

  stopExecution(workflowId)

  emitControlRoomUpdate({
    type: 'completed',
    data: {
      workflowId,
      digitalWorkerName,
      message: `Workflow "${workflow.name}" completed`,
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

  if (isError && state) {
    // For errors, retry the current step (don't increment)
    // Reset the step start time if it exists
    if (state.stepStartTimes) {
      state.stepStartTimes.delete(reviewItem.stepId)
    }
    // Restart execution (set isRunning back to true for retry)
    state.isRunning = true
    executionStates.set(reviewItem.workflowId, state)
    // Continue execution from current step (retry)
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
      message: isError ? `Retrying step after error` : `Approved: ${reviewItem.action.type}`,
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

// Reject review item
export function rejectReviewItem(reviewItem: ReviewItem): void {
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
