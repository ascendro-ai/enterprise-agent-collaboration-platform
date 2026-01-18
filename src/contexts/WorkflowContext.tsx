import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { storage } from '../utils/storage'
import type { Workflow, WorkflowStep, ConversationSession, ConversationMessage } from '../types'

interface WorkflowContextType {
  workflows: Workflow[]
  conversations: ConversationSession[]
  addWorkflow: (workflow: Workflow) => void
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void
  deleteWorkflow: (id: string) => void
  activateWorkflow: (id: string) => void
  addConversation: (session: ConversationSession) => void
  updateConversation: (id: string, messages: ConversationMessage[]) => void
  getConversationByWorkflowId: (workflowId: string) => ConversationSession | undefined
  updateStepRequirements: (workflowId: string, stepId: string, requirements: WorkflowStep['requirements']) => void
  updateStepAssignment: (workflowId: string, stepId: string, assignedTo: WorkflowStep['assignedTo']) => void
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined)

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [conversations, setConversations] = useState<ConversationSession[]>([])

  // Load from localStorage on mount
  useEffect(() => {
    const savedWorkflows = storage.getWorkflows()
    const savedConversations = storage.getConversations()
    setWorkflows(savedWorkflows)
    setConversations(savedConversations)
  }, [])

  // Save to localStorage whenever workflows change
  useEffect(() => {
    storage.saveWorkflows(workflows)
  }, [workflows])

  // Save to localStorage whenever conversations change
  useEffect(() => {
    storage.saveConversations(conversations)
  }, [conversations])

  const addWorkflow = useCallback((workflow: Workflow) => {
    setWorkflows((prev) => {
      // Check if workflow already exists
      if (prev.some((w) => w.id === workflow.id)) {
        return prev.map((w) => (w.id === workflow.id ? workflow : w))
      }
      return [...prev, workflow]
    })
  }, [])

  const updateWorkflow = useCallback((id: string, updates: Partial<Workflow>) => {
    setWorkflows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates, updatedAt: new Date() } : w))
    )
  }, [])

  const deleteWorkflow = useCallback((id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id))
  }, [])

  const activateWorkflow = useCallback((id: string) => {
    setWorkflows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, status: 'active' as const, updatedAt: new Date() } : w))
    )
  }, [])

  const addConversation = useCallback((session: ConversationSession) => {
    setConversations((prev) => {
      // Update if exists, otherwise add
      const existingIndex = prev.findIndex((c) => c.id === session.id)
      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = session
        return updated
      }
      return [...prev, session]
    })
  }, [])

  const updateConversation = useCallback((id: string, messages: ConversationMessage[]) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, messages, updatedAt: new Date() }
          : c
      )
    )
  }, [])

  const getConversationByWorkflowId = useCallback(
    (workflowId: string) => {
      return conversations.find((c) => c.workflowId === workflowId)
    },
    [conversations]
  )

  const updateStepRequirements = useCallback(
    (workflowId: string, stepId: string, requirements: WorkflowStep['requirements']) => {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === workflowId
            ? {
                ...w,
                steps: w.steps.map((s) =>
                  s.id === stepId ? { ...s, requirements } : s
                ),
                updatedAt: new Date(),
              }
            : w
        )
      )
    },
    []
  )

  const updateStepAssignment = useCallback(
    (workflowId: string, stepId: string, assignedTo: WorkflowStep['assignedTo']) => {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === workflowId
            ? {
                ...w,
                steps: w.steps.map((s) =>
                  s.id === stepId ? { ...s, assignedTo } : s
                ),
                updatedAt: new Date(),
              }
            : w
        )
      )
    },
    []
  )

  return (
    <WorkflowContext.Provider
      value={{
        workflows,
        conversations,
        addWorkflow,
        updateWorkflow,
        deleteWorkflow,
        activateWorkflow,
        addConversation,
        updateConversation,
        getConversationByWorkflowId,
        updateStepRequirements,
        updateStepAssignment,
      }}
    >
      {children}
    </WorkflowContext.Provider>
  )
}

export function useWorkflows() {
  const context = useContext(WorkflowContext)
  if (context === undefined) {
    throw new Error('useWorkflows must be used within a WorkflowProvider')
  }
  return context
}
