import { X } from 'lucide-react'
import type { Workflow } from '../../types'
import RequirementsGatherer from '../RequirementsGatherer'

interface RequirementsSlideOverProps {
  workflow: Workflow
  stepId: string
  onClose: () => void
}

export default function RequirementsSlideOver({
  workflow,
  stepId,
  onClose,
}: RequirementsSlideOverProps) {
  // Find the step
  const step = workflow.steps.find(s => s.id === stepId)
  const stepIndex = workflow.steps.findIndex(s => s.id === stepId)

  if (!step) {
    return null
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Configure Step
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {step.label}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Close and return to chat"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* Requirements Gatherer Content */}
      <div className="flex-1 overflow-hidden">
        <RequirementsGatherer
          step={step}
          workflowId={workflow.id}
          workflowName={workflow.name}
          stepIndex={stepIndex}
          onComplete={onClose}
          onBack={onClose}
          isSlideOver={true}
        />
      </div>
    </div>
  )
}
