import { CONTROL_ROOM_EVENT } from '../utils/constants'
import { getWorkflowById } from './workflowReadinessService'
import type { Workflow, ControlRoomUpdate, ReviewItem, WorkflowStep } from '../types'

// Execution state
interface ExecutionState {
  workflowId: string
  currentStepIndex: number
  isRunning: boolean
  startTime: Date
}

const executionStates = new Map<string, ExecutionState>()

// Start workflow execution
export function startWorkflowExecution(workflowId: string): void {
  const workflow = getWorkflowById(workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }

  if (workflow.status !== 'active') {
    throw new Error('Workflow must be active to execute')
  }

  executionStates.set(workflowId, {
    workflowId,
    currentStepIndex: 0,
    isRunning: true,
    startTime: new Date(),
  })

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
  const state = executionStates.get(workflowId)
  if (!state || !state.isRunning) {
    return
  }

  const workflow = getWorkflowById(workflowId)
  if (!workflow) {
    stopExecution(workflowId, 'Workflow not found')
    return
  }

  if (state.currentStepIndex >= workflow.steps.length) {
    // Workflow completed
    completeWorkflow(workflowId, workflow)
    return
  }

  const step = workflow.steps[state.currentStepIndex]

  try {
    // Execute the step
    await executeAgentStep(workflowId, step)

    // Move to next step
    state.currentStepIndex++
    executionStates.set(workflowId, state)

    // Continue with next step
    setTimeout(() => {
      executeWorkflowSteps(workflowId)
    }, 1000) // Small delay between steps
  } catch (error) {
    console.error('Error executing step:', error)
    stopExecution(workflowId, `Error in step "${step.label}": ${error}`)
  }
}

// Execute individual agent step
async function executeAgentStep(workflowId: string, step: WorkflowStep): Promise<void> {
  const workflow = getWorkflowById(workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }

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

  // Simulate step execution
  // In a real implementation, this would call the actual agent
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Check if step requires review
  if (step.type === 'decision' || step.requirements?.blueprint) {
    // Emit review needed event
    emitControlRoomUpdate({
      type: 'review_needed',
      data: {
        workflowId,
        stepId: step.id,
        digitalWorkerName: step.assignedTo?.agentName || 'default',
        action: {
          type: 'approval_required',
          payload: {
            step: step.label,
            message: `Action required for step: ${step.label}`,
          },
        },
        timestamp: new Date(),
      },
    })
  } else {
    // Step completed
    emitControlRoomUpdate({
      type: 'workflow_update',
      data: {
        workflowId,
        stepId: step.id,
        message: `Completed step: ${step.label}`,
        timestamp: new Date(),
      },
    })
  }
}

// Complete workflow
function completeWorkflow(workflowId: string, workflow: Workflow): void {
  stopExecution(workflowId)

  emitControlRoomUpdate({
    type: 'completed',
    data: {
      workflowId,
      digitalWorkerName: workflow.assignedTo?.stakeholderName || 'default',
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

  // Continue execution
  const state = executionStates.get(reviewItem.workflowId)
  if (state && state.isRunning) {
    executeWorkflowSteps(reviewItem.workflowId)
  }

  // Emit approval event
  emitControlRoomUpdate({
    type: 'workflow_update',
    data: {
      workflowId: reviewItem.workflowId,
      stepId: reviewItem.stepId,
      message: `Approved: ${reviewItem.action.type}`,
      timestamp: new Date(),
    },
  })
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
