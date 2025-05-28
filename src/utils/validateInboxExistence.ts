import * as net from "net"
import { promises as dns } from "dns"

interface InboxValidationResult {
  passed: boolean
  message: string
  smtpResponse?: string
  confidence: number
  method: string
}

export async function validateInboxExistence(email: string): Promise<InboxValidationResult> {
  const domain = email.split("@")[1]

  // Check if we're in a serverless environment
  const isServerless = !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTIONS_WORKER ||
    process.env.NETLIFY ||
    process.env.RAILWAY_ENVIRONMENT
  )

  if (isServerless) {
    // In serverless environments, use heuristic validation
    return await validateInboxHeuristic(email, domain)
  } else {
    // In server environments, try real SMTP validation first
    try {
      const realSmtpResult = await validateInboxRealSMTP(email, domain)
      if (realSmtpResult.confidence > 70) {
        return realSmtpResult
      }
      // If SMTP fails or is inconclusive, fallback to heuristic
      const heuristicResult = await validateInboxHeuristic(email, domain)
      return {
        ...heuristicResult,
        message: `${heuristicResult.message} (SMTP inconclusive, using heuristic)`,
        method: "hybrid",
      }
    } catch (error) {
      // Fallback to heuristic if SMTP completely fails
      return await validateInboxHeuristic(email, domain)
    }
  }
}

// Real SMTP validation - works best on dedicated servers
async function validateInboxRealSMTP(email: string, domain: string): Promise<InboxValidationResult> {
  try {
    // Get MX records
    const mxRecords = await dns.resolveMx(domain)
    if (!mxRecords || mxRecords.length === 0) {
      return {
        passed: false,
        message: "No MX records found - domain cannot receive emails",
        confidence: 95,
        method: "smtp",
      }
    }

    // Sort by priority and try the highest priority server
    const sortedMx = mxRecords.sort((a, b) => a.priority - b.priority)
    const primaryMx = sortedMx[0].exchange

    return new Promise((resolve) => {
      const socket = new net.Socket()
      let response = ""
      let step = 0
      const timeout = 10000 // 10 seconds

      const cleanup = () => {
        socket.removeAllListeners()
        socket.destroy()
      }

      const handleTimeout = () => {
        cleanup()
        resolve({
          passed: false,
          message: "SMTP connection timeout - server may be blocking validation attempts",
          confidence: 30,
          method: "smtp",
        })
      }

      const timer = setTimeout(handleTimeout, timeout)

      socket.on("connect", () => {
        console.log(`Connected to ${primaryMx}:25`)
      })

      socket.on("data", (data) => {
        response += data.toString()
        const lines = response.split("\r\n")

        for (const line of lines) {
          if (!line) continue

          const code = Number.parseInt(line.substring(0, 3))
          console.log(`SMTP Response: ${line}`)

          if (step === 0 && code === 220) {
            // Server greeting received, send HELO
            step = 1
            socket.write("HELO emailvalidator.local\r\n")
          } else if (step === 1 && code === 250) {
            // HELO accepted, send MAIL FROM
            step = 2
            socket.write("MAIL FROM:<validator@emailvalidator.local>\r\n")
          } else if (step === 2 && code === 250) {
            // MAIL FROM accepted, send RCPT TO
            step = 3
            socket.write(`RCPT TO:<${email}>\r\n`)
          } else if (step === 3) {
            // RCPT TO response - this tells us if the mailbox exists
            clearTimeout(timer)
            cleanup()

            if (code === 250) {
              resolve({
                passed: true,
                message: "Mailbox exists and can receive emails",
                smtpResponse: line,
                confidence: 95,
                method: "smtp",
              })
            } else if (code === 550) {
              resolve({
                passed: false,
                message: "Mailbox does not exist",
                smtpResponse: line,
                confidence: 90,
                method: "smtp",
              })
            } else if (code === 551 || code === 553) {
              resolve({
                passed: false,
                message: "Mailbox rejected or does not exist",
                smtpResponse: line,
                confidence: 85,
                method: "smtp",
              })
            } else if (code === 450 || code === 451 || code === 452) {
              resolve({
                passed: false,
                message: "Temporary failure - mailbox may exist but server is busy",
                smtpResponse: line,
                confidence: 40,
                method: "smtp",
              })
            } else if (code === 421) {
              resolve({
                passed: false,
                message: "Service not available - server is blocking validation",
                smtpResponse: line,
                confidence: 20,
                method: "smtp",
              })
            } else {
              resolve({
                passed: false,
                message: `Mailbox validation inconclusive (SMTP code: ${code})`,
                smtpResponse: line,
                confidence: 30,
                method: "smtp",
              })
            }
            return
          } else if (code >= 400) {
            // Error response
            clearTimeout(timer)
            cleanup()
            resolve({
              passed: false,
              message: `SMTP error during validation: ${line}`,
              smtpResponse: line,
              confidence: 60,
              method: "smtp",
            })
            return
          }
        }
      })

      socket.on("error", (error) => {
        clearTimeout(timer)
        cleanup()
        resolve({
          passed: false,
          message: `SMTP connection failed: ${error.message}`,
          confidence: 20,
          method: "smtp",
        })
      })

      socket.on("close", () => {
        clearTimeout(timer)
        cleanup()
        if (step < 3) {
          resolve({
            passed: false,
            message: "SMTP connection closed before mailbox validation",
            confidence: 25,
            method: "smtp",
          })
        }
      })

      // Connect to SMTP server on port 25
      console.log(`Attempting SMTP connection to ${primaryMx}:25`)
      socket.connect(25, primaryMx)
    })
  } catch (error) {
    return {
      passed: false,
      message: `SMTP validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      confidence: 10,
      method: "smtp",
    }
  }
}

// Heuristic validation - works in serverless environments
async function validateInboxHeuristic(email: string, domain: string): Promise<InboxValidationResult> {
  try {
    const localPart = email.split("@")[0]

    // Get MX records
    const mxRecords = await dns.resolveMx(domain)
    if (!mxRecords || mxRecords.length === 0) {
      return {
        passed: false,
        message: "No MX records found - domain cannot receive emails",
        confidence: 95,
        method: "heuristic",
      }
    }

    // Analyze the email provider and local part
    const providerAnalysis = analyzeEmailProvider(domain, mxRecords)
    const localPartAnalysis = analyzeLocalPartForInbox(localPart)

    // Calculate confidence based on provider and local part analysis
    let confidence = 50 // Base confidence

    // Provider-based confidence adjustments
    if (providerAnalysis.isKnownProvider) {
      confidence += 30
    } else if (providerAnalysis.isBusinessProvider) {
      confidence += 20
    } else if (providerAnalysis.hasProperMxSetup) {
      confidence += 15
    }

    // Local part confidence adjustments
    if (localPartAnalysis.looksRealistic) {
      confidence += 15
    } else if (localPartAnalysis.isObviouslyFake) {
      confidence -= 30
    }

    // Domain reputation adjustments
    const reputationBonus = await checkDomainReputation(domain)
    confidence += reputationBonus

    // Final confidence capping
    confidence = Math.max(0, Math.min(100, confidence))

    const passed = confidence >= 70

    return {
      passed,
      message: generateHeuristicMessage(passed, confidence, providerAnalysis, localPartAnalysis),
      confidence,
      method: "heuristic",
    }
  } catch (error) {
    return {
      passed: false,
      message: `Heuristic validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      confidence: 10,
      method: "heuristic",
    }
  }
}

// Analyze email provider characteristics
function analyzeEmailProvider(domain: string, mxRecords: any[]): any {
  const analysis = {
    isKnownProvider: false,
    isBusinessProvider: false,
    hasProperMxSetup: false,
    providerType: "unknown",
  }

  const lowerDomain = domain.toLowerCase()
  const exchanges = mxRecords.map((r) => r.exchange.toLowerCase())

  // Known consumer providers
  const knownConsumerProviders = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "aol.com",
    "icloud.com",
    "me.com",
    "mac.com",
  ]

  if (knownConsumerProviders.includes(lowerDomain)) {
    analysis.isKnownProvider = true
    analysis.providerType = "consumer"
    return analysis
  }

  // Business email providers
  if (exchanges.some((ex) => ex.includes("google.com") || ex.includes("googlemail.com"))) {
    analysis.isBusinessProvider = true
    analysis.providerType = "google_workspace"
  } else if (exchanges.some((ex) => ex.includes("outlook.com") || ex.includes("office365.com"))) {
    analysis.isBusinessProvider = true
    analysis.providerType = "microsoft_365"
  } else if (exchanges.some((ex) => ex.includes("zoho.com"))) {
    analysis.isBusinessProvider = true
    analysis.providerType = "zoho"
  }

  // Check for proper MX setup
  if (mxRecords.length > 1) {
    analysis.hasProperMxSetup = true
  }

  return analysis
}

// Analyze local part for inbox likelihood
function analyzeLocalPartForInbox(localPart: string): any {
  const analysis = {
    looksRealistic: false,
    isObviouslyFake: false,
    pattern: "unknown",
  }

  // Check for realistic patterns
  if (/^[a-z]+\.[a-z]+$/i.test(localPart)) {
    analysis.pattern = "firstname.lastname"
    analysis.looksRealistic = true
  } else if (/^[a-z]+[0-9]{1,3}$/i.test(localPart)) {
    analysis.pattern = "name_with_numbers"
    analysis.looksRealistic = true
  } else if (/^[a-z]+[._-][a-z]+$/i.test(localPart)) {
    analysis.pattern = "name_with_separator"
    analysis.looksRealistic = true
  }

  // Check for obviously fake patterns
  if (/^[a-z]{15,}$/i.test(localPart)) {
    analysis.isObviouslyFake = true
    analysis.pattern = "very_long_string"
  } else if (/^(.)\1{5,}$/.test(localPart)) {
    analysis.isObviouslyFake = true
    analysis.pattern = "repeated_characters"
  } else if (/^(test|fake|dummy|sample|example)\d*$/i.test(localPart)) {
    analysis.isObviouslyFake = true
    analysis.pattern = "test_account"
  }

  return analysis
}

// Check domain reputation for inbox likelihood
async function checkDomainReputation(domain: string): Promise<number> {
  let reputationScore = 0

  try {
    // Check for SPF record
    const txtRecords = await dns.resolveTxt(domain)
    for (const record of txtRecords) {
      const recordString = record.join("")
      if (recordString.includes("v=spf1")) {
        reputationScore += 5
      }
      if (recordString.includes("v=DMARC1")) {
        reputationScore += 5
      }
    }

    // Check if domain has a website
    try {
      await dns.resolve4(domain)
      reputationScore += 5
    } catch {
      // No website
    }
  } catch (error) {
    // DNS lookup failed
  }

  return Math.min(reputationScore, 15) // Cap at 15 points
}

// Generate heuristic message
function generateHeuristicMessage(
  passed: boolean,
  confidence: number,
  providerAnalysis: any,
  localPartAnalysis: any,
): string {
  if (passed) {
    if (providerAnalysis.isKnownProvider) {
      return `Inbox likely exists (${confidence}%) - Known email provider`
    } else if (providerAnalysis.isBusinessProvider) {
      return `Inbox likely exists (${confidence}%) - Business email provider`
    } else {
      return `Inbox probably exists (${confidence}%) - Proper email configuration`
    }
  } else {
    if (localPartAnalysis.isObviouslyFake) {
      return `Inbox unlikely to exist (${confidence}%) - Local part appears fake`
    } else {
      return `Inbox existence uncertain (${confidence}%) - Cannot verify mailbox`
    }
  }
}
