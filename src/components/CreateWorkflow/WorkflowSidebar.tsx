import { useState } from 'react'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import type { Workflow } from '../../types'
import Button from '../ui/Button'

interface WorkflowSidebarProps {
  workflows: Workflow[]
  selectedWorkflowId: string | null
  onWorkflowSelect: (workflowId: string) => void
  onNewWorkflow: () => void
  onToggleStatus: (workflowId: string) => void
}

export default function WorkflowSidebar({
  workflows,
  selectedWorkflowId,
  onWorkflowSelect,
  onNewWorkflow,
  onToggleStatus,
}: WorkflowSidebarProps) {
  const [activeExpanded, setActiveExpanded] = useState(true)
  const [draftsExpanded, setDraftsExpanded] = useState(true)

  // Separate workflows by status
  const activeWorkflows = workflows.filter(w => w.status === 'active')
  const draftWorkflows = workflows.filter(w => w.status === 'draft' || w.status === 'paused')

  // Format date for display
  const formatDate = (date?: Date) => {
    if (!date) return ''
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  }

  const WorkflowItem = ({ workflow }: { workflow: Workflow }) => {
    const isSelected = workflow.id === selectedWorkflowId
    const isActive = workflow.status === 'active'
    
    const handleToggle = (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleStatus(workflow.id)
    }
    
    return (
      <div
        onClick={() => onWorkflowSelect(workflow.id)}
        className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
          isSelected 
            ? 'bg-blue-50 border border-blue-200' 
            : 'hover:bg-gray-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm truncate flex-1 ${isSelected ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
            {workflow.name || 'Untitled Workflow'}
          </span>
          {/* Active/Inactive Toggle */}
          <button
            onClick={handleToggle}
            className={`relative w-8 h-4 rounded-full transition-colors ${
              isActive ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title={isActive ? 'Active - Click to deactivate' : 'Inactive - Click to activate'}
          >
            <div
              className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                isActive ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {formatDate(workflow.updatedAt)}
          </span>
          <span className={`text-xs ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
    )
  }

  const CollapsibleSection = ({
    title,
    count,
    expanded,
    onToggle,
    children,
  }: {
    title: string
    count: number
    expanded: boolean
    onToggle: () => void
    children: React.ReactNode
  }) => (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span>{title}</span>
        <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {count}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 px-1">
          {children}
        </div>
      )}
    </div>
  )

  return (
    <div className="w-[220px] h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header with New Workflow Button */}
      <div className="p-4 border-b border-gray-100">
        <Button
          variant="primary"
          onClick={onNewWorkflow}
          className="w-full justify-center"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {/* Workflow Lists */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Active Workflows */}
        <CollapsibleSection
          title="Active Workflows"
          count={activeWorkflows.length}
          expanded={activeExpanded}
          onToggle={() => setActiveExpanded(!activeExpanded)}
        >
          {activeWorkflows.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2">No active workflows</p>
          ) : (
            activeWorkflows.map(workflow => (
              <WorkflowItem key={workflow.id} workflow={workflow} />
            ))
          )}
        </CollapsibleSection>

        {/* Draft Workflows */}
        <CollapsibleSection
          title="Draft Workflows"
          count={draftWorkflows.length}
          expanded={draftsExpanded}
          onToggle={() => setDraftsExpanded(!draftsExpanded)}
        >
          {draftWorkflows.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2">No drafts</p>
          ) : (
            draftWorkflows.map(workflow => (
              <WorkflowItem key={workflow.id} workflow={workflow} />
            ))
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}
