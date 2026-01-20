import { useState, useEffect, useCallback } from 'react'
import { useWorkflows } from '../../contexts/WorkflowContext'
import type { Workflow, ConversationMessage } from '../../types'
import WorkflowSidebar from './WorkflowSidebar'
import WorkflowCanvas from './WorkflowCanvas'
import ExampleCardsView from './ExampleCardsView'
import CanvasChat from './CanvasChat'
import RequirementsSlideOver from './RequirementsSlideOver'

export default function CreateWorkflow() {
  const { workflows, createDraftWorkflow, updateWorkflowConversation, autoNameWorkflow, toggleWorkflowStatus } = useWorkflows()
  
  // Core state
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [showRequirementsPanel, setShowRequirementsPanel] = useState(false)
  const [viewMode, setViewMode] = useState<'examples' | 'canvas'>('examples')
  
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
    </div>
  )
}
