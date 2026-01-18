// Custom icons matching the design from screenshots

export function NightlySecurityIcon() {
  return (
    <div className="w-12 h-12 bg-gray-lighter rounded-lg flex items-center justify-center relative">
      {/* Monitor/screen shape */}
      <div className="w-8 h-6 bg-gray-200 rounded border border-gray-300 relative">
        {/* Screen content */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
        </div>
        {/* Active indicator - green dot top right */}
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
      </div>
    </div>
  )
}

export function SpoilageDetectionIcon() {
  return (
    <div className="w-12 h-12 bg-gray-lighter rounded-lg flex items-center justify-center relative">
      {/* Camera shape */}
      <div className="w-8 h-6 bg-gray-200 rounded border border-gray-300 relative overflow-hidden">
        {/* Camera lens - pink arch */}
        <div className="absolute bottom-0 left-0 right-0 h-3 bg-pink-200 rounded-b"></div>
        {/* Recording indicator - red dot top right */}
        <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full"></div>
      </div>
    </div>
  )
}

export function FinancialAutopilotIcon() {
  return (
    <div className="w-12 h-12 bg-gray-lighter rounded-lg flex items-center justify-center relative">
      {/* Chart container */}
      <div className="w-8 h-8 bg-gray-200 rounded border border-gray-300 flex items-end justify-center gap-1 p-1.5 relative">
        {/* Bar chart bars */}
        <div className="w-1.5 bg-green-400 rounded-t" style={{ height: '30%' }}></div>
        <div className="w-1.5 bg-green-500 rounded-t" style={{ height: '60%' }}></div>
        <div className="w-1.5 bg-green-600 rounded-t" style={{ height: '100%' }}></div>
        {/* Dollar sign */}
        <div className="absolute top-1 right-1 text-green-600 font-bold text-xs">$</div>
      </div>
    </div>
  )
}

export function SalesResponseIcon() {
  return (
    <div className="w-12 h-12 bg-gray-lighter rounded-lg flex items-center justify-center relative">
      {/* Document shape */}
      <div className="w-8 h-6 bg-gray-200 rounded border border-gray-300 relative p-1.5">
        {/* Document lines */}
        <div className="space-y-0.5">
          <div className="h-0.5 bg-purple-300 rounded" style={{ width: '70%' }}></div>
          <div className="h-0.5 bg-purple-300 rounded" style={{ width: '85%' }}></div>
          <div className="h-0.5 bg-purple-300 rounded" style={{ width: '60%' }}></div>
        </div>
        {/* Purple dot bottom right */}
        <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
      </div>
    </div>
  )
}
