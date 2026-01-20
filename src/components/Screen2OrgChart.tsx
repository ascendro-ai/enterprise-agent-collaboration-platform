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
  const { team, teams, toggleNodeStatus, assignWorkflowToNode, ensureDefaultDigitalWorker, addNode } = useTeam()
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('all')
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
  // Filter team based on selected team filter
  const filteredTeam = selectedTeamFilter === 'all'
    ? team
    : team.filter(node => node.teamId === selectedTeamFilter)

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
    if (!svgRef.current || filteredTeam.length === 0) return

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth || 800

    // Build hierarchical structure from flat team array
    const userName = user?.name || 'Chitra M.'
    const userNode = buildHierarchy(filteredTeam, userName)

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

    // Team colors for backgrounds
    const teamColors: Record<string, { bg: string; border: string; text: string }> = {
      default: { bg: '#F3F4F6', border: '#D1D5DB', text: '#6B7280' },
    }
    const colorPalette = [
      { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' }, // Blue
      { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' }, // Green
      { bg: '#FEF3C7', border: '#FDE68A', text: '#B45309' }, // Amber
      { bg: '#FCE7F3', border: '#FBCFE8', text: '#BE185D' }, // Pink
      { bg: '#EDE9FE', border: '#DDD6FE', text: '#7C3AED' }, // Purple
      { bg: '#ECFEFF', border: '#A5F3FC', text: '#0E7490' }, // Cyan
    ]
    teams.forEach((team, index) => {
      teamColors[team.id] = colorPalette[index % colorPalette.length]
    })

    // Draw team containers FIRST (behind everything)
    const teamContainersGroup = container.append('g').attr('class', 'team-containers')
    
    // Group nodes by teamId
    const nodesByTeam = new Map<string, any[]>()
    treeData.descendants().forEach((node: any) => {
      const teamId = node.data.teamId
      if (teamId) {
        if (!nodesByTeam.has(teamId)) {
          nodesByTeam.set(teamId, [])
        }
        nodesByTeam.get(teamId)?.push(node)
      }
    })

    // Draw a colored container for each team
    nodesByTeam.forEach((teamNodes, teamId) => {
      if (teamNodes.length === 0) return
      
      // Calculate bounding box for team nodes
      const padding = 40
      const minX = Math.min(...teamNodes.map((n: any) => n.x)) - 120 - padding
      const maxX = Math.max(...teamNodes.map((n: any) => n.x)) + 120 + padding
      const minY = Math.min(...teamNodes.map((n: any) => n.y)) - 50 - padding
      const maxY = Math.max(...teamNodes.map((n: any) => n.y)) + 50 + padding
      
      const colors = teamColors[teamId] || teamColors.default
      const team = teams.find(t => t.id === teamId)
      const teamName = team?.name || teamId

      // Draw background rectangle
      teamContainersGroup
        .append('rect')
        .attr('x', minX)
        .attr('y', minY)
        .attr('width', maxX - minX)
        .attr('height', maxY - minY)
        .attr('rx', 16)
        .attr('fill', colors.bg)
        .attr('stroke', colors.border)
        .attr('stroke-width', 2)
        .attr('opacity', 0.8)

      // Draw team name badge at top-left
      const badgeWidth = teamName.length * 8 + 24
      teamContainersGroup
        .append('rect')
        .attr('x', minX + 12)
        .attr('y', minY + 12)
        .attr('width', badgeWidth)
        .attr('height', 24)
        .attr('rx', 12)
        .attr('fill', colors.border)
      
      teamContainersGroup
        .append('text')
        .attr('x', minX + 12 + badgeWidth / 2)
        .attr('y', minY + 12 + 12)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('fill', colors.text)
        .text(teamName)
    })

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

    // Add status badges for digital workers ABOVE the card (top-right corner)
    // Card is 200px wide (x: -100 to +100), height 60px (y: -30 to +30)
    const digitalWorkerNodes = nodes.filter((d: any) => d.data.type !== 'human')
    
    // Active badge - green, positioned above card at top-right
    const activeNodes = digitalWorkerNodes.filter((d: any) => d.data.status === 'active')
    activeNodes.each(function() {
      const group = d3.select(this)
      
      // Badge positioned above card: y: -30 (card top) - 8 (gap) - 16 (badge height) = -54
      group
        .append('rect')
        .attr('x', 50)
        .attr('y', -50)
        .attr('width', 46)
        .attr('height', 18)
        .attr('rx', 9)
        .attr('fill', '#10B981')
        .attr('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))')
      
      group
        .append('text')
        .attr('x', 73)
        .attr('y', -41)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '9px')
        .attr('font-weight', '600')
        .attr('fill', '#FFFFFF')
        .text('Active')
    })
    
    // Inactive badge - grey, positioned above card at top-right
    const inactiveNodes = digitalWorkerNodes.filter((d: any) => d.data.status !== 'active')
    inactiveNodes.each(function() {
      const group = d3.select(this)
      
      // Badge positioned above card
      group
        .append('rect')
        .attr('x', 40)
        .attr('y', -50)
        .attr('width', 56)
        .attr('height', 18)
        .attr('rx', 9)
        .attr('fill', '#9CA3AF')
        .attr('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))')
      
      group
        .append('text')
        .attr('x', 68)
        .attr('y', -41)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '9px')
        .attr('font-weight', '600')
        .attr('fill', '#FFFFFF')
        .text('Inactive')
    })
  }, [filteredTeam, user, selectedTeamFilter])

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
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-dark mb-2">Your Team</h1>
            <p className="text-sm text-gray-darker">
              Drag canvas to pan • Click digital workers to assign workflows
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="team-filter" className="text-sm text-gray-darker">Filter:</label>
            <select
              id="team-filter"
              value={selectedTeamFilter}
              onChange={(e) => setSelectedTeamFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-lighter rounded-md text-sm text-gray-dark bg-white focus:outline-none focus:ring-2 focus:ring-gray-dark focus:border-transparent"
            >
              <option value="all">All</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 relative overflow-hidden">
        <svg ref={svgRef} className="w-full h-full" />
      </div>

      {/* Node Details Panel - Digital Employee ID Card */}
      {selectedNode && (
        <div className="absolute bottom-[200px] right-4 w-80 bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200 z-10">
          {/* Header - Avatar, Name/Role, Toggle */}
          <div className="flex items-start gap-4 mb-4">
            {/* Avatar with Status Dot */}
            <div className="relative flex-shrink-0">
              <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold text-lg ${
                selectedNode.type === 'human' 
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500' 
                  : 'bg-gradient-to-br from-indigo-500 to-purple-600'
              }`}>
                {getInitials(selectedNode.name === 'default' || selectedNode.name.toLowerCase().includes('default') 
                  ? 'Digi' 
                  : selectedNode.name)}
              </div>
              {/* Status Dot - bottom-right of avatar */}
              <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                selectedNode.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
              }`} />
            </div>

            {/* Name & Role */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 truncate">
                {selectedNode.name === 'default' || selectedNode.name.toLowerCase().includes('default') 
                  ? 'Digi' 
                  : selectedNode.name}
              </h3>
              <p className="text-sm text-gray-500 truncate">
                {selectedNode.type === 'human' 
                  ? selectedNode.role || 'Team Member'
                  : selectedNode.role || (selectedNode.name === 'default' || selectedNode.name.toLowerCase().includes('default')
                    ? 'Default Digital Worker'
                    : 'AI Assistant')}
              </p>
            </div>

            {/* Toggle Switch */}
            <button
              onClick={() => handleToggleStatus(selectedNode.name)}
              className="flex-shrink-0 p-1 hover:bg-gray-100 rounded-lg transition-colors"
              title={selectedNode.status === 'active' ? 'Disable' : 'Enable'}
            >
              {selectedNode.status === 'active' ? (
                <ToggleRight className="h-7 w-7 text-green-500" />
              ) : (
                <ToggleLeft className="h-7 w-7 text-gray-400" />
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 my-4" />

          {/* Body - Metadata Badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            {/* Type Badge */}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              selectedNode.type === 'human' 
                ? 'bg-amber-50 text-amber-700' 
                : 'bg-indigo-50 text-indigo-700'
            }`}>
              {selectedNode.type === 'human' ? '👤 Human' : '🤖 AI Worker'}
            </span>

            {/* Team Badge */}
            {selectedNode.teamId && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                {teams.find(t => t.id === selectedNode.teamId)?.name || selectedNode.teamId}
              </span>
            )}

            {/* Status Badge */}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              selectedNode.status === 'active' 
                ? 'bg-green-50 text-green-700' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {selectedNode.status === 'active' ? '● Active' : '○ Inactive'}
            </span>
          </div>

          {/* Footer - Workflow Assignment */}
          <div className="space-y-3">
            {/* Assigned Workflows */}
            {selectedNode.assignedWorkflows && selectedNode.assignedWorkflows.length > 0 ? (
              <div className="space-y-2">
                {selectedNode.assignedWorkflows.map((workflowId) => {
                  const workflow = workflows.find((w) => w.id === workflowId)
                  return workflow ? (
                    <div
                      key={workflowId}
                      className="flex items-center gap-2 px-3 py-2.5 bg-indigo-50 border border-indigo-100 rounded-lg"
                    >
                      <div className="h-6 w-6 rounded bg-indigo-500 flex items-center justify-center">
                        <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-indigo-900 truncate flex-1">
                        {workflow.name}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        workflow.status === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {workflow.status === 'active' ? 'Running' : 'Draft'}
                      </span>
                    </div>
                  ) : null
                })}
              </div>
            ) : null}

            {/* Assign Workflow - Select + Add Button */}
            <div className="flex items-center gap-2">
              <select
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                className={`flex-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors ${
                  (!selectedNode.assignedWorkflows || selectedNode.assignedWorkflows.length === 0)
                    ? 'border-2 border-dashed border-gray-300 text-gray-500 hover:border-indigo-400'
                    : 'border-gray-200 text-gray-600 bg-gray-50 hover:bg-white'
                }`}
              >
                <option value="">
                  {(!selectedNode.assignedWorkflows || selectedNode.assignedWorkflows.length === 0)
                    ? 'Select a workflow...'
                    : '+ Add another workflow'}
                </option>
                {availableWorkflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name} {workflow.status === 'draft' ? '(Draft)' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleWorkflowAssign}
                disabled={!selectedWorkflowId}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
            {(!selectedNode.assignedWorkflows || selectedNode.assignedWorkflows.length === 0) && (
              <p className="text-xs text-gray-400 text-center">Select a workflow and click Add to assign</p>
            )}
          </div>

          {/* Close button - positioned outside card at top-right */}
          <button
            onClick={() => setSelectedNode(null)}
            className="absolute -top-2 -right-2 h-6 w-6 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
