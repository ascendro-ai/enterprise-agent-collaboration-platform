import type { AgentConfiguration } from '../types'

export interface LogEntry {
  id: string
  timestamp: string
  type:
    | 'digital_worker_activation'
    | 'agent_building_start'
    | 'agent_building_complete'
    | 'workflow_execution_start'
    | 'workflow_step_execution'
    | 'workflow_step_complete'
    | 'workflow_complete'
    | 'agent_assignment'
    | 'error'
    | 'blocker'
  digitalWorkerName: string
  workflowId?: string
  stepId?: string
  data: Record<string, any>
  metadata?: {
    duration?: number
    error?: string
    agentsCreated?: AgentConfiguration[]
    stepsProcessed?: number
  }
}

const STORAGE_KEY = 'digital_worker_activity_logs'
const MAX_LOG_ENTRIES = 1000
const LOG_UPDATE_EVENT = 'digital_worker_log_update'

// Generate unique log ID
function generateLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Get all logs from localStorage
function getStoredLogs(): LogEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch (error) {
    console.error('Error reading logs from localStorage:', error)
    return []
  }
}

// Save logs to localStorage with circular buffer
function saveLogs(logs: LogEntry[]): void {
  try {
    // Keep only the most recent MAX_LOG_ENTRIES
    const logsToSave = logs.slice(-MAX_LOG_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logsToSave))
  } catch (error) {
    console.error('Error saving logs to localStorage:', error)
  }
}

// Add a log entry
function addLogEntry(entry: LogEntry): void {
  const logs = getStoredLogs()
  logs.push(entry)
  saveLogs(logs)
  
  // Dispatch event for real-time updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOG_UPDATE_EVENT, { detail: entry }))
  }
}

// Log digital worker activation
export function logDigitalWorkerActivation(
  digitalWorkerName: string,
  assignedWorkflows: string[]
): void {
  addLogEntry({
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type: 'digital_worker_activation',
    digitalWorkerName,
    data: {
      assignedWorkflows,
      workflowCount: assignedWorkflows.length,
    },
  })
}

// Log agent building start
export function logAgentBuildingStart(
  workflowId: string,
  digitalWorkerName: string,
  workflowSteps: number
): void {
  addLogEntry({
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type: 'agent_building_start',
    digitalWorkerName,
    workflowId,
    data: {
      workflowSteps,
    },
  })
}

// Log agent building complete
export function logAgentBuildingComplete(
  workflowId: string,
  digitalWorkerName: string,
  agents: AgentConfiguration[],
  duration: number
): void {
  addLogEntry({
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type: 'agent_building_complete',
    digitalWorkerName,
    workflowId,
    data: {
      agentsCreated: agents.length,
      agentNames: agents.map((a) => a.name),
    },
    metadata: {
      duration,
      agentsCreated: agents,
    },
  })
}

// Log workflow execution start
export function logWorkflowExecutionStart(
  workflowId: string,
  digitalWorkerName: string,
  workflowName: string,
  totalSteps: number
): void {
  addLogEntry({
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type: 'workflow_execution_start',
    digitalWorkerName,
    workflowId,
    data: {
      workflowName,
      totalSteps,
    },
  })
}

// Log workflow step execution
export function logWorkflowStepExecution(
  workflowId: string,
  stepId: string,
  stepLabel: string,
  stepType: string,
  digitalWorkerName: string,
  stepOrder: number,
  assignedTo?: { type: 'ai' | 'human'; agentName?: string }
): void {
  addLogEntry({
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type: 'workflow_step_execution',
    digitalWorkerName,
    workflowId,
    stepId,
    data: {
      stepLabel,
      stepType,
      stepOrder,
      assignedTo,
    },
  })
}

// Log workflow step complete
export function logWorkflowStepComplete(
  workflowId: string,
  stepId: string,
  stepLabel: string,
  digitalWorkerName: string,
  duration: number
): void {
  addLogEntry({
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type: 'workflow_step_complete',
    digitalWorkerName,
    workflowId,
    stepId,
    data: {
      stepLabel,
    },
    metadata: {
      duration,
    },
  })
}

// Log workflow complete
export function logWorkflowComplete(
  workflowId: string,
  digitalWorkerName: string,
  totalDuration: number,
  stepsCompleted: number
): void {
  addLogEntry({
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type: 'workflow_complete',
    digitalWorkerName,
    workflowId,
    data: {
      stepsCompleted,
    },
    metadata: {
      duration: totalDuration,
    },
  })
}

// Log agent assignment
export function logAgentAssignment(
  workflowId: string,
  digitalWorkerName: string,
  workflowName: string
): void {
  addLogEntry({
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type: 'agent_assignment',
    digitalWorkerName,
    workflowId,
    data: {
      workflowName,
    },
  })
}

// Log error or blocker
export function logErrorOrBlocker(
  workflowId: string,
  stepId: string,
  stepLabel: string,
  digitalWorkerName: string,
  errorMessage: string,
  errorType: 'error' | 'blocker' = 'error'
): void {
  addLogEntry({
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type: errorType,
    digitalWorkerName,
    workflowId,
    stepId,
    data: {
      stepLabel,
      errorMessage,
    },
    metadata: {
      error: errorMessage,
    },
  })
}

// Get logs with optional filters
export function getLogs(filters?: {
  digitalWorkerName?: string
  workflowId?: string
  type?: LogEntry['type']
  startDate?: Date
  endDate?: Date
}): LogEntry[] {
  let logs = getStoredLogs()

  if (filters) {
    if (filters.digitalWorkerName) {
      logs = logs.filter((log) => log.digitalWorkerName === filters.digitalWorkerName)
    }
    if (filters.workflowId) {
      logs = logs.filter((log) => log.workflowId === filters.workflowId)
    }
    if (filters.type) {
      logs = logs.filter((log) => log.type === filters.type)
    }
    if (filters.startDate) {
      logs = logs.filter((log) => new Date(log.timestamp) >= filters.startDate!)
    }
    if (filters.endDate) {
      logs = logs.filter((log) => new Date(log.timestamp) <= filters.endDate!)
    }
  }

  // Sort by timestamp (newest first)
  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

// Export logs as JSON file
export function exportLogs(): void {
  const logs = getLogs()
  const dataStr = JSON.stringify(logs, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `digital-worker-logs-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Clear all logs
export function clearLogs(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// Get log statistics
export function getLogStatistics(): {
  totalLogs: number
  byType: Record<string, number>
  byDigitalWorker: Record<string, number>
  oldestLog?: string
  newestLog?: string
} {
  const logs = getLogs()
  const byType: Record<string, number> = {}
  const byDigitalWorker: Record<string, number> = {}

  logs.forEach((log) => {
    byType[log.type] = (byType[log.type] || 0) + 1
    byDigitalWorker[log.digitalWorkerName] =
      (byDigitalWorker[log.digitalWorkerName] || 0) + 1
  })

  const timestamps = logs.map((log) => new Date(log.timestamp).getTime())
  const oldestTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : undefined
  const newestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : undefined

  return {
    totalLogs: logs.length,
    byType,
    byDigitalWorker,
    oldestLog: oldestTimestamp ? new Date(oldestTimestamp).toISOString() : undefined,
    newestLog: newestTimestamp ? new Date(newestTimestamp).toISOString() : undefined,
  }
}
