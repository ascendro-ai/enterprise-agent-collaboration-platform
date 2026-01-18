import { WorkflowStep } from '../types'

interface WorkflowFlowchartProps {
  steps: WorkflowStep[]
  selectedStepId?: string
  onStepClick?: (stepId: string) => void
}

export default function WorkflowFlowchart({
  steps,
  selectedStepId,
  onStepClick,
}: WorkflowFlowchartProps) {
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

  const getStepColor = (step: WorkflowStep) => {
    if (selectedStepId === step.id) {
      return 'bg-accent-blue text-white'
    }
    switch (step.type) {
      case 'trigger':
        return 'bg-green-100 text-green-800'
      case 'end':
        return 'bg-red-100 text-red-800'
      case 'decision':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-lighter text-gray-dark'
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {sortedSteps.map((step, index) => (
        <div key={step.id} className="flex flex-col items-center gap-2">
          {/* Step Node */}
          <button
            onClick={() => onStepClick?.(step.id)}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              selectedStepId === step.id ? 'ring-2 ring-accent-blue' : ''
            } ${getStepColor(step)}`}
          >
            {step.label}
          </button>
          {/* Connector Arrow */}
          {index < sortedSteps.length - 1 && (
            <div className="w-0.5 h-8 bg-gray-darker" />
          )}
        </div>
      ))}
    </div>
  )
}
