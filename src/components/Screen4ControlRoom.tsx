import { useState, useEffect, useRef } from 'react'
import { Eye, AlertCircle, Clock, CheckCircle, XCircle, MessageSquare, Send } from 'lucide-react'
import { CONTROL_ROOM_EVENT } from '../utils/constants'
import { useTeam } from '../contexts/TeamContext'
import { approveReviewItem, rejectReviewItem, provideGuidanceToReviewItem } from '../services/workflowExecutionService'
import type { ControlRoomUpdate, ReviewItem, CompletedItem, NodeData } from '../types'
import Card from './ui/Card'
import Button from './ui/Button'
import Input from './ui/Input'

export default function Screen4ControlRoom() {
  const { team } = useTeam()
  const [watchingItems, setWatchingItems] = useState<Array<{ id: string; name: string; workflow: string }>>([])
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [completedItems, setCompletedItems] = useState<CompletedItem[]>([])
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<Record<string, string>>({})
  const chatEndRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Sync active workers from team state
  useEffect(() => {
    const activeWorkers = team.filter(
      (node: NodeData) => node.type === 'ai' && node.status === 'active'
    )
    
    setWatchingItems((prev) => {
      // Get current active worker names
      const activeWorkerNames = new Set(activeWorkers.map((w) => w.name))
      
      // Remove workers that are no longer active
      const filtered = prev.filter((item) => activeWorkerNames.has(item.name))
      
      // Add new active workers that aren't already in the list
      const existingNames = new Set(filtered.map((item) => item.name))
      const newWorkers = activeWorkers
        .filter((worker) => !existingNames.has(worker.name))
        .map((worker) => ({
          id: `watching-${worker.name}-${Date.now()}`,
          name: worker.name,
          workflow: worker.assignedWorkflows?.[0] || 'standby',
        }))
      
      return [...filtered, ...newWorkers]
    })
  }, [team])

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
            const action = update.data.action || { type: 'unknown', payload: {} }
            const needsGuidance = action.type === 'guidance_requested' || 
                                 (typeof action.payload === 'object' && 
                                  action.payload !== null && 
                                  'needsGuidance' in action.payload &&
                                  (action.payload as any).needsGuidance === true)
            
            const newItem: ReviewItem = {
              id: `review-${Date.now()}`,
              workflowId: update.data.workflowId,
              stepId: update.data.stepId || '',
              digitalWorkerName: update.data.digitalWorkerName || 'default',
              action,
              timestamp: update.data.timestamp,
              needsGuidance,
              chatHistory: [],
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
    // Include chat history if available
    const itemWithChat = {
      ...item,
      chatHistory: item.chatHistory || [],
    }
    approveReviewItem(itemWithChat)
    setReviewItems((prev) => prev.filter((i) => i.id !== item.id))
    setExpandedChatId(null)
    setChatMessages((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
  }

  const handleReject = (item: ReviewItem) => {
    rejectReviewItem(item)
    setReviewItems((prev) => prev.filter((i) => i.id !== item.id))
    setExpandedChatId(null)
    setChatMessages((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
  }

  const handleSendGuidance = (item: ReviewItem) => {
    const message = chatMessages[item.id]?.trim()
    if (!message) return

    // Add user message to chat history
    const updatedItem: ReviewItem = {
      ...item,
      chatHistory: [
        ...(item.chatHistory || []),
        {
          sender: 'user',
          text: message,
          timestamp: new Date(),
        },
      ],
    }

    // Update review item with new chat history
    setReviewItems((prev) => prev.map((i) => (i.id === item.id ? updatedItem : i)))

    // Clear input
    setChatMessages((prev) => {
      const updated = { ...prev }
      updated[item.id] = ''
      return updated
    })

    // Provide guidance to the agent
    provideGuidanceToReviewItem(item.id, message)
  }

  // Scroll chat to bottom when messages change
  useEffect(() => {
    if (expandedChatId && chatEndRefs.current[expandedChatId]) {
      chatEndRefs.current[expandedChatId]?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [expandedChatId, reviewItems])

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="p-6 border-b border-gray-lighter">
        <h1 className="text-2xl font-semibold text-gray-dark">Operation Control Room</h1>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-6 h-full min-w-max">
          {/* Active Digital Workers */}
          <div className="flex-1 min-w-80 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-5 w-5 text-gray-darker" />
              <h2 className="text-lg font-semibold text-gray-dark">Active Digital Workers</h2>
              <span className="px-2 py-1 bg-gray-lighter rounded-full text-xs text-gray-darker">
                {watchingItems.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {watchingItems.length === 0 ? (
                <Card variant="outlined" className="p-8 text-center border-dashed">
                  <p className="text-sm text-gray-darker">
                    No active digital workers
                  </p>
                </Card>
              ) : (
                watchingItems.map((item) => {
                  // Get the team node data to match the card styling
                  const teamNode = team.find((n: NodeData) => n.name === item.name)
                  const displayName = item.name === 'default' || item.name.toLowerCase().includes('default') 
                    ? 'Digi' 
                    : item.name
                  const displayRole = item.name === 'default' || item.name.toLowerCase().includes('default')
                    ? 'Default Digital Worker'
                    : teamNode?.role || ''
                  
                  // Get initials for avatar
                  const getInitials = (name: string): string => {
                    const parts = name.split(' ')
                    if (parts.length >= 2) {
                      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                    }
                    return name.substring(0, 2).toUpperCase()
                  }
                  
                  return (
                    <Card key={item.id} variant="elevated" className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{
                            backgroundColor: '#DBEAFE',
                            border: '1px solid #93C5FD'
                          }}>
                            <span className="text-sm font-semibold" style={{ color: '#3B82F6' }}>
                              {getInitials(item.name)}
                            </span>
                          </div>
                        </div>
                        
                        {/* Name and Role */}
                        <div className="flex-1">
                          <div className="font-semibold text-gray-dark text-sm">
                            {displayName}
                          </div>
                          {displayRole && (
                            <div className="text-xs italic text-gray-darker mt-0.5">
                              {displayRole}
                            </div>
                          )}
                        </div>
                        
                        {/* ACTIVE Badge */}
                        <div className="flex-shrink-0">
                          <div className="px-3 py-1 rounded-full text-xs font-semibold text-white" style={{
                            backgroundColor: '#10B981'
                          }}>
                            ACTIVE
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })
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
                    No review items
                  </p>
                </Card>
              ) : (
                reviewItems.map((item) => {
                  const isError = item.action.type === 'error'
                  const payload = item.action.payload as any
                  const errorMessage = payload?.message || payload?.error || 'An error occurred'
                  const isChatExpanded = expandedChatId === item.id
                  const chatHistory = item.chatHistory || []
                  
                  return (
                    <Card 
                      key={item.id} 
                      variant="elevated" 
                      className={`p-4 ${isError ? 'border-l-4' : ''}`}
                      style={isError ? { borderLeftColor: '#EF4444' } : {}}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-gray-darker">
                          {item.digitalWorkerName}
                        </span>
                        {isError && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-semibold">
                            ERROR
                          </span>
                        )}
                        {item.needsGuidance && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                            NEEDS GUIDANCE
                          </span>
                        )}
                      </div>
                      <div className={`text-sm mb-3 ${isError ? 'text-red-700' : 'text-gray-dark'}`}>
                        {isError ? (
                          <>
                            <div className="font-semibold mb-1">Error in step: {payload?.step || 'Unknown'}</div>
                            <div className="text-xs">{errorMessage}</div>
                          </>
                        ) : (
                          item.action.type === 'approval_required' &&
                          typeof item.action.payload === 'object' &&
                          item.action.payload !== null &&
                          'message' in item.action.payload
                            ? String(item.action.payload.message)
                            : item.needsGuidance
                            ? 'Agent needs guidance to proceed'
                            : 'Action requires approval'
                        )}
                      </div>

                      {/* Chat Interface */}
                      {isChatExpanded && (
                        <div className="mb-3 border-t border-gray-lighter pt-3">
                          <div className="text-xs font-semibold text-gray-darker mb-2">Chat with Agent</div>
                          <div className="max-h-48 overflow-y-auto mb-2 space-y-2 bg-gray-50 rounded p-2">
                            {chatHistory.length === 0 ? (
                              <div className="text-xs text-gray-darker italic">No messages yet...</div>
                            ) : (
                              chatHistory.map((msg, idx) => (
                                <div
                                  key={idx}
                                  className={`text-xs p-2 rounded ${
                                    msg.sender === 'user'
                                      ? 'bg-blue-100 text-blue-900 ml-auto max-w-[80%]'
                                      : 'bg-gray-200 text-gray-800 mr-auto max-w-[80%]'
                                  }`}
                                >
                                  <div className="font-semibold mb-1">
                                    {msg.sender === 'user' ? 'You' : item.digitalWorkerName}
                                  </div>
                                  <div>{msg.text}</div>
                                </div>
                              ))
                            )}
                            <div ref={(el) => (chatEndRefs.current[item.id] = el)} />
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={chatMessages[item.id] || ''}
                              onChange={(e) =>
                                setChatMessages((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  handleSendGuidance(item)
                                }
                              }}
                              placeholder="Provide guidance..."
                              className="flex-1 px-3 py-2 text-sm border border-gray-lighter rounded-md focus:ring-purple-500 focus:border-purple-500"
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleSendGuidance(item)}
                              disabled={!chatMessages[item.id]?.trim()}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setExpandedChatId(isChatExpanded ? null : item.id)}
                          className="flex-1"
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          {isChatExpanded ? 'Hide Chat' : 'Chat'}
                        </Button>
                        {isError ? (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleApprove(item)}
                              className="flex-1"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Retry
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleReject(item)}
                              className="flex-1"
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Dismiss
                            </Button>
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>
                    </Card>
                  )
                })
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
                    No completed tasks
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
