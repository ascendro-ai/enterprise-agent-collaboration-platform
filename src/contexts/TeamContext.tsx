import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { storage } from '../utils/storage'
import { WORKFLOW_CONFIG } from '../utils/constants'
import type { NodeData, Team } from '../types'

interface TeamContextType {
  team: NodeData[]
  teams: Team[]
  isOrganizationSetup: boolean
  setTeam: (team: NodeData[]) => void
  setTeams: (teams: Team[]) => void
  addTeam: (team: Team) => void
  updateTeam: (teamId: string, updates: Partial<Team>) => void
  setOrganizationSetup: (isSetup: boolean) => void
  addNode: (node: NodeData) => void
  updateNode: (name: string, updates: Partial<NodeData>) => void
  toggleNodeStatus: (name: string) => void
  assignWorkflowToNode: (nodeName: string, workflowId: string) => void
  removeWorkflowFromNode: (nodeName: string, workflowId: string) => void
  getDefaultDigitalWorker: () => NodeData | undefined
  ensureDefaultDigitalWorker: () => void
}

const TeamContext = createContext<TeamContextType | undefined>(undefined)

const defaultDigitalWorker: NodeData = {
  name: 'default', // Keep internal name as 'default' for logic, display name will be "Digi"
  type: 'ai',
  status: 'inactive',
  assignedWorkflows: [],
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const [team, setTeamState] = useState<NodeData[]>([])
  const [teams, setTeamsState] = useState<Team[]>([])
  const [isOrganizationSetup, setIsOrganizationSetupState] = useState<boolean>(false)

  // Define ensureDefaultDigitalWorker first so it can be used in useEffect
  const ensureDefaultDigitalWorker = useCallback(() => {
    setTeamState((prev) => {
      const hasDefault = prev.some(
        (n) => n.name === WORKFLOW_CONFIG.DEFAULT_DIGITAL_WORKER_NAME && n.type === 'ai'
      )
      if (!hasDefault) {
        return [defaultDigitalWorker, ...prev]
      }
      return prev
    })
  }, [])

  // Load from localStorage on mount
  useEffect(() => {
    const savedTeam = storage.getTeam()
    const savedTeams = storage.getTeams()
    const savedOrgSetup = storage.getOrganizationSetup()
    
    if (savedTeam.length === 0) {
      // Initialize with default digital worker
      setTeamState([defaultDigitalWorker])
      storage.saveTeam([defaultDigitalWorker])
    } else {
      setTeamState(savedTeam)
      // Ensure default digital worker exists
      ensureDefaultDigitalWorker()
    }
    
    if (savedTeams) {
      setTeamsState(savedTeams)
    }
    
    setIsOrganizationSetupState(savedOrgSetup || false)
  }, [ensureDefaultDigitalWorker])

  // Save to localStorage whenever team changes
  useEffect(() => {
    storage.saveTeam(team)
  }, [team])

  // Save to localStorage whenever teams change
  useEffect(() => {
    storage.saveTeams(teams)
  }, [teams])

  // Save to localStorage whenever organization setup status changes
  useEffect(() => {
    storage.saveOrganizationSetup(isOrganizationSetup)
  }, [isOrganizationSetup])

  const setTeam = useCallback((newTeam: NodeData[]) => {
    setTeamState(newTeam)
  }, [])

  const addNode = useCallback((node: NodeData) => {
    setTeamState((prev) => {
      // Check if node already exists
      if (prev.some((n) => n.name === node.name)) {
        return prev
      }
      return [...prev, node]
    })
  }, [])

  const updateNode = useCallback((name: string, updates: Partial<NodeData>) => {
    setTeamState((prev) =>
      prev.map((n) => (n.name === name ? { ...n, ...updates } : n))
    )
  }, [])

  const toggleNodeStatus = useCallback((name: string) => {
    setTeamState((prev) =>
      prev.map((n) => {
        if (n.name === name) {
          const currentStatus = n.status || 'inactive'
          const newStatus =
            currentStatus === 'active' ? 'inactive' : 'active'
          return { ...n, status: newStatus }
        }
        return n
      })
    )
  }, [])

  const assignWorkflowToNode = useCallback((nodeName: string, workflowId: string) => {
    setTeamState((prev) =>
      prev.map((n) => {
        if (n.name === nodeName) {
          const currentWorkflows = n.assignedWorkflows || []
          if (currentWorkflows.includes(workflowId)) {
            return n
          }
          return {
            ...n,
            assignedWorkflows: [...currentWorkflows, workflowId],
          }
        }
        return n
      })
    )
  }, [])

  const removeWorkflowFromNode = useCallback((nodeName: string, workflowId: string) => {
    setTeamState((prev) =>
      prev.map((n) => {
        if (n.name === nodeName) {
          const currentWorkflows = n.assignedWorkflows || []
          return {
            ...n,
            assignedWorkflows: currentWorkflows.filter((id) => id !== workflowId),
          }
        }
        return n
      })
    )
  }, [])

  const getDefaultDigitalWorker = useCallback(() => {
    return team.find(
      (n) => n.name === WORKFLOW_CONFIG.DEFAULT_DIGITAL_WORKER_NAME && n.type === 'ai'
    )
  }, [team])

  const setTeams = useCallback((newTeams: Team[]) => {
    setTeamsState(newTeams)
  }, [])

  const addTeam = useCallback((newTeam: Team) => {
    setTeamsState((prev) => {
      // Check if team already exists
      if (prev.some((t) => t.id === newTeam.id)) {
        return prev
      }
      return [...prev, newTeam]
    })
  }, [])

  const updateTeam = useCallback((teamId: string, updates: Partial<Team>) => {
    setTeamsState((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, ...updates } : t))
    )
  }, [])

  const setOrganizationSetup = useCallback((isSetup: boolean) => {
    setIsOrganizationSetupState(isSetup)
  }, [])

  return (
    <TeamContext.Provider
      value={{
        team,
        teams,
        isOrganizationSetup,
        setTeam,
        setTeams,
        addTeam,
        updateTeam,
        setOrganizationSetup,
        addNode,
        updateNode,
        toggleNodeStatus,
        assignWorkflowToNode,
        removeWorkflowFromNode,
        getDefaultDigitalWorker,
        ensureDefaultDigitalWorker,
      }}
    >
      {children}
    </TeamContext.Provider>
  )
}

export function useTeam() {
  const context = useContext(TeamContext)
  if (context === undefined) {
    throw new Error('useTeam must be used within a TeamProvider')
  }
  return context
}
