import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_CONFIG } from '../utils/constants'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY

if (!apiKey) {
  console.error('❌ VITE_GEMINI_API_KEY is not set in environment variables')
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

/**
 * Gets the Gemini Flash model instance with image generation support
 */
function getImageModel() {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }
  // Note: responseModalities may need to be set differently depending on API version
  // For now, using the model without explicit responseModalities config
  return genAI.getGenerativeModel({ 
    model: GEMINI_CONFIG.IMAGE_MODEL,
  })
}

/**
 * Generates an image based on a prompt, optionally using Excel data for context
 * @param prompt - The image generation prompt
 * @param excelData - Optional Excel data in text grid format to inform the image
 * @returns Promise resolving to base64 image data URL
 */
export async function generateImage(prompt: string, excelData?: string): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  try {
    const model = getImageModel()

    // Build the full prompt with Excel context if provided
    let fullPrompt = prompt
    if (excelData) {
      fullPrompt = `${prompt}\n\nExcel Data Context:\n${excelData}\n\nUse the insights from this Excel data to inform the image generation.`
    }

    // Generate image using the Flash model with image generation support
    const result = await model.generateContent(fullPrompt)
    const response = await result.response

    // Extract image data from response
    // Flash models return images in the candidates[0].content.parts array
    const candidates = response.candidates
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content.parts
      
      // Look for image data in parts
      for (const part of parts) {
        if (part.inlineData) {
          // Return base64 image as data URL
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
        }
      }
      
      // If no image found, check for text response
      const textPart = parts.find((p: any) => p.text)
      if (textPart?.text) {
        const text = textPart.text
        // Check if text contains base64 or URL
        if (text.startsWith('data:image') || text.startsWith('http')) {
          return text
        }
      }
    }

    // Fallback: try text() method
    const textResponse = response.text()
    if (textResponse && (textResponse.startsWith('data:image') || textResponse.startsWith('http'))) {
      return textResponse
    }

    throw new Error('No image data found in response. The model may not have generated an image.')
  } catch (error) {
    console.error('Error generating image:', error)
    throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generates an image based on Excel data insights and a user prompt
 * @param excelData - Excel data in text grid format
 * @param userPrompt - User's prompt for image generation
 * @returns Promise resolving to base64 image data URL
 */
export async function generateImageFromExcelInsights(excelData: string, userPrompt: string): Promise<string> {
  // Analyze Excel data and create a detailed prompt
  const analysisPrompt = `Based on the following Excel data, generate insights and create a detailed image generation prompt:

Excel Data:
${excelData}

User Request: ${userPrompt}

Create a comprehensive image generation prompt that incorporates insights from the Excel data and fulfills the user's request.`

  return generateImage(analysisPrompt, excelData)
}
