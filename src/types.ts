// Workflow Types
export interface Workflow {
  id: string
  name: string
  description?: string
  steps: WorkflowStep[]
  conversation?: ConversationMessage[]  // Chat history persisted with workflow
  hasGeneratedSteps?: boolean           // Track if steps have been generated
  assignedTo?: {
    stakeholderName: string
    stakeholderType: 'ai' | 'human'
  }
  status: 'draft' | 'active' | 'paused'
  createdAt?: Date
  updatedAt?: Date
}

export interface WorkflowStep {
  id: string
  label: string
  type: 'trigger' | 'action' | 'decision' | 'end'
  assignedTo?: {
    type: 'ai' | 'human'
    agentName?: string
    humanId?: string    // ID of the human worker assigned (for human type)
    humanName?: string  // Display name of the assigned human
  }
  order: number
  requirements?: StepRequirements
}

export interface StepRequirements {
  isComplete: boolean
  requirementsText?: string
  chatHistory?: Array<{ sender: 'user' | 'system'; text: string }>
  integrations?: {
    gmail?: boolean
  }
  customRequirements?: string[]
  blueprint?: {
    greenList: string[]
    redList: string[]
    outstandingQuestions?: string[]
  }
  generatedImages?: string[] // Array of image URLs/data URLs
  excelData?: string // Excel data in text grid format
}

// Agent Configuration
export interface AgentConfiguration {
  id: string
  name: string
  stepId: string
  workflowId: string
  blueprint: {
    greenList: string[]
    redList: string[]
  }
  integrations: {
    gmail?: {
      authenticated: boolean
      account?: string
    }
  }
  status: 'configured' | 'active' | 'paused'
  createdAt: Date
}

// Team Types
export interface Team {
  id: string
  name: string // User-defined name (flexible)
  members: string[] // Employee names
  managerId?: string // Who the team reports to (name of manager)
  digitalWorkerId?: string // ID of digital worker assigned to this team
}

// Org Chart Types
export interface NodeData {
  name: string
  type: 'ai' | 'human'
  role?: string
  status?: 'active' | 'inactive' | 'needs_attention'
  assignedWorkflows?: string[] // Array of workflow IDs
  parentName?: string // Name of parent node (for building hierarchy)
  children?: NodeData[]
  teamId?: string // Link to team if this is a digital worker
}

// Conversation Types
export interface ConversationMessage {
  sender: 'user' | 'system'
  text: string
  timestamp?: Date
  excelData?: string // Excel data in text grid format
  imageUrl?: string // URL or data URL for generated images
}

export interface ConversationSession {
  id: string
  messages: ConversationMessage[]
  workflowId?: string
  createdAt: Date
  updatedAt: Date
}

// Control Room Types
export interface ControlRoomUpdate {
  type: 'workflow_update' | 'review_needed' | 'completed'
  data: {
    workflowId: string
    stepId?: string
    agentId?: string
    digitalWorkerName?: string
    message?: string
    action?: {
      type: string
      payload: unknown
    }
    timestamp: Date
  }
}

export interface ReviewItem {
  id: string
  workflowId: string
  stepId: string
  digitalWorkerName: string
  action: {
    type: string
    payload: unknown
  }
  timestamp: Date
  chatHistory?: Array<{ 
    sender: 'user' | 'agent' | 'system'
    text: string
    timestamp: Date
    excelData?: string // Excel data in text grid format
    uploadedFileName?: string // Name of uploaded file
    imageUrl?: string // Image URL or data URL for previews
  }>
  needsGuidance?: boolean // Flag to indicate if agent is requesting guidance
  // New fields for enhanced agent capabilities
  requestedFileType?: 'excel' | 'image' | 'document' | 'any' // Hint for what file type agent needs
  previewImageUrl?: string // Image to show for approval before proceeding
  previewImageCaption?: string // Caption explaining the image
}

export interface CompletedItem {
  id: string
  workflowId: string
  digitalWorkerName: string
  goal: string
  timestamp: Date
  feedbackHistory?: ConversationMessage[]
}

// Gmail Types
export interface GmailAuthState {
  authenticated: boolean
  account?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

// App State Types
export type TabType = 'create-workflow' | 'team' | 'control-room'

export interface AppState {
  activeTab: TabType
  user?: {
    name: string
    title: string
    avatar?: string
  }
}
