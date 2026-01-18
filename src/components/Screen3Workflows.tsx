import { useState } from 'react'
import { Workflow as WorkflowIcon, CheckCircle, AlertCircle } from 'lucide-react'
import { useWorkflows } from '../contexts/WorkflowContext'
import { checkWorkflowReadiness } from '../services/workflowReadinessService'
import WorkflowFlowchart from './WorkflowFlowchart'
import RequirementsGatherer from './RequirementsGatherer'
import Button from './ui/Button'
import Card from './ui/Card'
import Modal from './ui/Modal'

export default function Screen3Workflows() {
  const { workflows, activateWorkflow } = useWorkflows()
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [isRequirementsMode, setIsRequirementsMode] = useState(false)
  const [showActivationModal, setShowActivationModal] = useState(false)
  const [activationMessage, setActivationMessage] = useState<{ type: 'success' | 'error'; title: string; message: string; errors?: string[] } | null>(null)

  const selectedWorkflow = selectedWorkflowId
    ? workflows.find((w) => w.id === selectedWorkflowId)
    : null

  const handleWorkflowSelect = (workflowId: string) => {
    setSelectedWorkflowId(workflowId)
    setSelectedStepId(null)
  }

  const handleStepClick = (stepId: string) => {
    setSelectedStepId(stepId)
    setIsRequirementsMode(true)
  }

  const handleBackFromRequirements = () => {
    setIsRequirementsMode(false)
    setSelectedStepId(null)
  }

  const handleActivate = () => {
    if (!selectedWorkflowId) return

    const readiness = checkWorkflowReadiness(selectedWorkflowId)
    if (readiness.isReady) {
      activateWorkflow(selectedWorkflowId)
      setActivationMessage({
        type: 'success',
        title: 'Workflow Activated',
        message: 'Your workflow has been successfully activated and is now ready to run.',
      })
      setShowActivationModal(true)
    } else {
      setActivationMessage({
        type: 'error',
        title: 'Cannot Activate Workflow',
        message: 'Please complete all requirements before activating this workflow.',
        errors: readiness.errors,
      })
      setShowActivationModal(true)
    }
  }

  const selectedStep = selectedWorkflow?.steps.find((s) => s.id === selectedStepId)

  // If in requirements mode, show full-page requirements gatherer
  if (isRequirementsMode && selectedStep && selectedWorkflow) {
    return (
      <RequirementsGatherer
        workflowId={selectedWorkflow.id}
        step={selectedStep}
        workflowName={selectedWorkflow.name}
        stepIndex={selectedWorkflow.steps.findIndex((s) => s.id === selectedStepId) + 1}
        onComplete={handleBackFromRequirements}
        onBack={handleBackFromRequirements}
      />
    )
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Left Panel - Workflow List */}
      <div className="w-1/3 border-r border-gray-lighter flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-lighter">
          <h1 className="text-2xl font-semibold text-gray-dark mb-2">Workflows</h1>
          <p className="text-sm text-gray-darker">
            Workflows are automatically created from your 'Create a Task' conversations
          </p>
        </div>

        {/* Workflow List */}
        <div className="flex-1 overflow-y-auto p-4">
          {workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <WorkflowIcon className="h-16 w-16 text-gray-lighter mb-4" />
              <p className="text-lg font-semibold text-gray-dark mb-2">No workflows yet</p>
              <p className="text-sm text-gray-darker">
                Start a conversation in 'Create a Task' to automatically generate workflows
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {workflows.map((workflow) => (
                <Card
                  key={workflow.id}
                  variant={selectedWorkflowId === workflow.id ? 'elevated' : 'outlined'}
                  className={`cursor-pointer transition-all ${
                    selectedWorkflowId === workflow.id
                      ? 'ring-2 ring-accent-blue'
                      : 'hover:bg-gray-light'
                  }`}
                  onClick={() => handleWorkflowSelect(workflow.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-dark">{workflow.name}</h3>
                      <p className="text-xs text-gray-darker mt-1">
                        {workflow.steps.length} steps • {workflow.status}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        workflow.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-lighter text-gray-darker'
                      }`}
                    >
                      {workflow.status}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Workflow Details */}
      <div className="flex-1 flex flex-col">
        {!selectedWorkflow ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <WorkflowIcon className="h-16 w-16 text-gray-lighter mb-4" />
            <p className="text-lg font-semibold text-gray-dark mb-2">No Workflow Selected</p>
            <p className="text-sm text-gray-darker max-w-md">
              Workflows are automatically created as you chat with the consultant in 'Create a
              Task'. Start a conversation there to see workflows appear here!
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-6 border-b border-gray-lighter">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-dark">{selectedWorkflow.name}</h2>
                  {selectedWorkflow.description && (
                    <p className="text-sm text-gray-darker mt-1">{selectedWorkflow.description}</p>
                  )}
                </div>
                {selectedWorkflow.status === 'draft' && (
                  <Button variant="primary" onClick={handleActivate}>
                    Activate Workflow
                  </Button>
                )}
              </div>
            </div>

            {/* Flowchart */}
            <div className="flex-1 overflow-y-auto">
              <WorkflowFlowchart
                steps={selectedWorkflow.steps}
                selectedStepId={selectedStepId || undefined}
                onStepClick={handleStepClick}
              />
            </div>
          </>
        )}
      </div>

      {/* Activation Modal */}
      <Modal
        isOpen={showActivationModal}
        onClose={() => {
          setShowActivationModal(false)
          setActivationMessage(null)
        }}
        title=""
        size="sm"
      >
        <div className="p-6">
          {activationMessage?.type === 'success' ? (
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-dark mb-2">
                {activationMessage.title}
              </h3>
              <p className="text-sm text-gray-darker mb-6">
                {activationMessage.message}
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  setShowActivationModal(false)
                  setActivationMessage(null)
                }}
                className="min-w-[120px]"
              >
                Got it
              </Button>
            </div>
          ) : activationMessage?.type === 'error' ? (
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-dark mb-2">
                {activationMessage.title}
              </h3>
              <p className="text-sm text-gray-darker mb-4">
                {activationMessage.message}
              </p>
              {activationMessage.errors && activationMessage.errors.length > 0 && (
                <div className="w-full mb-6">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                    <p className="text-xs font-semibold text-red-800 mb-2">Issues to resolve:</p>
                    <ul className="space-y-1">
                      {activationMessage.errors.map((error, index) => (
                        <li key={index} className="text-xs text-red-700 flex items-start gap-2">
                          <span className="text-red-500 mt-0.5">•</span>
                          <span>{error}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  setShowActivationModal(false)
                  setActivationMessage(null)
                }}
                className="min-w-[120px]"
              >
                OK
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
