import { useState } from 'react'
import { WorkflowStep } from '../types'
import { Circle } from 'lucide-react'

interface WorkflowFlowchartProps {
  steps: WorkflowStep[]
  selectedStepId?: string
  onStepClick?: (stepId: string) => void
}

const CARD_WIDTH = 240
const CARD_HEIGHT = 140
const HORIZONTAL_GAP = 280
const VERTICAL_GAP = 220
const CARDS_PER_ROW = 3

// Calculate position for serpentine layout
function calculatePosition(index: number) {
  const row = Math.floor(index / CARDS_PER_ROW)
  const col = index % CARDS_PER_ROW
  const isEvenRow = row % 2 === 0
  
  // For odd rows, reverse the column order
  const actualCol = isEvenRow ? col : CARDS_PER_ROW - 1 - col
  
  const x = actualCol * HORIZONTAL_GAP
  const y = row * VERTICAL_GAP
  
  return { x, y, row, col: actualCol, isEvenRow }
}

// Get card styling based on step type and assignment
function getCardStyles(step: WorkflowStep) {
  const baseStyles: {
    width: string
    height: string
    backgroundColor: string
    borderColor: string
    borderWidth?: string
    borderStyle?: string
    borderRadius: string
    color?: string
    boxShadow?: string
  } = {
    width: `${CARD_WIDTH}px`,
    height: `${CARD_HEIGHT}px`,
    backgroundColor: '#F9FAFB',
    borderColor: '#9CA3AF',
    borderRadius: '0.5rem',
  }
  
  switch (step.type) {
    case 'trigger':
      return {
        ...baseStyles,
        backgroundColor: '#A3C8F0', // Light blue
        borderColor: '#7BA3D4',
        borderWidth: '2px',
        borderRadius: '0.5rem',
        color: '#1F2937',
      }
    
    case 'action':
      if (step.assignedTo?.type === 'ai') {
        return {
          ...baseStyles,
          backgroundColor: '#D8B9FF', // Soft lavender
          borderColor: '#B894E6',
          borderWidth: '2px',
          borderRadius: '0.5rem',
          color: '#1F2937',
        }
      } else if (step.assignedTo?.type === 'human') {
        return {
          ...baseStyles,
          backgroundColor: '#FFB29B', // Warm coral
          borderColor: '#FF8A6B',
          borderWidth: '2px',
          borderRadius: '0.5rem',
          color: '#1F2937',
        }
      } else {
        return {
          ...baseStyles,
          backgroundColor: '#D8B9FF', // Default to soft lavender for unassigned
          borderColor: '#B894E6',
          borderWidth: '2px',
          borderRadius: '0.5rem',
          color: '#1F2937',
        }
      }
    
    case 'decision':
      const isAI = step.assignedTo?.type === 'ai'
      return {
        ...baseStyles,
        backgroundColor: isAI ? '#D8B9FF' : '#FFB29B',
        borderColor: isAI ? '#B894E6' : '#FF8A6B',
        borderWidth: '2px',
        borderStyle: 'dashed',
        borderRadius: '0.5rem',
        color: '#1F2937',
      }
    
    case 'end':
      return {
        ...baseStyles,
        backgroundColor: '#A6E3E9', // Light teal
        borderColor: '#7BC8D1',
        borderWidth: '2px',
        color: '#1F2937',
        borderRadius: '0.5rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      }
    
    default:
      return {
        ...baseStyles,
        backgroundColor: '#D8B9FF',
        borderColor: '#B894E6',
        borderWidth: '2px',
        borderRadius: '0.5rem',
        color: '#1F2937',
      }
  }
}

// Get type label
function getTypeLabel(type: string): string {
  switch (type) {
    case 'trigger': return 'TRIGGER'
    case 'action': return 'ACTION'
    case 'decision': return 'CHECK'
    case 'end': return 'END'
    default: return 'STEP'
  }
}

// Check if step needs attention
function needsAttention(step: WorkflowStep): boolean {
  if (step.type === 'trigger' || step.type === 'end') return false
  if (step.assignedTo?.type === 'ai' && !step.requirements?.isComplete) {
    return true
  }
  return false
}

export default function WorkflowFlowchart({
  steps,
  selectedStepId,
  onStepClick,
}: WorkflowFlowchartProps) {
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null)

  // Calculate container dimensions
  const totalRows = Math.ceil(sortedSteps.length / CARDS_PER_ROW)
  const containerWidth = CARDS_PER_ROW * HORIZONTAL_GAP
  const containerHeight = totalRows * VERTICAL_GAP + CARD_HEIGHT

  // Generate arrow paths
  const generateArrows = () => {
    const arrows: Array<{
      x1: number
      y1: number
      x2: number
      y2: number
      direction: 'right' | 'left' | 'down'
    }> = []

    for (let i = 0; i < sortedSteps.length - 1; i++) {
      const current = calculatePosition(i)
      const next = calculatePosition(i + 1)

      // If same row, draw horizontal arrow
      if (current.row === next.row) {
        const arrowY = current.y + CARD_HEIGHT / 2
        const arrowX1 = current.x + CARD_WIDTH
        const arrowX2 = next.x
        
        arrows.push({
          x1: arrowX1,
          y1: arrowY,
          x2: arrowX2,
          y2: arrowY,
          direction: current.isEvenRow ? 'right' : 'left',
        })
      } else {
        // Draw vertical arrow down from current row
        const arrowX = current.x + CARD_WIDTH / 2
        const arrowY1 = current.y + CARD_HEIGHT
        const arrowY2 = next.y
        
        arrows.push({
          x1: arrowX,
          y1: arrowY1,
          x2: arrowX,
          y2: arrowY2,
          direction: 'down',
        })
      }
    }

    return arrows
  }

  const arrows = generateArrows()

  return (
    <div className="relative w-full overflow-auto p-8" style={{ minHeight: `${containerHeight}px` }}>
      <svg
        className="absolute inset-0 pointer-events-none"
        width={containerWidth}
        height={containerHeight}
      >
        {/* Arrow connectors */}
        {arrows.map((arrow, index) => (
          <g key={index}>
            <line
              x1={arrow.x1}
              y1={arrow.y1}
              x2={arrow.x2}
              y2={arrow.y2}
              stroke="#a855f7"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
          </g>
        ))}
        {/* Arrowhead marker definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#a855f7" />
          </marker>
        </defs>
      </svg>

      {/* Workflow cards */}
      {sortedSteps.map((step, index) => {
        const position = calculatePosition(index)
        const styles = getCardStyles(step)
        const isSelected = selectedStepId === step.id
        const isHovered = hoveredStepId === step.id
        const needsAttn = needsAttention(step)

        const borderStyle = styles.borderStyle || 'solid'
        const borderWidth = styles.borderWidth || '1px'
        const boxShadow = isHovered || isSelected
          ? '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
          : styles.boxShadow || '0 1px 3px 0 rgba(0, 0, 0, 0.1)'

        return (
          <div
            key={step.id}
            className="absolute cursor-pointer transition-all duration-200"
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: styles.width,
              height: styles.height,
              backgroundColor: styles.backgroundColor,
              color: styles.color,
              borderRadius: styles.borderRadius,
              border: `${borderWidth} ${borderStyle} ${styles.borderColor}`,
              boxShadow,
              transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
              zIndex: isSelected ? 10 : isHovered ? 5 : 1,
            }}
            onClick={() => onStepClick?.(step.id)}
            onMouseEnter={() => setHoveredStepId(step.id)}
            onMouseLeave={() => setHoveredStepId(null)}
          >
            {/* Step number badge */}
            <div
              className="absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-md"
              style={{
                backgroundColor: step.type === 'trigger' 
                  ? '#7BA3D4' 
                  : step.type === 'end'
                  ? '#7BC8D1'
                  : step.assignedTo?.type === 'human'
                  ? '#FF8A6B'
                  : '#B894E6',
              }}
            >
              {index + 1}
            </div>

            {/* Needs attention indicator */}
            {needsAttn && (
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-400 rounded-full animate-pulse border-2 border-white"></div>
            )}

            {/* Card content */}
            <div className="h-full p-4 flex flex-col">
              {/* Type label */}
              <div className="flex items-center gap-1 mb-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: styles.color || '#6B7280' }}
                >
                  {getTypeLabel(step.type)}
                </span>
                {step.type === 'decision' && (
                  <div className="flex gap-1 ml-1">
                    <Circle className="w-2 h-2 fill-current animate-pulse" />
                    <Circle className="w-2 h-2 fill-current animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <Circle className="w-2 h-2 fill-current animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                )}
              </div>

              {/* Step label */}
              <div className="flex-1 flex items-center">
                <p
                  className="text-sm font-medium leading-tight line-clamp-3"
                  style={{ color: styles.color || '#111827' }}
                >
                  {step.label}
                </p>
              </div>

              {/* Assignment indicator */}
              {step.assignedTo && (
                <div className="mt-2 flex items-center gap-1">
                  {step.assignedTo.type === 'ai' ? (
                    <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                  ) : (
                    <div className="w-2 h-2 bg-orange-600 rounded-full"></div>
                  )}
                  <span
                    className="text-xs font-medium"
                    style={{ color: styles.color || '#6B7280' }}
                  >
                    {step.assignedTo.type === 'ai' ? 'AI' : 'Human'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
