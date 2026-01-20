import * as XLSX from 'xlsx'

/**
 * Converts an Excel workbook to a text grid/matrix format
 * @param workbook - The parsed Excel workbook
 * @returns Formatted text representation of the Excel data
 */
export function excelToTextGrid(workbook: XLSX.WorkBook): string {
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return 'No sheets found in Excel file'
  }

  // Use the first sheet
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]

  // Convert sheet to JSON array format
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][]

  if (jsonData.length === 0) {
    return 'Excel sheet is empty'
  }

  // Find the maximum width for each column
  const maxWidths: number[] = []
  jsonData.forEach((row) => {
    row.forEach((cell, colIndex) => {
      const cellText = String(cell || '').trim()
      if (!maxWidths[colIndex] || cellText.length > maxWidths[colIndex]) {
        maxWidths[colIndex] = cellText.length
      }
    })
  })

  // Build the text grid
  const lines: string[] = []
  jsonData.forEach((row) => {
    const formattedRow = row.map((cell, colIndex) => {
      const cellText = String(cell || '').trim()
      const width = maxWidths[colIndex] || 0
      return cellText.padEnd(width)
    })
    lines.push(formattedRow.join(' | '))
  })

  return lines.join('\n')
}

/**
 * Parses an Excel file and converts it to text grid format
 * @param file - The Excel file to parse
 * @returns Promise resolving to formatted text representation
 */
export async function parseExcelFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          reject(new Error('Failed to read file'))
          return
        }

        // Parse the Excel file
        const workbook = XLSX.read(data, { type: 'array' })

        // Convert to text grid
        const textGrid = excelToTextGrid(workbook)
        resolve(textGrid)
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`))
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    // Read file as array buffer
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Checks if a file is an Excel file
 * @param file - The file to check
 * @returns True if the file is an Excel file
 */
export function isExcelFile(file: File): boolean {
  const excelExtensions = ['.xlsx', '.xls', '.xlsm']
  const fileName = file.name.toLowerCase()
  return excelExtensions.some((ext) => fileName.endsWith(ext))
}
