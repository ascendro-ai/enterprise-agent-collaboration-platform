import { File, Loader2, XCircle, FileSpreadsheet } from 'lucide-react'
import { isExcelFile } from '../../services/excelService'

interface FileUploadChipsProps {
  files: File[]
  uploadingFiles: Record<string, 'uploading' | 'success' | 'error'>
  onRemove: (index: number) => void
  className?: string
  variant?: 'light' | 'dark'
}

export function FileUploadChips({ files, uploadingFiles, onRemove, className = '', variant = 'light' }: FileUploadChipsProps) {
  const getFileType = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    const typeMap: Record<string, string> = {
      xlsx: 'Spreadsheet',
      xls: 'Spreadsheet',
      csv: 'Spreadsheet',
      pdf: 'PDF',
      doc: 'Document',
      docx: 'Document',
      txt: 'Text',
    }
    return typeMap[ext || ''] || 'File'
  }

  const getFileIcon = (fileName: string, isUploading: boolean) => {
    if (isUploading) {
      return <Loader2 className="h-3 w-3 animate-spin text-white" />
    }
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      return <FileSpreadsheet className="h-3 w-3 text-white" />
    }
    return <File className="h-3 w-3 text-white" />
  }

  if (files.length === 0) return null

  const isDark = variant === 'dark'

  return (
    <div className={`flex ${isDark ? 'flex-col' : 'flex-wrap'} gap-2 ${className}`}>
      {files.map((file, index) => {
        const status = uploadingFiles[file.name] || 'success'
        const isUploading = status === 'uploading'
        const isError = status === 'error'
        
        if (isDark) {
          // Dark variant - larger chips for control room
          return (
            <div
              key={index}
              className={`relative rounded-lg transition-all ${
                isUploading 
                  ? 'bg-gray-700 border border-gray-600' 
                  : isError
                  ? 'bg-red-900/20 border border-red-500/50'
                  : 'bg-gray-800 border border-gray-700'
              }`}
              style={{ 
                padding: '12px 40px 12px 12px',
                minHeight: '64px'
              }}
            >
              <div className="flex items-start gap-3">
                {/* File Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded flex items-center justify-center ${
                  isUploading 
                    ? 'bg-gray-600' 
                    : isError
                    ? 'bg-red-500/20'
                    : 'bg-green-500'
                }`}>
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : isError ? (
                    <XCircle className="h-5 w-5 text-red-500" />
                  ) : (
                    getFileIcon(file.name, false)
                  )}
                </div>
                
                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {file.name}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {getFileType(file.name)}
                  </div>
                </div>
              </div>
              
              {/* Remove Button */}
              {!isUploading && (
                <button
                  onClick={() => onRemove(index)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
                  title="Remove file"
                >
                  <XCircle className="h-4 w-4 text-white" />
                </button>
              )}
            </div>
          )
        }
        
        // Light variant - compact bubbles
        return (
          <div
            key={index}
            className={`relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 transition-all ${
              isUploading 
                ? 'bg-gray-200 border border-gray-300' 
                : isError
                ? 'bg-red-50 border border-red-200'
                : 'bg-gray-100 border border-gray-200'
            }`}
          >
            {/* File Icon */}
            <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center ${
              isUploading 
                ? 'bg-gray-400' 
                : isError
                ? 'bg-red-300'
                : 'bg-green-500'
            }`}>
              {isUploading ? (
                <Loader2 className="h-3 w-3 animate-spin text-white" />
              ) : isError ? (
                <XCircle className="h-3 w-3 text-red-600" />
              ) : (
                getFileIcon(file.name, false)
              )}
            </div>
            
            {/* File Name */}
            <span className="text-xs font-medium text-gray-700 truncate max-w-[120px]">
              {file.name}
            </span>
            
            {/* Remove Button */}
            {!isUploading && (
              <button
                onClick={() => onRemove(index)}
                className="flex-shrink-0 w-4 h-4 rounded-full hover:bg-gray-200 flex items-center justify-center transition-colors ml-1"
                title="Remove file"
              >
                <XCircle className="h-3 w-3 text-gray-500" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
