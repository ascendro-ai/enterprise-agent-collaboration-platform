import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { ToggleLeft, ToggleRight, Send } from 'lucide-react'
import { useTeam } from '../contexts/TeamContext'
import { useWorkflows } from '../contexts/WorkflowContext'
import { useApp } from '../contexts/AppContext'
import { buildAgentsFromWorkflowRequirements, parseNodeCreationRequest } from '../services/geminiService'
import { startWorkflowExecution } from '../services/workflowExecutionService'
import {
  logDigitalWorkerActivation,
  logAgentAssignment,
  logErrorOrBlocker,
} from '../services/activityLogService'
import { CONTROL_ROOM_EVENT } from '../utils/constants'
import { storage } from '../utils/storage'
import type { NodeData, ControlRoomUpdate } from '../types'
import Button from './ui/Button'
import Input from './ui/Input'
import Card from './ui/Card'
import {
  AddDigitalWorkerIcon,
  AddHumanWorkerIcon,
  ChangeOrgStructureIcon,
} from './ui/ExampleIcons'

// Helper function to get initials from name
function getInitials(name: string): string {
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

export default function Screen2OrgChart() {
  const { team, toggleNodeStatus, assignWorkflowToNode, ensureDefaultDigitalWorker, addNode } = useTeam()
  const { workflows, activateWorkflow } = useWorkflows()
  const { user } = useApp()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
  const [chatMessage, setChatMessage] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'system'; text: string }>>([])
  const [isProcessingChat, setIsProcessingChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Ensure default digital worker exists
  useEffect(() => {
    ensureDefaultDigitalWorker()
  }, [ensureDefaultDigitalWorker])

  // Sync selectedNode when team changes
  useEffect(() => {
    if (selectedNode) {
      const updatedNode = team.find((n) => n.name === selectedNode.name)
      if (updatedNode) {
        setSelectedNode(updatedNode)
      }
    }
  }, [team, selectedNode])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Handle chat message to create new node
  const handleChatSend = async () => {
    const messageToSend = chatMessage.trim()
    if (!messageToSend || isProcessingChat) return

    const userMessage = messageToSend
    setChatMessage('')
    setIsProcessingChat(true)

    // Add user message to chat
    const newMessages = [...chatMessages, { sender: 'user' as const, text: userMessage }]
    setChatMessages(newMessages)

    try {
      // Parse the node creation request
      const parsed = await parseNodeCreationRequest(userMessage, team)

      if (!parsed) {
        // Not a node creation request
        setChatMessages([
          ...newMessages,
          {
            sender: 'system',
            text: "I didn't understand that. Try something like: 'Add a digital worker named Sarah who reports to Chitra M.' or 'Create a human team member called John, Flower Consultant'",
          },
        ])
        setIsProcessingChat(false)
        return
      }

      // Check if node already exists
      const exists = team.some((n) => n.name.toLowerCase() === parsed.name.toLowerCase())
      if (exists) {
        setChatMessages([
          ...newMessages,
          {
            sender: 'system',
            text: `A team member named "${parsed.name}" already exists. Please use a different name.`,
          },
        ])
        setIsProcessingChat(false)
        return
      }

      // Find parent node if specified
      const userName = user?.name || 'Chitra M.'
      let finalParentName: string | undefined = undefined
      
      if (parsed.parentName) {
        const parentNode = team.find(
          (n) => n.name.toLowerCase() === parsed.parentName!.toLowerCase()
        )
        
        // Check if parent is the user node
        if (!parentNode && userName.toLowerCase() === parsed.parentName.toLowerCase()) {
          finalParentName = userName // Set parent to user name
        } else if (parentNode) {
          finalParentName = parsed.parentName // Use the found parent name
        } else {
          // Parent not found
          setChatMessages([
            ...newMessages,
            {
              sender: 'system',
              text: `Could not find parent node "${parsed.parentName}". Available nodes: ${team.map((n) => n.name).join(', ')}${userName ? `, ${userName}` : ''}`,
            },
          ])
          setIsProcessingChat(false)
          return
        }
      }

      // Create new node
      const newNode: NodeData = {
        name: parsed.name,
        type: parsed.type,
        role: parsed.role,
        status: 'inactive',
        assignedWorkflows: [],
        parentName: finalParentName, // Set parent if specified
      }

      // Add node to team
      addNode(newNode)

      // Success message
      const successMessage = finalParentName
        ? `✅ Added "${parsed.name}" (${parsed.type})${parsed.role ? ` as ${parsed.role}` : ''} reporting to ${finalParentName}. The organizational chart will update automatically.`
        : `✅ Added "${parsed.name}" (${parsed.type})${parsed.role ? ` as ${parsed.role}` : ''} to the team. The organizational chart will update automatically.`

      setChatMessages([
        ...newMessages,
        {
          sender: 'system',
          text: successMessage,
        },
      ])
    } catch (error) {
      console.error('Error processing chat message:', error)
      setChatMessages([
        ...chatMessages,
        {
          sender: 'system',
          text: 'Sorry, I encountered an error processing your request. Please try again.',
        },
      ])
    } finally {
      setIsProcessingChat(false)
    }
  }

  // Helper function to build hierarchical tree structure from flat team array
  const buildHierarchy = (flatTeam: NodeData[], userName: string): NodeData => {
    // Create a map for quick lookup
    const nodeMap = new Map<string, NodeData>()
    
    // Initialize all nodes with empty children arrays
    flatTeam.forEach((node) => {
      nodeMap.set(node.name, { ...node, children: [] })
    })
    
    // Build the tree by assigning children to parents
    const rootChildren: NodeData[] = []
    
    flatTeam.forEach((node) => {
      const nodeWithChildren = nodeMap.get(node.name)!
      
      if (node.parentName) {
        // Check if parent is the user
        if (node.parentName.toLowerCase() === userName.toLowerCase()) {
          rootChildren.push(nodeWithChildren)
        } else {
          // Find parent in team
          const parent = nodeMap.get(node.parentName)
          if (parent) {
            if (!parent.children) {
              parent.children = []
            }
            parent.children.push(nodeWithChildren)
          } else {
            // Parent not found, add to root
            rootChildren.push(nodeWithChildren)
          }
        }
      } else {
        // No parent specified, add to root
        rootChildren.push(nodeWithChildren)
      }
    })
    
    // Create user node with children
    return {
      name: userName,
      type: 'human',
      role: user?.title || 'CEO, Treasure blossom',
      status: 'active',
      children: rootChildren,
    }
  }

  // Build D3 org chart
  useEffect(() => {
    if (!svgRef.current || team.length === 0) return

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth || 800

    // Build hierarchical structure from flat team array
    const userName = user?.name || 'Chitra M.'
    const userNode = buildHierarchy(team, userName)

    // Create hierarchical data structure with user at root
    const rootData: any = userNode
    const root = d3.hierarchy(rootData)
    
    // Use D3 tree layout - let it calculate natural tree structure
    // nodeSize([verticalSpacing, horizontalSpacing])
    const treeLayout = d3.tree<NodeData>().nodeSize([300, 200]) // 300px vertical, 200px horizontal spacing

    const treeData = treeLayout(root)

    // FIX 2: Create a container group for zoom/pan
    const container = svg.append('g').attr('class', 'container')

    // FIX 3: Set up zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        container.attr('transform', event.transform.toString())
      })

    svg.call(zoom)

    // FIX 4: Center the camera - find the root node's position and center on it
    const rootNode = treeData.descendants()[0]
    
    const rootX = rootNode ? rootNode.y : 0 // Horizontal position of root
    const rootY = rootNode ? rootNode.x : 0 // Vertical position of root

    // Center on the root node horizontally, and position it near the top
    const initialTransform = d3.zoomIdentity
      .translate(width / 2 - rootX, 80 - rootY)
      .scale(0.75)
    svg.call(zoom.transform, initialTransform)

    // FIX 5: Use d3.linkVertical() for smooth Bezier curves
    // D3 tree layout: x = horizontal, y = vertical
    // linkVertical expects: .x() = horizontal, .y() = vertical
    // So we use d.x for horizontal and d.y for vertical
    const linkGenerator = d3.linkVertical<any, any>()
      .x((d: any) => typeof d.x === 'number' ? d.x : 0) // Horizontal position (from D3 tree x)
      .y((d: any) => typeof d.y === 'number' ? d.y : 0) // Vertical position (from D3 tree y)

    // Create links - render BEFORE nodes so they appear behind
    container
      .append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(treeData.links().filter((link: any) => link.source.depth >= 0))
      .enter()
      .append('path')
      .attr('d', linkGenerator)
      .attr('stroke', '#D1D5DB')
      .attr('stroke-width', 1.5)
      .attr('fill', 'none')

    // Create nodes - render AFTER links so they appear on top
    const nodes = container
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g.node')
      .data(treeData.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => {
        // D3 tree layout: x = horizontal, y = vertical
        // SVG transform: translate(x, y) where x = horizontal, y = vertical
        // So we use d.x for horizontal and d.y for vertical directly
        const nodeX = typeof d.x === 'number' ? d.x : 0 // Horizontal position
        const nodeY = typeof d.y === 'number' ? d.y : 0 // Vertical position
        return `translate(${nodeX},${nodeY})`
      })
      .on('click', (_event, d: any) => {
        setSelectedNode(d.data)
      })

    // Add node cards (horizontal rectangles with avatars)
    nodes
      .append('rect')
      .attr('width', 200)
      .attr('height', 60)
      .attr('x', -100)
      .attr('y', -30)
      .attr('rx', 8)
      .attr('fill', '#FFFFFF')
      .attr('stroke', '#E5E7EB')
      .attr('stroke-width', 1)
      .attr('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.05))')

    // Add avatar circles
    nodes
      .append('circle')
      .attr('cx', -70)
      .attr('cy', 0)
      .attr('r', 20)
      .attr('fill', (d: any) => {
        if (d.data.type === 'human') {
          return '#FCE7F3' // Light pink for human
        }
        return '#DBEAFE' // Light blue for AI
      })
      .attr('stroke', (d: any) => {
        if (d.data.type === 'human') {
          return '#F9A8D4' // Darker pink border
        }
        return '#93C5FD' // Darker blue border
      })
      .attr('stroke-width', 1)

    // Add initials in avatar
    nodes
      .append('text')
      .attr('x', -70)
      .attr('y', 0)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('fill', (d: any) => {
        if (d.data.type === 'human') {
          return '#EC4899' // Pink text
        }
        return '#3B82F6' // Blue text
      })
      .text((d: any) => getInitials(d.data.name))

    // Add name text
    nodes
      .append('text')
      .attr('x', -40)
      .attr('y', -8)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '14px')
      .attr('font-weight', '500')
      .attr('fill', '#111827')
      .text((d: any) => {
        // For default digital worker, show "Digi" instead of "default"
        if (d.data.name === 'default' || d.data.name.toLowerCase().includes('default')) {
          return 'Digi'
        }
        const name = d.data.name
        return name.length > 15 ? name.substring(0, 15) + '...' : name
      })

    // Add role/title text (smaller, italic, below name)
    nodes
      .append('text')
      .attr('x', -40)
      .attr('y', 10)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '11px')
      .attr('font-style', 'italic')
      .attr('fill', '#6B7280')
      .text((d: any) => {
        // For default digital worker, show "Default Digital Worker"
        if (d.data.name === 'default' || d.data.name.toLowerCase().includes('default')) {
          return 'Default Digital Worker'
        }
        return d.data.role || ''
      })

    // Add status badges for digital workers (matching workflow badge style)
    // Position badges inside the white card on the right side
    // Card is 200px wide (x: -100 to +100), positioned centered at node (x: 0)
    const digitalWorkerNodes = nodes.filter((d: any) => d.data.type !== 'human')
    
    // Active badge - green background
    const activeNodes = digitalWorkerNodes.filter((d: any) => d.data.status === 'active')
    activeNodes.each(function() {
      const group = d3.select(this)
      
      // Background rounded rectangle (badge) - positioned on right side of card
      // Card right edge is at x: 100, badge width is 50px
      // Position at x: 45 so it ends at x: 95 (5px margin from right edge)
      group
        .append('rect')
        .attr('x', 45)
        .attr('y', -10)
        .attr('width', 50)
        .attr('height', 20)
        .attr('rx', 10)
        .attr('fill', '#10B981')
        .attr('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))')
      
      // "Active" text - centered in badge (x: 45 + 25 = 70)
      group
        .append('text')
        .attr('x', 70)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('fill', '#FFFFFF')
        .text('Active')
    })
    
    // Inactive badge - grey background
    const inactiveNodes = digitalWorkerNodes.filter((d: any) => d.data.status !== 'active')
    inactiveNodes.each(function() {
      const group = d3.select(this)
      
      // Background rounded rectangle (badge) - positioned on right side of card
      // Card right edge is at x: 100, badge width is 60px
      // Position at x: 35 so it ends at x: 95 (5px margin from right edge)
      group
        .append('rect')
        .attr('x', 35)
        .attr('y', -10)
        .attr('width', 60)
        .attr('height', 20)
        .attr('rx', 10)
        .attr('fill', '#9CA3AF')
        .attr('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))')
      
      // "Inactive" text - centered in badge (x: 35 + 30 = 65)
      group
        .append('text')
        .attr('x', 65)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .attr('fill', '#FFFFFF')
        .text('Inactive')
    })
  }, [team, user])

  // Show all workflows, not just active ones
  const availableWorkflows = workflows

  // Example team actions for inspiration
  const exampleTeamActions = [
    {
      title: 'Add Digital Worker',
      description: 'Create an AI agent to handle automated tasks and workflows.',
      prompt: 'Add a digital worker named Email Bot to handle customer email responses',
      icon: AddDigitalWorkerIcon,
    },
    {
      title: 'Add Human Worker',
      description: 'Add a team member who collaborates with digital workers.',
      prompt: 'Add Sarah as a human worker, Flower Consultant, reporting to Chitra M.',
      icon: AddHumanWorkerIcon,
    },
    {
      title: 'Change Org Structure',
      description: 'Reorganize your team hierarchy and reporting relationships.',
      prompt: 'Move Digi to report under Sarah instead of Chitra M.',
      icon: ChangeOrgStructureIcon,
    },
  ]

  // Handle example card click - reuse handleChatSend logic
  const handleExampleClick = async (prompt: string) => {
    if (isProcessingChat) return
    // Set the message and trigger send
    setChatMessage(prompt)
    // Use a small delay to ensure state is updated, then send
    setTimeout(async () => {
      const messageToSend = prompt.trim()
      if (!messageToSend) return

      setIsProcessingChat(true)

      // Add user message to chat
      const newMessages = [...chatMessages, { sender: 'user' as const, text: messageToSend }]
      setChatMessages(newMessages)

      try {
        // Parse the node creation request
        const parsed = await parseNodeCreationRequest(messageToSend, team)

        if (!parsed) {
          // Not a node creation request
          setChatMessages([
            ...newMessages,
            {
              sender: 'system',
              text: "I didn't understand that. Try something like: 'Add a digital worker named Sarah who reports to Chitra M.' or 'Create a human team member called John, Flower Consultant'",
            },
          ])
          setIsProcessingChat(false)
          return
        }

        // Check if node already exists
        const exists = team.some((n) => n.name.toLowerCase() === parsed.name.toLowerCase())
        if (exists) {
          setChatMessages([
            ...newMessages,
            {
              sender: 'system',
              text: `A team member named "${parsed.name}" already exists. Please use a different name.`,
            },
          ])
          setIsProcessingChat(false)
          return
        }

        // Find parent node if specified
        const userName = user?.name || 'Chitra M.'
        let finalParentName: string | undefined = undefined
        
        if (parsed.parentName) {
          const parentNode = team.find(
            (n) => n.name.toLowerCase() === parsed.parentName!.toLowerCase()
          )
          
          // Check if parent is the user node
          if (!parentNode && userName.toLowerCase() === parsed.parentName.toLowerCase()) {
            finalParentName = userName // Set parent to user name
          } else if (parentNode) {
            finalParentName = parsed.parentName // Use the found parent name
          } else {
            // Parent not found
            setChatMessages([
              ...newMessages,
              {
                sender: 'system',
                text: `Could not find parent node "${parsed.parentName}". Available nodes: ${team.map((n) => n.name).join(', ')}${userName ? `, ${userName}` : ''}`,
              },
            ])
            setIsProcessingChat(false)
            return
          }
        }

        // Create new node
        const newNode: NodeData = {
          name: parsed.name,
          type: parsed.type,
          role: parsed.role,
          status: 'inactive',
          assignedWorkflows: [],
          parentName: finalParentName, // Set parent if specified
        }

        // Add node to team
        addNode(newNode)

        // Success message
        const successMessage = finalParentName
          ? `✅ Added "${parsed.name}" (${parsed.type})${parsed.role ? ` as ${parsed.role}` : ''} reporting to ${finalParentName}. The organizational chart will update automatically.`
          : `✅ Added "${parsed.name}" (${parsed.type})${parsed.role ? ` as ${parsed.role}` : ''} to the team. The organizational chart will update automatically.`

        setChatMessages([
          ...newMessages,
          {
            sender: 'system',
            text: successMessage,
          },
        ])
        setChatMessage('') // Clear input
      } catch (error) {
        console.error('Error processing chat message:', error)
        setChatMessages([
          ...newMessages,
          {
            sender: 'system',
            text: 'Sorry, I encountered an error processing your request. Please try again.',
          },
        ])
      } finally {
        setIsProcessingChat(false)
      }
    }, 50)
  }

  const handleWorkflowAssign = async () => {
    if (!selectedNode || !selectedWorkflowId) return

    const workflow = workflows.find((w) => w.id === selectedWorkflowId)
    if (!workflow) return

    // Log agent assignment
    logAgentAssignment(workflow.id, selectedNode.name, workflow.name)

    // Assign workflow to node
    assignWorkflowToNode(selectedNode.name, selectedWorkflowId)

    // Build agents if node is active
    if (selectedNode.status === 'active') {
      try {
        await buildAgentsFromWorkflowRequirements(workflow, selectedNode.name)
        
        // Auto-activate workflow if it's in draft status
        if (workflow.status === 'draft') {
          activateWorkflow(workflow.id)
        }
        
        // Start workflow execution (pass digital worker name)
        startWorkflowExecution(workflow.id, selectedNode.name)
      } catch (error) {
        console.error('Error building agents or starting workflow:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        logErrorOrBlocker(
          workflow.id,
          '',
          workflow.name,
          selectedNode.name,
          `Failed to build agents or start workflow: ${errorMessage}`,
          'error'
        )
        alert('Failed to build agents or start workflow. Please try again.')
      }
    }

    setSelectedWorkflowId('')
  }

  const handleToggleStatus = (nodeName: string) => {
    const node = team.find((n) => n.name === nodeName)
    if (!node) return
    
    // Check what the NEW status will be (invert current status)
    const newStatus = node.status === 'active' ? 'inactive' : 'active'
    
    // Update the status
    toggleNodeStatus(nodeName)
    
    // If activating, send Control Room event immediately
    if (newStatus === 'active') {
      // Log digital worker activation
      logDigitalWorkerActivation(nodeName, node.assignedWorkflows || [])

      // Send Control Room event for worker activation
      const event = new CustomEvent(CONTROL_ROOM_EVENT, {
        detail: {
          type: 'workflow_update',
          data: {
            digitalWorkerName: nodeName,
            workflowId: node.assignedWorkflows?.[0] || 'standby',
            message: `Digital worker "${nodeName}" is now active`,
            timestamp: new Date(),
          },
        } as ControlRoomUpdate,
      })
      window.dispatchEvent(event)
      
      // If activating and has assigned workflows, build agents then start execution
      if (node.assignedWorkflows && node.assignedWorkflows.length > 0) {
        node.assignedWorkflows.forEach(async (workflowId) => {
          const workflow = workflows.find((w) => w.id === workflowId)
          if (workflow) {
            try {
              console.log(`🚀 [Digital Worker "${nodeName}"] Building agents for workflow "${workflow.name}"...`)
              // Build agents first (this creates the team of agents to handle the workflow)
              const agents = await buildAgentsFromWorkflowRequirements(workflow, nodeName)
              console.log(`✅ [Digital Worker "${nodeName}"] Agents built successfully (${agents.length} agents), starting workflow execution...`)
              
              // Auto-activate workflow if it's in draft status
              if (workflow.status === 'draft') {
                console.log(`🔄 [Digital Worker "${nodeName}"] Auto-activating workflow "${workflow.name}"...`)
                activateWorkflow(workflowId)
                
                // Manually save updated workflow to localStorage immediately (before useEffect runs)
                const updatedWorkflow = workflows.find((w) => w.id === workflowId)
                if (updatedWorkflow) {
                  const allWorkflows = storage.getWorkflows()
                  const updatedWorkflows = allWorkflows.map((w) => 
                    w.id === workflowId ? { ...updatedWorkflow, status: 'active' as const } : w
                  )
                  storage.saveWorkflows(updatedWorkflows)
                  console.log(`✅ [Digital Worker "${nodeName}"] Workflow activated and saved to localStorage, new status: active`)
                }
              }
              
              // Then start workflow execution (pass digital worker name)
              console.log(`▶️ [Digital Worker "${nodeName}"] Calling startWorkflowExecution for "${workflow.name}"...`)
              startWorkflowExecution(workflowId, nodeName)
            } catch (error) {
              console.error(`❌ [Digital Worker "${nodeName}"] Error building agents or starting workflow:`, error)
              const errorMessage = error instanceof Error ? error.message : String(error)
              // Log the error so it shows up in logs and Control Room
              logErrorOrBlocker(
                workflowId,
                '',
                workflow.name,
                nodeName,
                `Failed to build agents or start workflow: ${errorMessage}`,
                'error'
              )
            }
          }
        })
      }
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-light">
      {/* Header */}
      <div className="p-6 bg-white border-b border-gray-lighter">
        <h1 className="text-2xl font-semibold text-gray-dark mb-2">Your Team</h1>
        <p className="text-sm text-gray-darker">
          Drag canvas to pan • Click digital workers to assign workflows
        </p>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 relative overflow-hidden">
        <svg ref={svgRef} className="w-full h-full" />
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className="absolute bottom-[200px] right-4 w-80 bg-white rounded-lg shadow-lg p-4 border border-gray-lighter z-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-dark">
              {selectedNode.name === 'default' || selectedNode.name.toLowerCase().includes('default') 
                ? 'Digi' 
                : selectedNode.name}
            </h3>
            <button
              onClick={() => handleToggleStatus(selectedNode.name)}
              className="p-2 hover:bg-gray-lighter rounded transition-all"
            >
              {selectedNode.status === 'active' ? (
                <ToggleRight className="h-6 w-6 text-green-600 transition-colors" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-gray-darker transition-colors" />
              )}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-darker mb-1">Type</p>
              <p className="text-sm font-medium text-gray-dark capitalize">{selectedNode.type}</p>
            </div>

            {(selectedNode.role || (selectedNode.name === 'default' || selectedNode.name.toLowerCase().includes('default'))) && (
              <div>
                <p className="text-xs text-gray-darker mb-1">Role</p>
                <p className="text-sm font-medium text-gray-dark">
                  {selectedNode.name === 'default' || selectedNode.name.toLowerCase().includes('default')
                    ? 'Default Digital Worker'
                    : selectedNode.role}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-darker mb-1">Status</p>
              <span
                className={`inline-block px-2 py-1 text-xs rounded ${
                  selectedNode.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-lighter text-gray-darker'
                }`}
              >
                {selectedNode.status || 'inactive'}
              </span>
            </div>

            {/* Workflow Assignment */}
            <div>
              <p className="text-xs text-gray-darker mb-2">Assign Workflow</p>
              <select
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-lighter rounded-md text-sm mb-2"
              >
                <option value="">Select a workflow...</option>
                {availableWorkflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name} {workflow.status === 'draft' ? '(Draft)' : ''}
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                size="sm"
                onClick={handleWorkflowAssign}
                disabled={!selectedWorkflowId}
                className="w-full"
              >
                Assign Workflow
              </Button>
            </div>

            {/* Assigned Workflows */}
            {selectedNode.assignedWorkflows && selectedNode.assignedWorkflows.length > 0 && (
              <div>
                <p className="text-xs text-gray-darker mb-2">Assigned Workflows</p>
                <div className="space-y-1">
                  {selectedNode.assignedWorkflows.map((workflowId) => {
                    const workflow = workflows.find((w) => w.id === workflowId)
                    return workflow ? (
                      <div
                        key={workflowId}
                        className="px-2 py-1 bg-gray-lighter rounded text-xs text-gray-dark"
                      >
                        {workflow.name}
                      </div>
                    ) : null
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Area - Compact bottom section */}
      <div className="border-t border-gray-lighter bg-white">
        {/* Example Cards or Messages */}
        {chatMessages.length === 0 ? (
          <div className="p-4">
            {/* Example Cards - Compact horizontal layout with icons */}
            <div className="flex gap-3 mb-3">
              {exampleTeamActions.map((example, index) => {
                const Icon = example.icon
                return (
                  <Card
                    key={index}
                    variant="outlined"
                    className="flex-1 p-4 cursor-pointer hover:bg-gray-light transition-colors"
                    onClick={() => handleExampleClick(example.prompt)}
                  >
                    <div className="flex items-start gap-3">
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

            {/* Input Area */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Input
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleChatSend()
                    }
                  }}
                  placeholder="Message Team Architect..."
                  disabled={isProcessingChat}
                  className="w-full"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleChatSend}
                disabled={!chatMessage.trim() || isProcessingChat}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col max-h-[200px]">
            {/* Messages Area - Compact scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {chatMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-2xl rounded-lg px-3 py-1.5 text-sm ${
                      msg.sender === 'user'
                        ? 'bg-gray-lighter text-gray-dark'
                        : 'bg-gray-light text-gray-dark'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {isProcessingChat && (
                <div className="flex justify-start">
                  <div className="flex gap-1 px-3 py-1.5">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-lighter">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleChatSend()
                      }
                    }}
                    placeholder="Message Team Architect..."
                    disabled={isProcessingChat}
                    className="w-full"
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleChatSend}
                  disabled={!chatMessage.trim() || isProcessingChat}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
