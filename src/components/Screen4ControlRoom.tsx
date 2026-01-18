import { useState, useEffect } from 'react'
import { Eye, AlertCircle, Clock, CheckCircle, XCircle } from 'lucide-react'
import { CONTROL_ROOM_EVENT } from '../utils/constants'
import { approveReviewItem, rejectReviewItem } from '../services/workflowExecutionService'
import type { ControlRoomUpdate, ReviewItem, CompletedItem } from '../types'
import Card from './ui/Card'
import Button from './ui/Button'

export default function Screen4ControlRoom() {
  const [watchingItems, setWatchingItems] = useState<Array<{ id: string; name: string; workflow: string }>>([])
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [completedItems, setCompletedItems] = useState<CompletedItem[]>([])
  const [selectedTeam, setSelectedTeam] = useState('All Teams')

  useEffect(() => {
    const handleControlRoomUpdate = (event: CustomEvent<ControlRoomUpdate>) => {
      const update = event.detail

      switch (update.type) {
        case 'workflow_update':
          // Add to watching/running
          if (update.data.digitalWorkerName) {
            setWatchingItems((prev) => {
              const existing = prev.find((item) => item.name === update.data.digitalWorkerName)
              if (existing) {
                return prev
              }
              return [
                ...prev,
                {
                  id: `watching-${Date.now()}`,
                  name: update.data.digitalWorkerName || 'default',
                  workflow: update.data.workflowId,
                },
              ]
            })
          }
          break

        case 'review_needed':
          // Add to needs review
          setReviewItems((prev) => {
            const newItem: ReviewItem = {
              id: `review-${Date.now()}`,
              workflowId: update.data.workflowId,
              stepId: update.data.stepId || '',
              digitalWorkerName: update.data.digitalWorkerName || 'default',
              action: update.data.action || { type: 'unknown', payload: {} },
              timestamp: update.data.timestamp,
            }
            return [...prev, newItem]
          })
          break

        case 'completed':
          // Add to completed
          setCompletedItems((prev) => {
            const newItem: CompletedItem = {
              id: `completed-${Date.now()}`,
              workflowId: update.data.workflowId,
              digitalWorkerName: update.data.digitalWorkerName || 'default',
              goal: update.data.message || 'Workflow completed',
              timestamp: update.data.timestamp,
            }
            return [...prev, newItem]
          })
          // Remove from watching
          setWatchingItems((prev) =>
            prev.filter((item) => item.workflow !== update.data.workflowId)
          )
          break
      }
    }

    window.addEventListener(CONTROL_ROOM_EVENT, handleControlRoomUpdate as EventListener)

    return () => {
      window.removeEventListener(CONTROL_ROOM_EVENT, handleControlRoomUpdate as EventListener)
    }
  }, [])

  const handleApprove = (item: ReviewItem) => {
    approveReviewItem(item)
    setReviewItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  const handleReject = (item: ReviewItem) => {
    rejectReviewItem(item)
    setReviewItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="p-6 border-b border-gray-lighter">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-dark">Operation Control Room</h1>
          <div className="flex items-center gap-4">
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="px-3 py-2 border border-gray-lighter rounded-md text-sm"
            >
              <option value="All Teams">All Teams</option>
            </select>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-dark">System Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-6 h-full min-w-max">
          {/* Watching / Running */}
          <div className="flex-1 min-w-80 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-5 w-5 text-gray-darker" />
              <h2 className="text-lg font-semibold text-gray-dark">Watching / Running</h2>
              <span className="px-2 py-1 bg-gray-lighter rounded-full text-xs text-gray-darker">
                {watchingItems.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {watchingItems.length === 0 ? (
                <Card variant="outlined" className="p-8 text-center border-dashed">
                  <p className="text-sm text-gray-darker">
                    No active workflows for {selectedTeam}
                  </p>
                </Card>
              ) : (
                watchingItems.map((item) => (
                  <Card key={item.id} variant="elevated" className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-accent-blue rounded-full"></div>
                      <span className="text-xs font-medium text-gray-darker uppercase">
                        {item.name}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-gray-dark mb-1">
                      {item.workflow} - Active
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                        Live
                      </span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Needs Review */}
          <div className="flex-1 min-w-80 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="h-5 w-5 text-gray-darker" />
              <h2 className="text-lg font-semibold text-gray-dark">Needs Review</h2>
              <span className="px-2 py-1 bg-gray-lighter rounded-full text-xs text-gray-darker">
                {reviewItems.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {reviewItems.length === 0 ? (
                <Card variant="outlined" className="p-8 text-center border-dashed">
                  <p className="text-sm text-gray-darker">
                    No review items for {selectedTeam}
                  </p>
                </Card>
              ) : (
                reviewItems.map((item) => (
                  <Card key={item.id} variant="elevated" className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-darker">
                        {item.digitalWorkerName}
                      </span>
                    </div>
                    <div className="text-sm text-gray-dark mb-3">
                      {item.action.type === 'approval_required' &&
                      typeof item.action.payload === 'object' &&
                      item.action.payload !== null &&
                      'message' in item.action.payload
                        ? String(item.action.payload.message)
                        : 'Action requires approval'}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApprove(item)}
                        className="flex-1"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleReject(item)}
                        className="flex-1"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Completed Today */}
          <div className="flex-1 min-w-80 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-gray-darker" />
              <h2 className="text-lg font-semibold text-gray-dark">Completed Today</h2>
              <span className="px-2 py-1 bg-gray-lighter rounded-full text-xs text-gray-darker">
                {completedItems.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {completedItems.length === 0 ? (
                <Card variant="outlined" className="p-8 text-center border-dashed">
                  <p className="text-sm text-gray-darker">
                    No completed tasks for {selectedTeam}
                  </p>
                </Card>
              ) : (
                completedItems.map((item) => (
                  <Card key={item.id} variant="elevated" className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-darker">
                        {item.digitalWorkerName}
                      </span>
                    </div>
                    <div className="text-sm text-gray-dark">{item.goal}</div>
                    <div className="text-xs text-gray-darker mt-2">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
