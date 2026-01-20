import { useState, useEffect, useCallback } from 'react'
import { useWorkflows } from '../../contexts/WorkflowContext'
import { useTeam } from '../../contexts/TeamContext'
import type { Workflow, ConversationMessage, WorkflowStep } from '../../types'
import WorkflowSidebar from './WorkflowSidebar'
import WorkflowCanvas from './WorkflowCanvas'
import ExampleCardsView from './ExampleCardsView'
import CanvasChat from './CanvasChat'
import RequirementsSlideOver from './RequirementsSlideOver'
import { X, User } from 'lucide-react'

export default function CreateWorkflow() {
  const { workflows, createDraftWorkflow, updateWorkflowConversation, autoNameWorkflow, toggleWorkflowStatus, updateWorkflow } = useWorkflows()
  const { team } = useTeam()
  
  // Core state
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [showRequirementsPanel, setShowRequirementsPanel] = useState(false)
  const [viewMode, setViewMode] = useState<'examples' | 'canvas'>('examples')
  
  // Human assignment state
  const [assigningStepId, setAssigningStepId] = useState<string | null>(null)
  
  // Get the currently selected workflow
  const selectedWorkflow = selectedWorkflowId 
    ? workflows.find(w => w.id === selectedWorkflowId) 
    : null

  // Handle creating a new workflow
  const handleNewWorkflow = useCallback(() => {
    const newWorkflow = createDraftWorkflow()
    setSelectedWorkflowId(newWorkflow.id)
    setViewMode('examples')
    setSelectedStepId(null)
    setShowRequirementsPanel(false)
  }, [createDraftWorkflow])

  // Handle selecting a workflow from sidebar
  const handleWorkflowSelect = useCallback((workflowId: string) => {
    const workflow = workflows.find(w => w.id === workflowId)
    setSelectedWorkflowId(workflowId)
    setSelectedStepId(null)
    setShowRequirementsPanel(false)
    
    // Show canvas if workflow has conversation OR steps
    if (workflow) {
      const hasConversation = workflow.conversation && workflow.conversation.length > 0
      const hasSteps = workflow.steps.length > 0
      
      if (hasSteps || hasConversation) {
        setViewMode('canvas')
      } else {
        setViewMode('examples')
      }
    } else {
      setViewMode('examples')
    }
  }, [workflows])

  // Handle clicking a step on the canvas
  const handleStepClick = useCallback((stepId: string) => {
    setSelectedStepId(stepId)
    setShowRequirementsPanel(true)
  }, [])

  // Handle closing the requirements panel
  const handleCloseRequirements = useCallback(() => {
    setShowRequirementsPanel(false)
    setSelectedStepId(null)
  }, [])

  // Handle human assignment click from flowchart
  const handleHumanAssign = useCallback((stepId: string) => {
    setAssigningStepId(stepId)
  }, [])

  // Handle selecting a human for assignment
  const handleSelectHuman = useCallback((humanId: string, humanName: string) => {
    if (!selectedWorkflow || !assigningStepId) return
    
    // Update the step with the assigned human
    const updatedSteps = selectedWorkflow.steps.map((step: WorkflowStep) => {
      if (step.id === assigningStepId) {
        return {
          ...step,
          assignedTo: {
            ...step.assignedTo,
            type: 'human' as const,
            humanId,
            humanName,
          }
        }
      }
      return step
    })
    
    updateWorkflow(selectedWorkflow.id, { steps: updatedSteps })
    setAssigningStepId(null)
  }, [selectedWorkflow, assigningStepId, updateWorkflow])

  // Get human workers from team
  const humanWorkers = team.filter(node => node.type === 'human')

  // Handle example card click - creates workflow if needed and sets up conversation
  const handleExampleClick = useCallback((prompt: string) => {
    if (!selectedWorkflowId) {
      // Create a new draft workflow if none selected (like ChatGPT auto-creating conversation)
      const newWorkflow = createDraftWorkflow(prompt)
      setSelectedWorkflowId(newWorkflow.id)
      
      // Add the initial user message to the new workflow's conversation
      const userMessage: ConversationMessage = {
        sender: 'user',
        text: prompt,
        timestamp: new Date(),
      }
      updateWorkflowConversation(newWorkflow.id, [userMessage])
      
      // Switch to canvas view immediately
      setViewMode('canvas')
    }
  }, [selectedWorkflowId, createDraftWorkflow, updateWorkflowConversation])

  // Handle first message - switch to canvas view immediately
  const handleFirstMessage = useCallback((message: string) => {
    if (selectedWorkflowId) {
      // Auto-name the workflow
      autoNameWorkflow(selectedWorkflowId, message)
      // Switch to canvas view immediately so user sees canvas + chat
      setViewMode('canvas')
    }
  }, [selectedWorkflowId, autoNameWorkflow])

  // Handle conversation updates
  const handleConversationUpdate = useCallback((messages: ConversationMessage[]) => {
    if (selectedWorkflowId) {
      updateWorkflowConversation(selectedWorkflowId, messages)
    }
  }, [selectedWorkflowId, updateWorkflowConversation])

  // Auto-select first workflow or create new one on mount
  useEffect(() => {
    if (!selectedWorkflowId && workflows.length > 0) {
      // Select the most recently updated workflow
      const sortedWorkflows = [...workflows].sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return dateB - dateA
      })
      handleWorkflowSelect(sortedWorkflows[0].id)
    }
  }, [workflows, selectedWorkflowId, handleWorkflowSelect])

  // Switch to canvas view when workflow has conversation OR steps
  useEffect(() => {
    if (selectedWorkflow && viewMode === 'examples') {
      const hasConversation = selectedWorkflow.conversation && selectedWorkflow.conversation.length > 0
      const hasSteps = selectedWorkflow.steps.length > 0
      
      if (hasSteps || hasConversation) {
        setViewMode('canvas')
      }
    }
  }, [selectedWorkflow?.steps.length, selectedWorkflow?.conversation?.length, viewMode, selectedWorkflow])

  return (
    <div className="flex h-full bg-gray-50">
      {/* Left Sidebar - Workflow List */}
      <WorkflowSidebar
        workflows={workflows}
        selectedWorkflowId={selectedWorkflowId}
        onWorkflowSelect={handleWorkflowSelect}
        onNewWorkflow={handleNewWorkflow}
        onToggleStatus={toggleWorkflowStatus}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex">
        {viewMode === 'examples' ? (
          <ExampleCardsView
            onExampleClick={handleExampleClick}
            onFirstMessage={handleFirstMessage}
            selectedWorkflow={selectedWorkflow}
            onConversationUpdate={handleConversationUpdate}
          />
        ) : showRequirementsPanel && selectedWorkflow && selectedStepId ? (
          /* Two-column layout when requirements panel is open */
          <>
            {/* Left: Canvas (25% width - just a preview) */}
            <div className="w-1/4 min-w-[250px] flex flex-col relative border-r border-gray-200">
              <WorkflowCanvas
                workflow={selectedWorkflow}
                selectedStepId={selectedStepId}
                onStepClick={handleStepClick}
                onHumanAssign={handleHumanAssign}
              />
              {/* Chat is hidden but state is preserved - it will reappear when panel closes */}
            </div>

            {/* Right: Requirements Panel (75% width) */}
            <div className="flex-1 bg-white flex flex-col">
              <RequirementsSlideOver
                workflow={selectedWorkflow}
                stepId={selectedStepId}
                onClose={handleCloseRequirements}
              />
            </div>
          </>
        ) : (
          /* Normal layout with canvas and bottom chat */
          <div className="flex-1 flex flex-col relative">
            {/* Canvas Area */}
            <WorkflowCanvas
              workflow={selectedWorkflow}
              selectedStepId={selectedStepId}
              onStepClick={handleStepClick}
              onHumanAssign={handleHumanAssign}
            />

            {/* Bottom Chat Overlay */}
            <CanvasChat
              workflow={selectedWorkflow}
              onConversationUpdate={handleConversationUpdate}
              onFirstMessage={handleFirstMessage}
            />
          </div>
        )}
      </div>

      {/* Human Assignment Modal */}
      {assigningStepId && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Assign to Team Member</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Select who should handle this task
                </p>
              </div>
              <button
                onClick={() => setAssigningStepId(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Human List */}
            <div className="p-4 max-h-80 overflow-y-auto">
              {humanWorkers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No team members found</p>
                  <p className="text-xs mt-1">Add team members in "Your Team" first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {humanWorkers.map((human) => {
                    // Check if this human is already assigned to this step
                    const currentStep = selectedWorkflow?.steps.find(s => s.id === assigningStepId)
                    const isAssigned = currentStep?.assignedTo?.humanId === human.id
                    
                    return (
                      <button
                        key={human.id}
                        onClick={() => handleSelectHuman(human.id, human.name)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                          isAssigned 
                            ? 'border-purple-300 bg-purple-50' 
                            : 'border-gray-200 hover:border-purple-200 hover:bg-purple-50/50'
                        }`}
                      >
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-semibold text-sm">
                          {human.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{human.name}</p>
                          <p className="text-xs text-gray-500 truncate">{human.role || 'Team Member'}</p>
                        </div>

                        {/* Assigned indicator */}
                        {isAssigned && (
                          <div className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                            Assigned
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setAssigningStepId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
