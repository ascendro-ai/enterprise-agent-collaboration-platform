import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import { useTeam } from '../contexts/TeamContext'
import { useWorkflows } from '../contexts/WorkflowContext'
import { buildAgentsFromWorkflowRequirements } from '../services/geminiService'
import { startWorkflowExecution } from '../services/workflowExecutionService'
import type { NodeData } from '../types'
import Button from './ui/Button'

export default function Screen2OrgChart() {
  const { team, toggleNodeStatus, assignWorkflowToNode, ensureDefaultDigitalWorker } = useTeam()
  const { workflows } = useWorkflows()
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
    const height = svgRef.current.clientHeight || 600

    // Create hierarchical data structure
    const rootData: any = { name: 'Team', children: team }
    const root = d3.hierarchy(rootData)
    const treeLayout = d3.tree<NodeData>().size([height - 100, width - 200])

    const treeData = treeLayout(root)

    // Create links
    svg
      .append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(treeData.links())
      .enter()
      .append('path')
      .attr('d', (d) => {
        return `M ${d.target.y + 100} ${d.target.x + 50} L ${d.source.y + 100} ${d.source.x + 50}`
      })
      .attr('stroke', '#666')
      .attr('stroke-width', 2)
      .attr('fill', 'none')

    // Create nodes
    const nodes = svg
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g.node')
      .data(treeData.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.y + 100},${d.x + 50})`)
      .on('click', (_event, d) => {
        if (d.data.name !== 'Team') {
          setSelectedNode(d.data)
        }
      })

    // Add node circles
    nodes
      .append('circle')
      .attr('r', 30)
      .attr('fill', (d) => {
        if (d.data.name === 'Team') return 'transparent'
        return d.data.status === 'active' ? '#3B82F6' : '#E5E5E5'
      })
      .attr('stroke', (d) => {
        if (d.data.name === 'Team') return 'transparent'
        return d.data.status === 'active' ? '#2563EB' : '#999'
      })
      .attr('stroke-width', 2)

    // Add node labels
    nodes
      .append('text')
      .attr('dy', 50)
      .attr('text-anchor', 'middle')
      .text((d) => {
        if (d.data.name === 'Team') return ''
        return d.data.name.length > 10 ? d.data.name.substring(0, 10) + '...' : d.data.name
      })
      .attr('font-size', '12px')
      .attr('fill', '#333')

    // Add status indicator
    nodes
      .filter((d) => d.data.name !== 'Team')
      .append('circle')
      .attr('r', 6)
      .attr('cx', -20)
      .attr('cy', -20)
      .attr('fill', (d) => {
        if (d.data.status === 'active') return '#10B981'
        if (d.data.status === 'needs_attention') return '#F59E0B'
        return '#9CA3AF'
      })
  }, [team])

  const activeWorkflows = workflows.filter((w) => w.status === 'active')

  const handleWorkflowAssign = async () => {
    if (!selectedNode || !selectedWorkflowId) return

    const workflow = workflows.find((w) => w.id === selectedWorkflowId)
    if (!workflow) return

    // Assign workflow to node
    assignWorkflowToNode(selectedNode.name, selectedWorkflowId)

    // Build agents if node is active
    if (selectedNode.status === 'active') {
      try {
        await buildAgentsFromWorkflowRequirements(workflow)
        // Start workflow execution
        startWorkflowExecution(workflow.id)
      } catch (error) {
        console.error('Error building agents:', error)
        alert('Failed to build agents. Please try again.')
      }
    }

    setSelectedWorkflowId('')
  }

  const handleToggleStatus = (nodeName: string) => {
    toggleNodeStatus(nodeName)
    // If activating and has assigned workflows, start execution
    const node = team.find((n) => n.name === nodeName)
    if (node && node.status === 'active' && node.assignedWorkflows && node.assignedWorkflows.length > 0) {
      node.assignedWorkflows.forEach((workflowId) => {
        const workflow = workflows.find((w) => w.id === workflowId)
        if (workflow) {
          startWorkflowExecution(workflowId)
        }
      })
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
            <h3 className="text-lg font-semibold text-gray-dark">{selectedNode.name}</h3>
            <button
              onClick={() => handleToggleStatus(selectedNode.name)}
              className="p-2 hover:bg-gray-lighter rounded"
            >
              {selectedNode.status === 'active' ? (
                <ToggleRight className="h-6 w-6 text-accent-blue" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-gray-darker" />
              )}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-darker mb-1">Type</p>
              <p className="text-sm font-medium text-gray-dark capitalize">{selectedNode.type}</p>
            </div>

            {selectedNode.role && (
              <div>
                <p className="text-xs text-gray-darker mb-1">Role</p>
                <p className="text-sm font-medium text-gray-dark">{selectedNode.role}</p>
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
                {activeWorkflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
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
