import { storage } from '../utils/storage'
import { validation } from '../utils/validation'
import type { Workflow, AgentConfiguration } from '../types'

// Load workflow by ID
export function getWorkflowById(workflowId: string): Workflow | null {
  const workflows = storage.getWorkflows()
  return workflows.find((w) => w.id === workflowId) || null
}

// Load agent configuration
export function getAgentConfig(agentId: string): AgentConfiguration | null {
  // For now, agent configs are stored in workflow steps
  // In a full implementation, this would load from a separate storage
  const workflows = storage.getWorkflows()
  for (const workflow of workflows) {
    for (const step of workflow.steps) {
      if (step.assignedTo?.agentName === agentId) {
        // Return a mock agent config based on step requirements
        return {
          id: agentId,
          name: step.assignedTo.agentName,
          stepId: step.id,
          workflowId: workflow.id,
          blueprint: step.requirements?.blueprint || { greenList: [], redList: [] },
          integrations: {
            gmail: step.requirements?.integrations?.gmail
              ? {
                  authenticated: step.requirements.integrations.gmail === true,
                  account: undefined,
                }
              : undefined,
          },
          status: 'configured',
          createdAt: new Date(),
        }
      }
    }
  }
  return null
}

// Check if workflow is ready for activation
export function checkWorkflowReadiness(workflowId: string): {
  isReady: boolean
  errors: string[]
} {
  const workflow = getWorkflowById(workflowId)
  const errors: string[] = []

  if (!workflow) {
    return { isReady: false, errors: ['Workflow not found'] }
  }

  // Check basic validation
  if (!validation.isWorkflowValid(workflow)) {
    errors.push('Workflow is invalid')
  }

  // Check if workflow is in draft status
  if (workflow.status !== 'draft') {
    errors.push('Workflow must be in draft status to activate')
  }

  // Check if all steps have complete requirements
  const stepsWithoutRequirements = workflow.steps.filter((step) => {
    if (step.type === 'trigger' || step.type === 'end') {
      return false // These don't need requirements
    }
    return !validation.areRequirementsComplete(step)
  })

  if (stepsWithoutRequirements.length > 0) {
    errors.push(
      `The following steps need requirements: ${stepsWithoutRequirements.map((s) => s.label).join(', ')}`
    )
  }

  // Check Gmail integration if needed
  if (validation.requiresGmailAuth(workflow)) {
    const gmailAuth = storage.getGmailAuth()
    if (!gmailAuth || !gmailAuth.authenticated) {
      errors.push('Gmail authentication required for this workflow')
    }
  }

  return {
    isReady: errors.length === 0,
    errors,
  }
}
