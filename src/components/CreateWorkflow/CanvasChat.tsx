import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Plus, Mic, Upload, Mail, Image as ImageIcon, ChevronUp, ChevronDown } from 'lucide-react'
import { useWorkflows } from '../../contexts/WorkflowContext'
import { consultWorkflow, extractWorkflowFromConversation } from '../../services/geminiService'
import { initiateGmailAuth, isGmailAuthenticated } from '../../services/gmailService'
import { isExcelFile } from '../../services/excelService'
import { generateImage, generateImageFromExcelInsights } from '../../services/imageGenerationService'
import { useFileUpload } from '../../hooks/useFileUpload'
import { FileUploadChips } from '../ui/FileUploadChips'
import type { Workflow, ConversationMessage } from '../../types'
import Input from '../ui/Input'
import Button from '../ui/Button'

interface CanvasChatProps {
  workflow: Workflow | null
  onConversationUpdate: (messages: ConversationMessage[]) => void
  onFirstMessage: (message: string) => void
}

export default function CanvasChat({
  workflow,
  onConversationUpdate,
  onFirstMessage,
}: CanvasChatProps) {
  const { updateWorkflow, autoNameWorkflow } = useWorkflows()
  
  // Chat state
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [questionCount, setQuestionCount] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [lastProcessedMessageId, setLastProcessedMessageId] = useState<string | null>(null)
  
  // UI state
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(isGmailAuthenticated())
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const extractionTimeoutRef = useRef<number | null>(null)

  // Get messages from workflow conversation
  const messages = workflow?.conversation || []

  // Use shared file upload hook
  const {
    files: uploadedFiles,
    excelData,
    uploadingFiles,
    handleFileUpload,
    removeFile,
    clearFiles,
  } = useFileUpload({
    onExcelProcessed: (excelData, fileName) => {
      console.log('🟢 Excel file processed successfully - available as context:', fileName)
    },
  })

  // Extract workflow after each message (background extraction) - MUST be defined before useEffects that use it
  const extractWorkflowSteps = useCallback(async (conversationHistory: ConversationMessage[]) => {
    if (!workflow) return

    // Debounce extraction to avoid too many API calls
    if (extractionTimeoutRef.current) {
      clearTimeout(extractionTimeoutRef.current)
    }

    extractionTimeoutRef.current = window.setTimeout(async () => {
      // Extract workflow if we have at least 2 messages (user + assistant)
      if (conversationHistory.length >= 2) {
        try {
          const extractedWorkflow = await extractWorkflowFromConversation(conversationHistory, workflow.id)
          
          if (extractedWorkflow && extractedWorkflow.steps.length > 0) {
            // Update the workflow with extracted steps
            updateWorkflow(workflow.id, {
              steps: extractedWorkflow.steps,
              hasGeneratedSteps: true,
              name: extractedWorkflow.name || workflow.name,
              description: extractedWorkflow.description || workflow.description,
            })
          }
        } catch (error) {
          console.error('Error extracting workflow:', error)
          // Don't show error to user - background extraction should be silent
        }
      }
    }, 500) // 500ms debounce
  }, [workflow, updateWorkflow])

  // Reset chat state when workflow changes (like starting a new ChatGPT conversation)
  useEffect(() => {
    // Reset all chat-related state when switching workflows
    setInputValue('')
    setIsLoading(false)
    setQuestionCount(0)
    setIsExpanded(false)
    setLastProcessedMessageId(null)
    setShowPlusMenu(false)
  }, [workflow?.id])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isExpanded])

  // Auto-send if last message is from user (without system response) - handles messages from ExampleCardsView
  useEffect(() => {
    if (!workflow || isLoading || messages.length === 0) return
    
    const lastMessage = messages[messages.length - 1]
    const messageId = `${lastMessage.timestamp?.getTime() || Date.now()}-${lastMessage.text.substring(0, 20)}`
    
    // Skip if we've already processed this message
    if (lastProcessedMessageId === messageId) return
    
    // If last message is from user, auto-send it to get LLM response
    if (lastMessage.sender === 'user') {
      // Check if there's already a system response after this user message
      const lastUserMessageIndex = messages.length - 1
      const hasSystemResponse = messages.slice(lastUserMessageIndex + 1).some(msg => msg.sender === 'system')
      
      if (!hasSystemResponse) {
        // Mark as processed and auto-send
        setLastProcessedMessageId(messageId)
        setIsExpanded(true)
        
        // Auto-send the message
        setIsLoading(true)
        
        const sendMessage = async () => {
          try {
            const messagesWithContext = excelData 
              ? [...messages, {
                  sender: 'system' as const,
                  text: `[Excel file context available: ${uploadedFiles.find(f => isExcelFile(f))?.name || 'spreadsheet'}]\n\nExcel Data:\n${excelData}\n\nYou can reference this Excel data in your response if relevant, but don't copy-paste the raw data. Provide insights or thoughts based on it.`,
                  excelData: excelData,
                  timestamp: new Date(),
                }]
              : messages
            
            const { response, isComplete } = await consultWorkflow(messagesWithContext, questionCount)

            // Validate response is not empty
            if (!response || response.trim() === '') {
              throw new Error('Received empty response from AI. Please try again.')
            }

            const systemMessage: ConversationMessage = {
              sender: 'system',
              text: response,
              timestamp: new Date(),
            }

            const updatedMessages = [...messages, systemMessage]
            onConversationUpdate(updatedMessages)

            if (!isComplete) {
              setQuestionCount((prev) => prev + 1)
            }

            extractWorkflowSteps(updatedMessages)
            clearFiles()
          } catch (error) {
            console.error('Error getting consultant response:', error)
            const errorDetails = error instanceof Error ? error.message : String(error)
            const errorMessage: ConversationMessage = {
              sender: 'system',
              text: `Sorry, I encountered an error: ${errorDetails}. Please try again.`,
              timestamp: new Date(),
            }
            onConversationUpdate([...messages, errorMessage])
          } finally {
            setIsLoading(false)
          }
        }
        
        sendMessage()
      }
    }
  }, [messages, workflow, isLoading, lastProcessedMessageId, excelData, uploadedFiles, questionCount, extractWorkflowSteps, clearFiles, onConversationUpdate])

  // Check Gmail connection status periodically
  useEffect(() => {
    const checkGmail = () => {
      setGmailConnected(isGmailAuthenticated())
    }
    checkGmail()
    const interval = setInterval(checkGmail, 2000)
    return () => clearInterval(interval)
  }, [])

  // Close plus menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setShowPlusMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (extractionTimeoutRef.current) {
        clearTimeout(extractionTimeoutRef.current)
      }
    }
  }, [])

  // Handle file upload wrapper
  const handleFileUploadWrapper = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🟡 File input onChange triggered in Canvas Chat')
    await handleFileUpload(e)
    setShowPlusMenu(false)
  }

  // Handle image generation
  const handleGenerateImage = async () => {
    if (!excelData && !inputValue.trim()) {
      alert('Please upload an Excel file or enter a prompt first')
      return
    }

    setIsGeneratingImage(true)
    setShowPlusMenu(false)
    
    try {
      let imageUrl: string
      if (excelData) {
        console.log('🟢 Generating image from Excel insights')
        imageUrl = await generateImageFromExcelInsights(excelData, inputValue.trim() || 'Create a marketing image based on the inventory data')
      } else {
        console.log('🟢 Generating image from prompt')
        imageUrl = await generateImage(inputValue.trim())
      }
      
      // Add image to conversation
      const imageMessage: ConversationMessage = {
        sender: 'system',
        text: `Generated marketing image`,
        imageUrl: imageUrl,
        timestamp: new Date(),
      }
      const updatedMessages = [...messages, imageMessage]
      onConversationUpdate(updatedMessages)
      
      console.log('🟢 Image generated successfully')
    } catch (error) {
      console.error('🔴 Error generating image:', error)
      alert('Failed to generate image. Please try again.')
    } finally {
      setIsGeneratingImage(false)
    }
  }

  // Handle connect Gmail
  const handleConnectGmail = async () => {
    try {
      await initiateGmailAuth()
      setShowPlusMenu(false)
    } catch (error) {
      console.error('Error connecting Gmail:', error)
    }
  }

  // Handle send message
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !workflow) return

    // Auto-expand when user sends a message
    setIsExpanded(true)

    const userMessage: ConversationMessage = {
      sender: 'user',
      text: inputValue.trim(),
      timestamp: new Date(),
    }

    // If this is the first message, auto-name the workflow
    if (messages.length === 0) {
      autoNameWorkflow(workflow.id, inputValue.trim())
      onFirstMessage(inputValue.trim())
    }

    const newMessages = [...messages, userMessage]
    onConversationUpdate(newMessages)
    setInputValue('')
    setIsLoading(true)

    try {
      // Get consultant response - include Excel data as context if available
      const messagesWithContext = excelData 
        ? [...newMessages, {
            sender: 'system' as const,
            text: `[Excel file context available: ${uploadedFiles.find(f => isExcelFile(f))?.name || 'spreadsheet'}]\n\nExcel Data:\n${excelData}\n\nYou can reference this Excel data in your response if relevant, but don't copy-paste the raw data. Provide insights or thoughts based on it.`,
            excelData: excelData,
            timestamp: new Date(),
          }]
        : newMessages
      
      const { response, isComplete } = await consultWorkflow(messagesWithContext, questionCount)

      // Validate response is not empty
      if (!response || response.trim() === '') {
        throw new Error('Received empty response from AI. Please try again.')
      }

      const systemMessage: ConversationMessage = {
        sender: 'system',
        text: response,
        timestamp: new Date(),
      }

      const updatedMessages = [...newMessages, systemMessage]
      onConversationUpdate(updatedMessages)

      // Update question count
      if (!isComplete) {
        setQuestionCount((prev) => prev + 1)
      }

      // Extract workflow steps in background after each message exchange
      extractWorkflowSteps(updatedMessages)
      
      // Clear uploaded files after message is sent successfully
      clearFiles()
    } catch (error) {
      console.error('Error getting consultant response:', error)
      const errorDetails = error instanceof Error ? error.message : String(error)
      const errorMessage: ConversationMessage = {
        sender: 'system',
        text: `Sorry, I encountered an error: ${errorDetails}. Please try again.`,
        timestamp: new Date(),
      }
      onConversationUpdate([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Get last 1-2 messages for mini-preview
  const lastMessages = messages.slice(-2)

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-20">
      {/* Collapse/Expand Toggle Header - Always at top when messages exist */}
      {messages.length > 0 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 py-2 bg-gray-50 hover:bg-gray-100 border-b border-gray-200 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronDown className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Hide conversation</span>
            </>
          ) : (
            <>
              <ChevronUp className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Show conversation ({messages.length} messages)</span>
            </>
          )}
        </button>
      )}

      {/* Mini Preview - Show last 1-2 messages when collapsed */}
      {!isExpanded && messages.length > 0 && (
        <div className="px-4 py-2 bg-white">
          <div className="max-w-3xl mx-auto space-y-2">
            {lastMessages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-1.5 ${
                    message.sender === 'user'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <p className="text-xs whitespace-pre-wrap line-clamp-2">{message.text}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-1 px-3 py-1.5">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expandable Message History */}
      {isExpanded && messages.length > 0 && (
        <div className="max-h-64 overflow-y-auto p-4 bg-white">
          <div className="max-w-3xl mx-auto space-y-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.sender === 'user'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                  {message.imageUrl && (
                    <img 
                      src={message.imageUrl} 
                      alt="Generated" 
                      className="mt-2 max-w-full rounded-lg"
                    />
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-1 px-4 py-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Chat Input Area */}
      <div className="p-4 border-t border-gray-100">
        <div className="max-w-3xl mx-auto">

          {/* File Upload Chips */}
          <FileUploadChips
            files={uploadedFiles}
            uploadingFiles={uploadingFiles}
            onRemove={removeFile}
          />

          {/* Input Row */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2 border border-gray-200">
            {/* Plus Menu */}
            <div className="relative" ref={plusMenuRef}>
              <button
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Plus className={`h-5 w-5 text-gray-500 transition-transform ${showPlusMenu ? 'rotate-45' : ''}`} />
              </button>

              {showPlusMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                  <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <Upload className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-700">Upload File</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUploadWrapper}
                      accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    />
                  </label>
                  <button
                    onClick={handleConnectGmail}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                  >
                    <Mail className={`h-4 w-4 ${gmailConnected ? 'text-green-500' : 'text-gray-500'}`} />
                    <span className="text-sm text-gray-700">
                      {gmailConnected ? 'Gmail Connected' : 'Connect Gmail'}
                    </span>
                  </button>
                  <button
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || (!inputValue.trim() && !excelData)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ImageIcon className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-700">
                      {isGeneratingImage ? 'Generating...' : 'Generate Image'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Input Field */}
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Describe your workflow..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 placeholder-gray-400"
              disabled={isLoading}
            />

            {/* Mic Button */}
            <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <Mic className="h-5 w-5 text-gray-500" />
            </button>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="p-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-300 rounded-lg transition-colors"
            >
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-gray-400 text-center mt-2">
            Copilot can make mistakes, so double-check it
          </p>
        </div>
      </div>
    </div>
  )
}
