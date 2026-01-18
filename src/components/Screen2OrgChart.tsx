import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import { useTeam } from '../contexts/TeamContext'
import { useWorkflows } from '../contexts/WorkflowContext'
import { useApp } from '../contexts/AppContext'
import { buildAgentsFromWorkflowRequirements } from '../services/geminiService'
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

// Helper function to get initials from name
function getInitials(name: string): string {
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

export default function Screen2OrgChart() {
  const { team, toggleNodeStatus, assignWorkflowToNode, ensureDefaultDigitalWorker } = useTeam()
  const { workflows, activateWorkflow } = useWorkflows()
  const { user } = useApp()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')

  // Ensure default digital worker exists
  useEffect(() => {
    ensureDefaultDigitalWorker()
  }, [ensureDefaultDigitalWorker])

  // Build D3 org chart
  useEffect(() => {
    if (!svgRef.current || team.length === 0) return

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth || 800

    // Create user node with digital workers as children
    // TEMPORARY: Add Sarah as test node to see if D3 calculates positions correctly with multiple children
    const testTeam = [
      ...team,
      {
        name: 'Sarah',
        type: 'human' as const,
        role: 'Flower Consultant',
        status: 'inactive' as const,
        assignedWorkflows: [],
      } as NodeData,
    ]
    
    const userNode: NodeData = {
      name: user?.name || 'Chitra M.',
      type: 'human',
      role: user?.title || 'CEO, Treasure blossom',
      status: 'active',
      children: testTeam, // Digital workers report to user (including test node Sarah)
    }

    // Create hierarchical data structure with user at root
    const rootData: any = userNode
    const root = d3.hierarchy(rootData)
    
    // DEBUG: Verify hierarchy structure
    console.log('🔍 [Org Chart Debug] Hierarchy structure:')
    console.log('  Root:', root.data.name, 'depth:', root.depth, 'children:', root.children?.length)
    root.children?.forEach((child: any) => {
      console.log(`    Child: ${child.data.name}, depth: ${child.depth}`)
    })
    
    // Use D3 tree layout - let it calculate natural tree structure
    // nodeSize([verticalSpacing, horizontalSpacing])
    const treeLayout = d3.tree<NodeData>().nodeSize([300, 200]) // 300px vertical, 200px horizontal spacing

    const treeData = treeLayout(root)
    
    console.log('🔍 [Org Chart Debug] After D3 layout:')
    treeData.descendants().forEach((node: any) => {
      console.log(`  Node: ${node.data.name}, x: ${node.x}, y: ${node.y}, depth: ${node.depth}, parent: ${node.parent?.data.name || 'none'}`)
    })

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
    console.log('🔍 [Org Chart Debug] Root node:', rootNode)
    console.log('🔍 [Org Chart Debug] All descendants:', treeData.descendants())
    console.log('🔍 [Org Chart Debug] Root node data:', rootNode?.data)
    console.log('🔍 [Org Chart Debug] Root node position - x:', rootNode?.x, 'y:', rootNode?.y)
    
    const rootX = rootNode ? rootNode.y : 0 // Horizontal position of root
    const rootY = rootNode ? rootNode.x : 0 // Vertical position of root
    console.log('🔍 [Org Chart Debug] Calculated rootX:', rootX, 'rootY:', rootY)

    // Center on the root node horizontally, and position it near the top
    const initialTransform = d3.zoomIdentity
      .translate(width / 2 - rootX, 80 - rootY)
      .scale(0.75)
    console.log('🔍 [Org Chart Debug] Initial transform:', initialTransform.toString())
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
      .each((d: any) => {
        console.log('🎨 [Org Chart Debug] Rendering node:', d.data.name, 'at x:', d.x, 'y:', d.y, 'depth:', d.depth)
      })
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

    // Add status badge (only for non-human nodes) - green oval with "ACTIVE" text
    const activeNodes = nodes.filter((d: any) => d.data.type !== 'human' && d.data.status === 'active')
    
    // Add background oval for active status
    activeNodes
      .append('rect')
      .attr('x', 60)
      .attr('y', -12)
      .attr('width', 50)
      .attr('height', 20)
      .attr('rx', 10)
      .attr('fill', '#10B981')
    
    // Add "ACTIVE" text
    activeNodes
      .append('text')
      .attr('x', 85)
      .attr('y', 0)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', '#FFFFFF')
      .text('ACTIVE')
    
    // Add status indicator for inactive/needs attention (small dot)
    nodes
      .filter((d: any) => d.data.type !== 'human' && d.data.status !== 'active')
      .append('circle')
      .attr('r', 6)
      .attr('cx', 80)
      .attr('cy', -20)
      .attr('fill', (d: any) => {
        if (d.data.status === 'needs_attention') return '#F59E0B'
        return '#9CA3AF'
      })
  }, [team, user])

  // Show all workflows, not just active ones
  const availableWorkflows = workflows

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
        <div className="absolute bottom-4 right-4 w-80 bg-white rounded-lg shadow-lg p-4 border border-gray-lighter">
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
    </div>
  )
}
