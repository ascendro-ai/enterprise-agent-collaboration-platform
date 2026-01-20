import { useState, useRef, useCallback, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react'
import type { Workflow } from '../../types'
import WorkflowFlowchart from '../WorkflowFlowchart'

interface WorkflowCanvasProps {
  workflow: Workflow | null
  selectedStepId: string | null
  onStepClick: (stepId: string) => void
}

export default function WorkflowCanvas({
  workflow,
  selectedStepId,
  onStepClick,
}: WorkflowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  // Zoom limits
  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 2
  const ZOOM_STEP = 0.1

  // Handle zoom in
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM))
  }, [])

  // Handle zoom out
  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM))
  }, [])

  // Handle reset zoom and pan
  const handleReset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)))
    }
  }, [])

  // Handle mouse down for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan with middle mouse button or when holding space
    if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [pan])

  // Handle mouse move for panning
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }
  }, [isPanning, panStart])

  // Handle mouse up to stop panning
  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Add global mouse event listeners for smooth panning
  useEffect(() => {
    if (!isPanning) return

    const handleGlobalMouseMove = (e: MouseEvent) => {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }

    const handleGlobalMouseUp = () => {
      setIsPanning(false)
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isPanning, panStart])

  // Empty state - just show clean canvas with padding for chat overlay
  if (!workflow || workflow.steps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 pb-32">
        <div className="text-center text-gray-400">
          <Move className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">Your workflow will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 relative overflow-hidden bg-gray-50 pb-32">
      {/* Canvas Container */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : 'default' }}
      >
        {/* Zoomable/Pannable Content */}
        <div
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <WorkflowFlowchart
            steps={workflow.steps}
            selectedStepId={selectedStepId || undefined}
            onStepClick={onStepClick}
          />
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="absolute bottom-24 right-4 flex flex-col gap-1 bg-white rounded-lg shadow-lg border border-gray-200 p-1">
        <button
          onClick={handleZoomIn}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Zoom In (Ctrl + Scroll)"
        >
          <ZoomIn className="h-4 w-4 text-gray-600" />
        </button>
        <div className="px-2 py-1 text-xs text-center text-gray-500 border-y border-gray-100">
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={handleZoomOut}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Zoom Out (Ctrl + Scroll)"
        >
          <ZoomOut className="h-4 w-4 text-gray-600" />
        </button>
        <button
          onClick={handleReset}
          className="p-2 hover:bg-gray-100 rounded transition-colors border-t border-gray-100"
          title="Reset View"
        >
          <Maximize2 className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Canvas Info */}
      <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-gray-600 shadow-sm">
        <span className="font-medium">{workflow.name}</span>
        <span className="mx-2 text-gray-300">•</span>
        <span>{workflow.steps.length} steps</span>
      </div>
    </div>
  )
}
