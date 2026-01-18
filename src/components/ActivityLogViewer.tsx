import { useState, useEffect } from 'react'
import { Download, Trash2, Filter, X } from 'lucide-react'
import { getLogs, exportLogs, clearLogs, getLogStatistics, type LogEntry } from '../services/activityLogService'
import Button from './ui/Button'
import Card from './ui/Card'

export default function ActivityLogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([])
  const [statistics, setStatistics] = useState(getLogStatistics())
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<{
    digitalWorkerName?: string
    workflowId?: string
    type?: LogEntry['type']
  }>({})

  // Load logs on mount and listen for real-time updates
  useEffect(() => {
    const loadLogs = () => {
      const allLogs = getLogs(filters)
      setLogs(allLogs)
      setFilteredLogs(allLogs)
      setStatistics(getLogStatistics())
    }

    loadLogs()
    
    // Listen for real-time log updates
    const handleLogUpdate = () => {
      loadLogs()
    }
    
    window.addEventListener('digital_worker_log_update', handleLogUpdate)
    
    // Also refresh periodically as fallback (every 500ms for near real-time)
    const interval = setInterval(loadLogs, 500)
    
    return () => {
      window.removeEventListener('digital_worker_log_update', handleLogUpdate)
      clearInterval(interval)
    }
  }, [filters])

  const handleExport = () => {
    exportLogs()
  }

  const handleClear = () => {
    if (confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
      clearLogs()
      setLogs([])
      setFilteredLogs([])
      setStatistics(getLogStatistics())
    }
  }

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    const newFilters = { ...filters }
    if (value) {
      newFilters[key] = value as any
    } else {
      delete newFilters[key]
    }
    setFilters(newFilters)
  }

  const clearFilters = () => {
    setFilters({})
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  const getTypeColor = (type: LogEntry['type']) => {
    const colors: Record<LogEntry['type'], string> = {
      digital_worker_activation: 'bg-blue-100 text-blue-800',
      agent_building_start: 'bg-yellow-100 text-yellow-800',
      agent_building_complete: 'bg-green-100 text-green-800',
      workflow_execution_start: 'bg-purple-100 text-purple-800',
      workflow_step_execution: 'bg-indigo-100 text-indigo-800',
      workflow_step_complete: 'bg-teal-100 text-teal-800',
      workflow_complete: 'bg-emerald-100 text-emerald-800',
      agent_assignment: 'bg-pink-100 text-pink-800',
      error: 'bg-red-100 text-red-800',
      blocker: 'bg-orange-100 text-orange-800',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="flex flex-col h-screen bg-gray-light">
      {/* Header */}
      <div className="p-6 border-b border-gray-lighter bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-dark">Activity Logs</h1>
            <p className="text-sm text-gray-darker mt-1">
              Track digital worker activity, agent building, and workflow execution
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>

        {/* Statistics */}
        <div className="mt-4 flex items-center gap-4 text-sm">
          <span className="text-gray-darker">
            <strong>{statistics.totalLogs}</strong> total logs
          </span>
          {Object.keys(statistics.byType).length > 0 && (
            <span className="text-gray-darker">
              Types: {Object.keys(statistics.byType).length}
            </span>
          )}
          {Object.keys(statistics.byDigitalWorker).length > 0 && (
            <span className="text-gray-darker">
              Digital Workers: {Object.keys(statistics.byDigitalWorker).length}
            </span>
          )}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-lighter">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-dark">Filters</h3>
              <button
                onClick={clearFilters}
                className="text-xs text-gray-darker hover:text-gray-dark"
              >
                Clear all
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-darker mb-1">
                  Digital Worker
                </label>
                <input
                  type="text"
                  value={filters.digitalWorkerName || ''}
                  onChange={(e) => handleFilterChange('digitalWorkerName', e.target.value)}
                  placeholder="Filter by worker name"
                  className="w-full px-3 py-2 text-sm border border-gray-lighter rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-darker mb-1">
                  Workflow ID
                </label>
                <input
                  type="text"
                  value={filters.workflowId || ''}
                  onChange={(e) => handleFilterChange('workflowId', e.target.value)}
                  placeholder="Filter by workflow ID"
                  className="w-full px-3 py-2 text-sm border border-gray-lighter rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-darker mb-1">
                  Log Type
                </label>
                <select
                  value={filters.type || ''}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-lighter rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All types</option>
                  <option value="digital_worker_activation">Digital Worker Activation</option>
                  <option value="agent_building_start">Agent Building Start</option>
                  <option value="agent_building_complete">Agent Building Complete</option>
                  <option value="workflow_execution_start">Workflow Execution Start</option>
                  <option value="workflow_step_execution">Workflow Step Execution</option>
                  <option value="workflow_step_complete">Workflow Step Complete</option>
                  <option value="workflow_complete">Workflow Complete</option>
                  <option value="agent_assignment">Agent Assignment</option>
                  <option value="error">Error</option>
                  <option value="blocker">Blocker</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Logs List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredLogs.length === 0 ? (
          <Card variant="outlined" className="p-8 text-center">
            <p className="text-gray-darker">No logs found</p>
            <p className="text-sm text-gray-darker mt-2">
              Activity logs will appear here when digital workers are activated and workflows are executed.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <Card key={log.id} variant="outlined" className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${getTypeColor(log.type)}`}
                      >
                        {log.type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                      <span className="text-sm text-gray-darker">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-dark mb-2">
                      <strong>Digital Worker:</strong> {log.digitalWorkerName}
                      {log.workflowId && (
                        <>
                          {' • '}
                          <strong>Workflow:</strong> {log.workflowId}
                        </>
                      )}
                      {log.stepId && (
                        <>
                          {' • '}
                          <strong>Step:</strong> {log.stepId}
                        </>
                      )}
                    </div>
                    {Object.keys(log.data).length > 0 && (
                      <div className="mt-2">
                        <details className="text-sm">
                          <summary className="cursor-pointer text-gray-darker hover:text-gray-dark">
                            View details
                          </summary>
                          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                    {log.metadata && (
                      <div className="mt-2 text-xs text-gray-darker">
                        {log.metadata.duration && (
                          <span>Duration: {log.metadata.duration}ms</span>
                        )}
                        {log.metadata.error && (
                          <span className="text-red-600 ml-2">Error: {log.metadata.error}</span>
                        )}
                        {log.metadata.agentsCreated && (
                          <span className="ml-2">
                            Agents created: {log.metadata.agentsCreated.length}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
