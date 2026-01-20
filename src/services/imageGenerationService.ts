import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_CONFIG } from '../utils/constants'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY

if (!apiKey) {
  console.error('❌ VITE_GEMINI_API_KEY is not set in environment variables')
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

/**
 * Gets the Gemini Pro Image model instance (Nano Banana Pro)
 * Designed for professional asset production with advanced reasoning
 */
function getImageModel() {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }
  // Using gemini-3-pro-image-preview (Nano Banana Pro) for image generation
  return genAI.getGenerativeModel({ 
    model: GEMINI_CONFIG.IMAGE_MODEL,
    generationConfig: {
      temperature: 0.8, // Slightly higher for creative image generation
    },
  })
}

// Image generation timeout in milliseconds (60 seconds)
const IMAGE_GENERATION_TIMEOUT = 60000

/**
 * Generates an image based on a prompt, optionally using Excel data for context
 * Uses Gemini 3 Pro Image Preview (Nano Banana Pro) for professional asset production
 * @param prompt - The image generation prompt
 * @param excelData - Optional Excel data in text grid format to inform the image
 * @returns Promise resolving to base64 image data URL
 */
export async function generateImage(prompt: string, excelData?: string): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured')
  }

  console.log(`🎨 [Image Generation] Starting with model: ${GEMINI_CONFIG.IMAGE_MODEL}`)
  console.log(`🎨 [Image Generation] Prompt: ${prompt.substring(0, 100)}...`)
  console.log(`🎨 [Image Generation] Timeout set to ${IMAGE_GENERATION_TIMEOUT / 1000} seconds`)

  try {
    const model = getImageModel()

    // Build the full prompt with Excel context if provided
    // Format as explicit image generation request
    let fullPrompt = `Generate a professional, high-quality image based on the following description:\n\n${prompt}`
    
    if (excelData) {
      fullPrompt = `Generate a professional, high-quality image based on the following description and data context:

Image Description: ${prompt}

Data Context (use insights from this to inform the image):
${excelData}

Create a visually compelling image that incorporates relevant data insights. Focus on:
- Clear visual hierarchy
- Professional design aesthetics
- Data-driven visual elements where appropriate
- High-fidelity text rendering if text is needed`
    }

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Image generation timed out after ${IMAGE_GENERATION_TIMEOUT / 1000} seconds. Please try again.`))
      }, IMAGE_GENERATION_TIMEOUT)
    })

    // Generate image using Nano Banana Pro with timeout
    console.log(`🎨 [Image Generation] Sending request to API...`)
    const startTime = Date.now()
    
    const result = await Promise.race([
      model.generateContent(fullPrompt),
      timeoutPromise
    ])
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`🎨 [Image Generation] API responded in ${duration}s`)
    
    const response = await result.response

    // Extract image data from response
    // Gemini image models return images in the candidates[0].content.parts array
    const candidates = response.candidates
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content.parts
      
      console.log(`🎨 [Image Generation] Response has ${parts.length} parts`)
      
      // Look for image data in parts
      for (const part of parts) {
        if (part.inlineData) {
          console.log(`✅ [Image Generation] Found inline image data: ${part.inlineData.mimeType}`)
          // Return base64 image as data URL
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
        }
      }
      
      // If no image found, check for text response (might contain URL or description)
      const textPart = parts.find((p: any) => p.text)
      if (textPart?.text) {
        const text = textPart.text
        console.log(`🎨 [Image Generation] Got text response: ${text.substring(0, 200)}...`)
        
        // Check if text contains base64 or URL
        if (text.startsWith('data:image') || text.startsWith('http')) {
          return text
        }
        
        // Model might have returned a description instead of an image
        // This can happen if the model doesn't support image generation for this prompt
        throw new Error(`Model returned text instead of image: ${text.substring(0, 100)}...`)
      }
    }

    // Fallback: try text() method
    const textResponse = response.text()
    console.log(`🎨 [Image Generation] Fallback text response: ${textResponse?.substring(0, 200)}...`)
    
    if (textResponse && (textResponse.startsWith('data:image') || textResponse.startsWith('http'))) {
      return textResponse
    }

    throw new Error('No image data found in response. The model may not support image generation for this prompt.')
  } catch (error) {
    console.error('❌ [Image Generation] Error:', error)
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
