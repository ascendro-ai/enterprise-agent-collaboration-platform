import { useState, useEffect, useRef } from 'react'
import { Eye, AlertCircle, Clock, CheckCircle, XCircle, MessageSquare, Send, Upload, Plus } from 'lucide-react'
import { CONTROL_ROOM_EVENT } from '../utils/constants'
import { useTeam } from '../contexts/TeamContext'
import { approveReviewItem, rejectReviewItem, provideGuidanceToReviewItem } from '../services/workflowExecutionService'
import { provideFeedbackOnCompletion } from '../services/geminiService'
import { parseExcelFile, isExcelFile } from '../services/excelService'
import { FileUploadChips } from './ui/FileUploadChips'
import type { ControlRoomUpdate, ReviewItem, CompletedItem, NodeData, ConversationMessage } from '../types'
import Card from './ui/Card'
import Button from './ui/Button'
import Input from './ui/Input'

export default function Screen4ControlRoom() {
  const { team, teams } = useTeam()
  const [selectedTeam, setSelectedTeam] = useState<string>('all')
  const [watchingItems, setWatchingItems] = useState<Array<{ id: string; name: string; workflow: string }>>([])
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [completedItems, setCompletedItems] = useState<CompletedItem[]>([])
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null)
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<Record<string, string>>({})
  const [feedbackMessages, setFeedbackMessages] = useState<Record<string, string>>({})
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File[]>>({})
  const [showFileMenu, setShowFileMenu] = useState<Record<string, boolean>>({})
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({})
  const [uploadedFileStatus, setUploadedFileStatus] = useState<Record<string, Record<string, 'uploading' | 'success' | 'error'>>>({})
  const chatEndRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const fileMenuRefs = useRef<Record<string, HTMLDivElement | null>>({})

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
            
            // Add initial agent message if guidance is requested
            const initialChatHistory = needsGuidance && action.type === 'guidance_requested' && 
                                     typeof action.payload === 'object' && 
                                     action.payload !== null &&
                                     'message' in action.payload
              ? [{
                  sender: 'agent' as const,
                  text: String(action.payload.message),
                  timestamp: update.data.timestamp,
                }]
              : []

            const newItem: ReviewItem = {
              id: `review-${Date.now()}`,
              workflowId: update.data.workflowId,
              stepId: update.data.stepId || '',
              digitalWorkerName: update.data.digitalWorkerName || 'default',
              action,
              timestamp: update.data.timestamp,
              needsGuidance,
              chatHistory: initialChatHistory,
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
    setUploadedFiles((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
    setShowFileMenu((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
    setUploadedFileStatus((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
    setUploadingFiles((prev) => {
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
    setUploadedFiles((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
    setShowFileMenu((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
    setUploadedFileStatus((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
    setUploadingFiles((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
  }

  // Helper function to get file type display name

  const handleFileUpload = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🔵 handleFileUpload called for item:', itemId)
    console.log('🔵 Event target:', e.target)
    console.log('🔵 Files:', e.target.files)
    
    const files = Array.from(e.target.files || [])
    console.log('🔵 Files array:', files.length, files.map(f => ({ name: f.name, size: f.size, type: f.type })))
    
    if (files.length === 0) {
      console.log('🔴 No files selected')
      return
    }

    const item = reviewItems.find((i) => i.id === itemId)
    if (!item) {
      console.error('🔴 Review item not found:', itemId, 'Available items:', reviewItems.map(i => i.id))
      return
    }

    console.log('🟢 Processing', files.length, 'file(s) for item:', itemId)

    // Set uploading state for each file
    const fileStatus: Record<string, 'uploading' | 'success' | 'error'> = {}
    files.forEach(file => {
      fileStatus[file.name] = 'uploading'
    })
    setUploadedFileStatus(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...fileStatus }
    }))
    setUploadingFiles(prev => ({ ...prev, [itemId]: true }))

    // Update uploaded files state IMMEDIATELY so UI shows loading state
    setUploadedFiles((prev) => {
      const newFiles = [...(prev[itemId] || []), ...files]
      console.log('🟢 Setting uploaded files state:', newFiles.length, 'files for item:', itemId)
      return {
        ...prev,
        [itemId]: newFiles,
      }
    })

    // Process files - Excel data stored for LLM context but NOT shown in chat
    const newChatMessages: Array<{
      sender: 'user' | 'agent' | 'system'
      text: string
      timestamp: Date
      excelData?: string
      uploadedFileName?: string
    }> = []

    for (const file of files) {
      try {
        if (isExcelFile(file)) {
          const excelText = await parseExcelFile(file)
          // Show simple upload message (NOT the full Excel content)
          // Excel data is stored in excelData field for LLM context
          newChatMessages.push({
            sender: 'system',
            text: `📎 File "${file.name}" uploaded and ready for processing`,
            excelData: excelText, // LLM will receive this as context
            uploadedFileName: file.name,
            timestamp: new Date(),
          })
          console.log(`🟢 Excel "${file.name}" processed - data available as LLM context`)
          // Mark as success
          setUploadedFileStatus(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], [file.name]: 'success' }
          }))
        } else {
          // For non-Excel files, just add a message
          newChatMessages.push({
            sender: 'system',
            text: `📎 File "${file.name}" uploaded (${(file.size / 1024).toFixed(2)} KB)`,
            uploadedFileName: file.name,
            timestamp: new Date(),
          })
          // Mark as success
          setUploadedFileStatus(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], [file.name]: 'success' }
          }))
        }
      } catch (error) {
        console.error('Error processing file:', error)
        newChatMessages.push({
          sender: 'system',
          text: `❌ Failed to process file "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
          uploadedFileName: file.name,
          timestamp: new Date(),
        })
        // Mark as error
        setUploadedFileStatus(prev => ({
          ...prev,
          [itemId]: { ...prev[itemId], [file.name]: 'error' }
        }))
      }
    }

    // Update review item with file upload messages
    const updatedItem: ReviewItem = {
      ...item,
      chatHistory: [...(item.chatHistory || []), ...newChatMessages],
    }

    setReviewItems((prev) => prev.map((i) => (i.id === itemId ? updatedItem : i)))
    setShowFileMenu((prev) => ({ ...prev, [itemId]: false }))
    setUploadingFiles(prev => ({ ...prev, [itemId]: false }))
    
    // Reset the input value so the same file can be selected again if needed
    // Do this after all processing is complete
    setTimeout(() => {
      e.target.value = ''
    }, 100)
    
    // Clear file status after 3 seconds
    setTimeout(() => {
      setUploadedFileStatus(prev => {
        const updated = { ...prev }
        if (updated[itemId]) {
          delete updated[itemId]
        }
        return updated
      })
    }, 3000)
  }

  const handleSendGuidance = (item: ReviewItem) => {
    const message = chatMessages[item.id]?.trim()
    const files = uploadedFiles[item.id] || []
    
    // Don't send if there's no message and no files
    if (!message && files.length === 0) return

    // Build chat history updates
    const chatUpdates: Array<{
      sender: 'user' | 'agent' | 'system'
      text: string
      timestamp: Date
      excelData?: string
      uploadedFileName?: string
    }> = []

    // Add text message if present
    if (message) {
      chatUpdates.push({
        sender: 'user',
        text: message,
        timestamp: new Date(),
      })
    }

    // Add agent acknowledgment message
    const hasFiles = files.length > 0 || (uploadedFiles[item.id] && uploadedFiles[item.id].length > 0)
    const fileNames = files.map(f => f.name).join(', ')
    const acknowledgmentText = hasFiles && message
      ? `Received your guidance and ${files.length} file(s): ${fileNames}. Processing now...`
      : hasFiles
      ? `Received ${files.length} file(s): ${fileNames}. Analyzing the data...`
      : `Received your guidance. Processing...`
    
    chatUpdates.push({
      sender: 'agent',
      text: acknowledgmentText,
      timestamp: new Date(),
    })

    // Update review item with new chat history
    const updatedItem: ReviewItem = {
      ...item,
      chatHistory: [...(item.chatHistory || []), ...chatUpdates],
    }

    setReviewItems((prev) => prev.map((i) => (i.id === item.id ? updatedItem : i)))

    // Clear input and files
    setChatMessages((prev) => {
      const updated = { ...prev }
      updated[item.id] = ''
      return updated
    })
    setUploadedFiles((prev) => {
      const updated = { ...prev }
      delete updated[item.id]
      return updated
    })
    setShowFileMenu((prev) => ({ ...prev, [item.id]: false }))

    // Provide guidance to the agent (include file data if available)
    const guidanceText = message || 'Files uploaded'
    provideGuidanceToReviewItem(item.id, guidanceText)
  }

  // Scroll chat to bottom when messages change
  useEffect(() => {
    if (expandedChatId && chatEndRefs.current[expandedChatId]) {
      chatEndRefs.current[expandedChatId]?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [expandedChatId, reviewItems])

  // Close file menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(showFileMenu).forEach((itemId) => {
        if (showFileMenu[itemId] && fileMenuRefs.current[itemId] && !fileMenuRefs.current[itemId]?.contains(event.target as Node)) {
          setShowFileMenu((prev) => ({ ...prev, [itemId]: false }))
        }
      })
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFileMenu])

  // Filter items by selected team
  const filteredWatchingItems = selectedTeam === 'all'
    ? watchingItems
    : watchingItems.filter(item => {
        // Find which team this digital worker belongs to
        const workerNode = team.find(n => n.name === item.name)
        return workerNode?.teamId === selectedTeam
      })

  const filteredReviewItems = selectedTeam === 'all'
    ? reviewItems
    : reviewItems.filter(item => {
        // Find which team this digital worker belongs to
        const workerNode = team.find(n => n.name === item.digitalWorkerName)
        return workerNode?.teamId === selectedTeam
      })

  const filteredCompletedItems = selectedTeam === 'all'
    ? completedItems
    : completedItems.filter(item => {
        // Find which team this digital worker belongs to
        const workerNode = team.find(n => n.name === item.digitalWorkerName)
        return workerNode?.teamId === selectedTeam
      })

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="p-6 border-b border-gray-lighter">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-dark">Operation Control Room</h1>
          <div className="flex items-center gap-2">
            <label htmlFor="team-selector" className="text-sm text-gray-darker">Team:</label>
            <select
              id="team-selector"
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="px-3 py-1.5 border border-gray-lighter rounded-md text-sm text-gray-dark bg-white focus:outline-none focus:ring-2 focus:ring-gray-dark focus:border-transparent"
            >
              <option value="all">All Teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>
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
                {filteredWatchingItems.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {filteredWatchingItems.length === 0 ? (
                <Card variant="outlined" className="p-8 text-center border-dashed">
                  <p className="text-sm text-gray-darker">
                    No active digital workers
                  </p>
                </Card>
              ) : (
                filteredWatchingItems.map((item) => {
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
                {filteredReviewItems.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {filteredReviewItems.length === 0 ? (
                <Card variant="outlined" className="p-8 text-center border-dashed">
                  <p className="text-sm text-gray-darker">
                    No review items
                  </p>
                </Card>
              ) : (
                filteredReviewItems.map((item) => {
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

                      {/* File Upload Chips - Always visible above chat */}
                      {uploadedFiles[item.id] && uploadedFiles[item.id].length > 0 && (
                        <div className="mb-3">
                          <FileUploadChips
                            files={uploadedFiles[item.id]}
                            uploadingFiles={uploadedFileStatus[item.id] || {}}
                            onRemove={(idx) => {
                              setUploadedFiles((prev) => ({
                                ...prev,
                                [item.id]: prev[item.id]?.filter((_, i) => i !== idx) || [],
                              }))
                              setUploadedFileStatus(prev => {
                                const updated = { ...prev }
                                if (updated[item.id]) {
                                  const fileName = uploadedFiles[item.id]?.[idx]?.name
                                  if (fileName) {
                                    delete updated[item.id][fileName]
                                    if (Object.keys(updated[item.id]).length === 0) {
                                      delete updated[item.id]
                                    }
                                  }
                                }
                                return updated
                              })
                            }}
                            variant="dark"
                          />
                        </div>
                      )}

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
                                    {msg.sender === 'user' ? 'You' : msg.sender === 'agent' ? item.digitalWorkerName : 'System'}
                                  </div>
                                  <div className="whitespace-pre-wrap">{msg.text}</div>
                                  {msg.uploadedFileName && (
                                    <div className="text-xs mt-1 text-gray-darker italic">
                                      📎 {msg.uploadedFileName}
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                            <div ref={(el) => { chatEndRefs.current[item.id] = el }} />
                          </div>
                          
                          {/* File chips removed from here - now shown above */}
                          {false && uploadedFiles[item.id] && uploadedFiles[item.id].length > 0 && (
                            <div className="flex flex-col gap-2 mb-2">
                              {uploadedFiles[item.id].map((file, idx) => {
                                const status = uploadedFileStatus[item.id]?.[file.name] || 'success'
                                const isUploading = status === 'uploading'
                                const isError = status === 'error'
                                
                                return (
                                  <div
                                    key={idx}
                                    className={`relative rounded-lg transition-all ${
                                      isUploading 
                                        ? 'bg-gray-700 border border-gray-600' 
                                        : isError
                                        ? 'bg-red-900/20 border border-red-500/50'
                                        : 'bg-gray-800 border border-gray-700'
                                    }`}
                                    style={{ 
                                      padding: '12px 40px 12px 12px',
                                      minHeight: '64px'
                                    }}
                                  >
                                    <div className="flex items-start gap-3">
                                      {/* File Icon */}
                                      <div className={`flex-shrink-0 w-10 h-10 rounded flex items-center justify-center ${
                                        isUploading 
                                          ? 'bg-gray-600' 
                                          : isError
                                          ? 'bg-red-500/20'
                                          : 'bg-green-500'
                                      }`}>
                                        {isUploading ? (
                                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                                        ) : isError ? (
                                          <XCircle className="h-5 w-5 text-red-500" />
                                        ) : (
                                          getFileIcon(file.name, false)
                                        )}
                                      </div>
                                      
                                      {/* File Info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">
                                          {file.name}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5">
                                          {getFileType(file.name)}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Remove Button */}
                                    {!isUploading && (
                                      <button
                                        onClick={() => {
                                          setUploadedFiles((prev) => ({
                                            ...prev,
                                            [item.id]: prev[item.id]?.filter((_, i) => i !== idx) || [],
                                          }))
                                          // Also remove from status
                                          setUploadedFileStatus(prev => {
                                            const updated = { ...prev }
                                            if (updated[item.id]) {
                                              delete updated[item.id][file.name]
                                              if (Object.keys(updated[item.id]).length === 0) {
                                                delete updated[item.id]
                                              }
                                            }
                                            return updated
                                          })
                                        }}
                                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
                                        title="Remove file"
                                      >
                                        <XCircle className="h-4 w-4 text-white" />
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          <div className="flex gap-2">
                            {/* File Upload Button */}
                            <div className="relative" ref={(el) => { fileMenuRefs.current[item.id] = el }}>
                              <button
                                onClick={() => setShowFileMenu((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                                className="p-2 hover:bg-gray-lighter rounded-md transition-colors"
                                title="Upload file"
                              >
                                <Plus className="h-5 w-5 text-gray-darker" />
                              </button>
                              {showFileMenu[item.id] && (
                                <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-lighter rounded-md shadow-lg z-10">
                                  <label 
                                    htmlFor={`file-upload-${item.id}`}
                                    className="block w-full px-4 py-2 text-sm text-gray-dark hover:bg-gray-lighter cursor-pointer"
                                    onClick={(e) => {
                                      console.log('🟢 Label clicked for item:', item.id)
                                      // Programmatically trigger file input click as backup
                                      setTimeout(() => {
                                        const input = document.getElementById(`file-upload-${item.id}`) as HTMLInputElement
                                        if (input && !input.files || input.files?.length === 0) {
                                          console.log('🟢 Triggering input click programmatically')
                                          input.click()
                                        }
                                      }, 10)
                                    }}
                                  >
                                    <Upload className="h-4 w-4 inline mr-2" />
                                    Upload File
                                  </label>
                                  <input
                                    id={`file-upload-${item.id}`}
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => {
                                      console.log('🟡 File input onChange triggered for item:', item.id)
                                      console.log('🟡 Event target:', e.target)
                                      console.log('🟡 Files:', e.target.files)
                                      console.log('🟡 Files length:', e.target.files?.length)
                                      if (e.target.files && e.target.files.length > 0) {
                                        console.log('🟡 Calling handleFileUpload with', e.target.files.length, 'files')
                                        handleFileUpload(item.id, e)
                                      } else {
                                        console.log('🟡 No files in onChange event')
                                      }
                                    }}
                                    onClick={(e) => {
                                      console.log('🟣 File input clicked directly')
                                      e.stopPropagation()
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                            
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
                              disabled={!chatMessages[item.id]?.trim() && (!uploadedFiles[item.id] || uploadedFiles[item.id].length === 0)}
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
                        {/* Only show Approve/Reject when chat is NOT expanded */}
                        {!isChatExpanded && (
                          <>
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
                {filteredCompletedItems.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {filteredCompletedItems.length === 0 ? (
                <Card variant="outlined" className="p-8 text-center border-dashed">
                  <p className="text-sm text-gray-darker">
                    No completed tasks
                  </p>
                </Card>
              ) : (
                filteredCompletedItems.map((item) => {
                  const isFeedbackExpanded = expandedFeedbackId === item.id
                  const feedbackHistory = item.feedbackHistory || []
                  
                  return (
                    <Card key={item.id} variant="elevated" className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-darker">
                            {item.digitalWorkerName}
                          </span>
                        </div>
                        <button
                          onClick={() => setExpandedFeedbackId(isFeedbackExpanded ? null : item.id)}
                          className="p-1 hover:bg-gray-lighter rounded transition-colors"
                          title={isFeedbackExpanded ? 'Close feedback' : 'Provide feedback'}
                        >
                          <MessageSquare className={`h-4 w-4 ${isFeedbackExpanded ? 'text-blue-600' : 'text-gray-darker'}`} />
                        </button>
                      </div>
                      <div className="text-sm text-gray-dark">{item.goal}</div>
                      <div className="text-xs text-gray-darker mt-2">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </div>
                      
                      {/* Feedback Chat */}
                      {isFeedbackExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-lighter">
                          <div className="text-xs font-semibold text-gray-darker mb-2">Provide Feedback</div>
                          <div className="max-h-48 overflow-y-auto mb-2 space-y-2 bg-gray-50 rounded p-2">
                            {feedbackHistory.length === 0 ? (
                              <div className="text-xs text-gray-darker italic">No feedback yet...</div>
                            ) : (
                              feedbackHistory.map((msg, idx) => (
                                <div
                                  key={idx}
                                  className={`text-xs p-2 rounded ${
                                    msg.sender === 'user'
                                      ? 'bg-blue-100 text-blue-900 ml-auto max-w-[80%]'
                                      : 'bg-white border border-gray-200 text-gray-700'
                                  }`}
                                >
                                  <div className="font-semibold mb-1">
                                    {msg.sender === 'user' ? 'You' : 'Assistant'}
                                  </div>
                                  <div className="whitespace-pre-wrap">{msg.text}</div>
                                </div>
                              ))
                            )}
                            <div ref={(el) => { chatEndRefs.current[`feedback-${item.id}`] = el }} />
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={feedbackMessages[item.id] || ''}
                              onChange={(e) => setFeedbackMessages(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="Type your feedback..."
                              className="flex-1 text-xs"
                              size="sm"
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={async () => {
                                const message = feedbackMessages[item.id]?.trim()
                                if (!message) return

                                const userMsg: ConversationMessage = {
                                  sender: 'user',
                                  text: message,
                                  timestamp: new Date(),
                                }
                                const newHistory = [...feedbackHistory, userMsg]
                                
                                // Update local state
                                setCompletedItems(prev => prev.map(i => 
                                  i.id === item.id 
                                    ? { ...i, feedbackHistory: newHistory }
                                    : i
                                ))
                                setFeedbackMessages(prev => ({ ...prev, [item.id]: '' }))

                                try {
                                  const { response, shouldRerun } = await provideFeedbackOnCompletion(
                                    item.workflowId,
                                    item.goal,
                                    message,
                                    feedbackHistory
                                  )

                                  const assistantMsg: ConversationMessage = {
                                    sender: 'system',
                                    text: response,
                                    timestamp: new Date(),
                                  }

                                  setCompletedItems(prev => prev.map(i => 
                                    i.id === item.id 
                                      ? { ...i, feedbackHistory: [...newHistory, assistantMsg] }
                                      : i
                                  ))

                                  if (shouldRerun) {
                                    // TODO: Re-execute workflow with feedback
                                    console.log('Should rerun workflow with feedback')
                                  }
                                } catch (error) {
                                  console.error('Error providing feedback:', error)
                                }
                              }}
                              disabled={!feedbackMessages[item.id]?.trim()}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
