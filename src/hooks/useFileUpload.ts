import { useState, useCallback } from 'react'
import { parseExcelFile, isExcelFile } from '../services/excelService'

export interface UseFileUploadOptions {
  onExcelProcessed?: (excelData: string, fileName: string) => void
  onFileAdded?: (file: File) => void
  onFileRemoved?: (file: File) => void
}

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const [files, setFiles] = useState<File[]>([])
  const [excelData, setExcelData] = useState<string>('')
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, 'uploading' | 'success' | 'error'>>({})

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    
    if (selectedFiles.length === 0) {
      return
    }

    // Set uploading state
    const newUploadingFiles: Record<string, 'uploading' | 'success' | 'error'> = {}
    selectedFiles.forEach(file => {
      newUploadingFiles[file.name] = 'uploading'
    })
    setUploadingFiles(prev => ({ ...prev, ...newUploadingFiles }))
    
    // Add files immediately
    setFiles(prev => [...prev, ...selectedFiles])
    selectedFiles.forEach(file => options.onFileAdded?.(file))

    // Process Excel files
    for (const file of selectedFiles) {
      try {
        if (isExcelFile(file)) {
          const excelText = await parseExcelFile(file)
          setExcelData(excelText)
          setUploadingFiles(prev => ({ ...prev, [file.name]: 'success' }))
          options.onExcelProcessed?.(excelText, file.name)
        } else {
          setUploadingFiles(prev => ({ ...prev, [file.name]: 'success' }))
        }
      } catch (error) {
        console.error('Error processing file:', error)
        setUploadingFiles(prev => ({ ...prev, [file.name]: 'error' }))
      }
    }
    
    // Reset input
    e.target.value = ''
  }, [options])

  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const fileToRemove = prev[index]
      if (fileToRemove && isExcelFile(fileToRemove)) {
        setExcelData('')
      }
      if (fileToRemove) {
        options.onFileRemoved?.(fileToRemove)
      }
      return prev.filter((_, i) => i !== index)
    })
    setUploadingFiles(prev => {
      const updated = { ...prev }
      const fileName = files[index]?.name
      if (fileName) {
        delete updated[fileName]
      }
      return updated
    })
  }, [files, options])

  const clearFiles = useCallback(() => {
    setFiles([])
    setExcelData('')
    setUploadingFiles({})
  }, [])

  return {
    files,
    excelData,
    uploadingFiles,
    handleFileUpload,
    removeFile,
    clearFiles,
  }
}
