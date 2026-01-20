import { useState, useRef, useEffect } from 'react'
import { Send, Plus, Mic, Upload, Mail, Image as ImageIcon } from 'lucide-react'
import { useFileUpload } from '../../hooks/useFileUpload'
import { FileUploadChips } from '../ui/FileUploadChips'
import type { Workflow } from '../../types'
import Card from '../ui/Card'
import {
  NightlySecurityIcon,
  SpoilageDetectionIcon,
  FinancialAutopilotIcon,
  SalesResponseIcon,
} from '../ui/ExampleIcons'

interface ExampleCardsViewProps {
  onExampleClick: (prompt: string) => void
  onFirstMessage: (message: string) => void
  selectedWorkflow: Workflow | null
  onConversationUpdate: (messages: Array<{ sender: 'user' | 'system'; text: string; timestamp?: Date }>) => void
}

export default function ExampleCardsView({
  onExampleClick,
  onFirstMessage,
  selectedWorkflow,
  onConversationUpdate,
}: ExampleCardsViewProps) {
  const [inputValue, setInputValue] = useState('')
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Use shared file upload hook (for passing files to canvas chat)
  const {
    files: uploadedFiles,
    uploadingFiles,
    handleFileUpload,
    removeFile,
  } = useFileUpload({
    onExcelProcessed: () => {
      // Files will be handled by CanvasChat
    },
  })

  // Reset state when workflow changes (new conversation)
  useEffect(() => {
    setInputValue('')
    setShowPlusMenu(false)
  }, [selectedWorkflow?.id])

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

  // Handle sending a message - adds to conversation and switches to canvas view
  const handleSend = () => {
    if (!inputValue.trim()) return

    const message = inputValue.trim()
    
    // If no workflow selected, create one first (like ChatGPT auto-creating a conversation)
    if (!selectedWorkflow) {
      onExampleClick(message) // This creates workflow, adds message, and switches to canvas
      setInputValue('')
      return
    }
    
    // Add message to conversation first
    const userMessage = {
      sender: 'user' as const,
      text: message,
      timestamp: new Date(),
    }
    const currentMessages = selectedWorkflow.conversation || []
    onConversationUpdate([...currentMessages, userMessage])
    
    // Then switch to canvas view
    onFirstMessage(message)
    setInputValue('')
  }

  // Handle example card click - adds to conversation and switches to canvas view
  const handleExampleCardClick = (prompt: string) => {
    // If no workflow selected, create one first (like ChatGPT)
    if (!selectedWorkflow) {
      onExampleClick(prompt) // This creates workflow, adds message, and switches to canvas
      return
    }
    
    // Add message to conversation first
    const userMessage = {
      sender: 'user' as const,
      text: prompt,
      timestamp: new Date(),
    }
    const currentMessages = selectedWorkflow.conversation || []
    onConversationUpdate([...currentMessages, userMessage])
    
    // Then switch to canvas view
    onFirstMessage(prompt)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const exampleWorkflows = [
    {
      title: 'Nightly Security Check',
      description: 'Verify store locks and van security via connected sensors or staff logs.',
      icon: NightlySecurityIcon,
      prompt: 'I need to automate nightly security checks for my store and van using connected sensors or staff logs.',
    },
    {
      title: 'Spoilage Detection',
      description: 'Identify potential spoilage via camera feed to reduce waste.',
      icon: SpoilageDetectionIcon,
      prompt: 'I want to set up automated spoilage detection using camera feeds to reduce waste.',
    },
    {
      title: 'Financial Autopilot',
      description: 'Auto-categorize bank transactions (Rent, Travel) in QuickBooks.',
      icon: FinancialAutopilotIcon,
      prompt: 'I need to automatically categorize bank transactions like rent and travel expenses in QuickBooks.',
    },
    {
      title: 'Sales Response',
      description: 'Automatically provide quotes and proposals for customer inquiries.',
      icon: SalesResponseIcon,
      prompt: 'I want to automate providing quotes and proposals for customer inquiries.',
    },
  ]

  return (
    <div className="flex flex-col h-full w-full flex-1 bg-gray-50">
      {/* Main Content Area - Cards Only */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-dark mb-3">
              What can I do for you?
            </h2>
            <p className="text-base text-gray-darker">
              Describe your daily routine, pain points, or the specific workflow you want to automate.
            </p>
          </div>

          {/* Example Cards Grid */}
          <div className="grid grid-cols-2 gap-4 w-full">
            {exampleWorkflows.map((example, index) => {
              const Icon = example.icon
              return (
                <Card
                  key={index}
                  variant="outlined"
                  className="p-5 cursor-pointer hover:bg-gray-light transition-colors bg-white"
                  onClick={() => handleExampleCardClick(example.prompt)}
                >
                  <div className="flex items-start gap-4">
                    <Icon />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-dark mb-1">
                        {example.title}
                      </h3>
                      <p className="text-sm text-gray-darker">
                        {example.description}
                      </p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom Input Area */}
      <div className="p-6 border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto">
          {/* File Upload Chips */}
          <FileUploadChips
            files={uploadedFiles}
            uploadingFiles={uploadingFiles}
            onRemove={removeFile}
          />

          {/* Input Row */}
          <div className="flex items-center gap-2">
            {/* Plus Menu */}
            <div className="relative" ref={plusMenuRef}>
              <button
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <Plus className={`h-5 w-5 text-gray-500 transition-transform ${showPlusMenu ? 'rotate-45' : ''}`} />
              </button>

              {showPlusMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                  <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer">
                    <Upload className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-700">Upload File</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Input Field */}
            <div className="flex-1">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Describe your workflow..."
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Mic Button */}
            <button className="p-2 hover:bg-gray-100 rounded-md transition-colors">
              <Mic className="h-5 w-5 text-gray-500" />
            </button>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-2.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-300 rounded-lg transition-colors"
            >
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
