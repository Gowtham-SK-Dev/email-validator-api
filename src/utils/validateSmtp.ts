import { validateSmtpSmart } from "./validateSmtpSmart"
import { validateInboxExistence } from "./validateInboxExistence"

interface ValidationResult {
  passed: boolean
  message: string
  smtpResponse?: string
  confidence?: number
  details?: any
  inboxValidation?: any
}

export async function validateSmtp(email: string): Promise<ValidationResult> {
  const domain = email.split("@")[1]

  // Check if we're in a serverless environment
  const isServerless = !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTIONS_WORKER ||
    process.env.NETLIFY ||
    process.env.RAILWAY_ENVIRONMENT
  )

  try {
    // First, run the smart validation
    const smartResult = await validateSmtpSmart(email)

    // If smart validation fails badly, don't bother with inbox validation
    if (smartResult.confidence && smartResult.confidence < 30) {
      return smartResult
    }

    // Run inbox existence validation
    let inboxResult
    try {
      inboxResult = await validateInboxExistence(email)
    } catch (inboxError) {
      console.error("Inbox validation error:", inboxError)
      // If inbox validation fails, still use smart validation result
      return {
        ...smartResult,
        message: `${smartResult.message} | Inbox validation failed: ${inboxError instanceof Error ? inboxError.message : "Unknown error"}`,
      }
    }

    // Combine results
    const combinedConfidence = Math.round((smartResult.confidence || 0) * 0.6 + inboxResult.confidence * 0.4)

    const finalPassed = smartResult.passed && inboxResult.passed && combinedConfidence >= 60

    return {
      passed: finalPassed,
      message: `${smartResult.message} | Inbox: ${inboxResult.message}`,
      confidence: combinedConfidence,
      details: {
        smartValidation: smartResult,
        inboxValidation: inboxResult,
      },
      inboxValidation: inboxResult,
    }
  } catch (error) {
    console.error("SMTP validation error:", error)
    // Fallback to smart validation only
    try {
      return await validateSmtpSmart(email)
    } catch (smartError) {
      // Last resort fallback
      return {
        passed: false,
        message: `SMTP validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        confidence: 0,
      }
    }
  }
}
