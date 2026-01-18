import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '../utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'flex w-full rounded-md border border-gray-lighter bg-white px-3 py-2 text-sm',
          'placeholder:text-gray-darker',
          'focus:outline-none focus:ring-2 focus:ring-gray-dark focus:border-transparent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'

export default Input
