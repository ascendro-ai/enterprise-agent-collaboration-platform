import type { Workflow, WorkflowStep } from '../types'

export const validation = {
  isWorkflowValid: (workflow: Workflow): boolean => {
    if (!workflow.name || workflow.name.trim() === '') {
      return false
    }
    if (!workflow.steps || workflow.steps.length === 0) {
      return false
    }
    return true
  },

  areRequirementsComplete: (step: WorkflowStep): boolean => {
    if (!step.requirements) {
      return false
    }
    return step.requirements.isComplete === true
  },

  isWorkflowReady: (workflow: Workflow): boolean => {
    if (workflow.status !== 'draft') {
      return false
    }
    if (!validation.isWorkflowValid(workflow)) {
      return false
    }
    // Check if all steps have complete requirements
    const allRequirementsComplete = workflow.steps.every((step) => {
      // Trigger and end steps might not need requirements
      if (step.type === 'trigger' || step.type === 'end') {
        return true
      }
      return validation.areRequirementsComplete(step)
    })
    return allRequirementsComplete
  },

  hasGmailIntegration: (step: WorkflowStep): boolean => {
    return step.requirements?.integrations?.gmail === true
  },

  requiresGmailAuth: (workflow: Workflow): boolean => {
    return workflow.steps.some((step) => validation.hasGmailIntegration(step))
  },
}
