import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../utils/cn'
import Button from './Button'

interface SlideOverProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  side?: 'left' | 'right'
}

export default function SlideOver({
  isOpen,
  onClose,
  title,
  children,
  side = 'right',
}: SlideOverProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div
        className={cn(
          'fixed top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-xl',
          'transform transition-transform duration-300 ease-in-out',
          side === 'right' ? 'right-0' : 'left-0',
          isOpen ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full'
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-gray-lighter">
            <h2 className="text-xl font-semibold text-gray-dark">{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        )}
        <div className="overflow-y-auto h-[calc(100vh-80px)] p-6">{children}</div>
      </div>
    </>
  )
}
