import { promises as dns } from "dns"
import { testGoogleSignin } from "./googleSigninTest"

interface ValidationResult {
  passed: boolean
  message: string
  smtpResponse?: string
  confidence?: number // 0-100 confidence score
  details?: any
}

interface SmartValidationCache {
  [domain: string]: {
    result: ValidationResult
    timestamp: number
    ttl: number
  }
}

interface AnalysisResult {
  score: number
  maxScore: number
  [key: string]: any
}

// In-memory cache for domain validation results
const validationCache: SmartValidationCache = {}

export async function validateSmtpSmart(email: string): Promise<ValidationResult> {
  const domain = email.split("@")[1]
  const localPart = email.split("@")[0]

  // Check cache first with proper TTL validation
  const cachedResult = getCachedResult(domain)
  if (cachedResult) {
    // Re-analyze local part even for cached domains since local parts can vary
    const localPartAnalysis = analyzeLocalPart(localPart)

    // If local part is clearly invalid, override cached result
    if (localPartAnalysis.score < -30) {
      // More lenient threshold
      return {
        passed: false,
        message: `Invalid email - ${localPartAnalysis.invalidReason || "Local part appears invalid"}`,
        confidence: Math.max(0, 30 - Math.abs(localPartAnalysis.score)),
        details: { localPartAnalysis },
      }
    }

    return {
      ...cachedResult,
      message: `${cachedResult.message} (cached)`,
    }
  }

  try {
    // Multi-layer smart validation
    const result = await performSmartValidation(email, domain, localPart)

    // Cache the result with TTL (only cache domain-level analysis)
    setCachedResult(domain, result)

    return result
  } catch (error) {
    return {
      passed: false,
      message: `Smart SMTP validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      confidence: 0,
    }
  }
}

async function performSmartValidation(email: string, domain: string, localPart: string): Promise<ValidationResult> {
  console.log(`🔍 Starting smart validation for: ${email}`)

  // 1. Local Part Intelligence (check first - most likely to fail)
  const localPartAnalysis = analyzeLocalPart(localPart)
  console.log(`📝 Local part analysis score: ${localPartAnalysis.score}`)

  // Early exit if local part is clearly invalid (more lenient threshold)
  if (localPartAnalysis.score < -30) {
    console.log(`❌ Early exit - local part invalid: ${localPartAnalysis.invalidReason}`)
    return {
      passed: false,
      message: `Invalid email - ${localPartAnalysis.invalidReason || "Local part appears invalid"}`,
      confidence: Math.max(0, 30 - Math.abs(localPartAnalysis.score)),
      details: { localPartAnalysis },
    }
  }

  // 2. Domain Intelligence Analysis
  const domainAnalysis = await analyzeDomain(domain)
  console.log(`🌐 Domain analysis score: ${domainAnalysis.score}`)

  // 3. MX Record Deep Analysis
  const mxAnalysis = await analyzeMxRecords(domain)
  console.log(`📧 MX analysis score: ${mxAnalysis.score}`)

  // 4. Pattern Recognition
  const patternAnalysis = analyzeEmailPatterns(email)
  console.log(`🔍 Pattern analysis score: ${patternAnalysis.score}`)

  // 5. Reputation Check
  const reputationAnalysis = await checkDomainReputation(domain)
  console.log(`🛡️ Reputation analysis score: ${reputationAnalysis.score}`)

  // 6. Google Sign-in existence check (IMPROVED)
  let googleSigninResult: { status: string; message: string } | null = null
  if (domain.toLowerCase() === "gmail.com") {
    console.log(`🔐 Starting Google sign-in test for Gmail address: ${email}`)

    try {
      // Use the improved retry function with better error handling
      googleSigninResult = await testGoogleSigninWithRetry(email, 2)
      console.log(`🔐 Google sign-in result:`, googleSigninResult)

      // Validate the result structure
      if (!googleSigninResult || typeof googleSigninResult.status !== "string") {
        throw new Error("Invalid response structure from Google sign-in test")
      }
    } catch (error) {
      console.error(`🔐 Google sign-in test failed with error:`, error)
      googleSigninResult = {
        status: "technical_error",
        message: `Google sign-in check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  // Calculate confidence score with proper normalization
  const confidence = calculateConfidenceScore({
    domainAnalysis,
    localPartAnalysis,
    mxAnalysis,
    patternAnalysis,
    reputationAnalysis,
  })
  console.log(`📊 Calculated confidence score: ${confidence}%`)

  // Make final decision based on confidence threshold
  let passed = confidence >= 60
  let message = generateSmartMessage(passed, confidence, {
    domainAnalysis,
    localPartAnalysis,
    mxAnalysis,
    patternAnalysis,
    reputationAnalysis,
  })

  console.log(`📋 Initial validation result: ${passed ? "PASSED" : "FAILED"} - ${message}`)

  // IMPROVED: Apply Google sign-in results with better logic
  if (googleSigninResult) {
    console.log(`🔐 Applying Google sign-in result: ${googleSigninResult.status}`)

    switch (googleSigninResult.status) {
      case "success":
        // Gmail account exists and is valid
        passed = true
        message = `✅ Gmail account verified: ${googleSigninResult.message}`
        console.log(`🔐 ✅ Gmail verification SUCCESS - overriding to PASSED`)
        break

      case "error":
        // Gmail account doesn't exist or has issues
        const errorMsg = googleSigninResult.message.toLowerCase()

        // Check if it's a definitive "account doesn't exist" error
        if (
          errorMsg.includes("couldn't find") ||
          errorMsg.includes("doesn't exist") ||
          errorMsg.includes("not found") ||
          errorMsg.includes("invalid") ||
          errorMsg.includes("incorrect") ||
          errorMsg.includes("enter a valid email") ||
          errorMsg.includes("try again")
        ) {
          passed = false
          message = `❌ Gmail verification failed: ${googleSigninResult.message}`
          console.log(`🔐 ❌ Gmail verification FAILED - overriding to FAILED`)
        } else {
          // Ambiguous error, don't override but append info
          message += ` | Gmail check: ${googleSigninResult.message}`
          console.log(`🔐 ⚠️ Gmail verification ambiguous error - keeping original result`)
        }
        break

      case "unknown":
        // Couldn't determine, append info but don't override
        message += ` | Gmail check: ${googleSigninResult.message}`
        console.log(`🔐 ❓ Gmail verification unknown - keeping original result`)
        break

      case "technical_error":
        // Technical issue, append info but don't override validation result
        message += ` | Gmail check failed: ${googleSigninResult.message}`
        console.log(`🔐 🔧 Gmail verification technical error - keeping original result`)
        break

      default:
        // Unexpected status, log and append
        console.warn(`🔐 ⚠️ Unexpected Google sign-in status: ${googleSigninResult.status}`)
        message += ` | Gmail check: ${googleSigninResult.message}`
        break
    }
  }

  const finalResult = {
    passed,
    message,
    confidence,
    details: {
      domainAnalysis,
      localPartAnalysis,
      mxAnalysis,
      patternAnalysis,
      reputationAnalysis,
      googleSigninResult,
    },
  }

  console.log(`🏁 Final validation result for ${email}: ${passed ? "PASSED" : "FAILED"} - ${message}`)
  return finalResult
}

// Enhanced Google sign-in test with retry logic
async function testGoogleSigninWithRetry(email: string, maxRetries = 2): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email} (max retries: ${maxRetries})`)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔐 Attempt ${attempt}/${maxRetries} for email: ${email}`)

    try {
      const result = await testGoogleSignin(email)
      console.log(`🔐 Attempt ${attempt} result:`, result)

      // If we get a clear success or error, return it
      if (result.status === "success" || result.status === "error") {
        console.log(`🔐 Definitive result on attempt ${attempt}: ${result.status}`)
        return result
      }

      // If unknown and we have retries left, try again
      if (result.status === "unknown" && attempt < maxRetries) {
        console.log(`🔐 Attempt ${attempt} returned unknown, retrying in 2 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        continue
      }

      // Last attempt or non-retryable result
      console.log(`🔐 Final attempt ${attempt} result: ${result.status}`)
      return result
    } catch (error) {
      console.error(`🔐 Attempt ${attempt} failed with error:`, error)

      if (attempt < maxRetries) {
        console.log(`🔐 Retrying after error in 3 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        continue
      }

      // Last attempt failed
      return {
        status: "technical_error",
        message: `All ${maxRetries} attempts failed. Last error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  return { status: "technical_error", message: "Max retries exceeded" }
}

// Enhanced Local Part Intelligence with culturally aware validation
function analyzeLocalPart(localPart: string): AnalysisResult {
  const analysis: AnalysisResult = {
    length: localPart.length,
    hasNumbers: /\d/.test(localPart),
    hasSpecialChars: /[._-]/.test(localPart),
    pattern: "unknown",
    isRealistic: false,
    score: 0,
    maxScore: 40,
    invalidReason: null,
  }

  // More lenient gibberish detection
  const gibberishCheck = detectGibberish(localPart)
  if (gibberishCheck.isGibberish && gibberishCheck.confidence > 0.8) {
    // Only flag as gibberish if we're very confident
    analysis.pattern = "gibberish"
    analysis.isRealistic = false
    analysis.score = -40 // Less harsh penalty
    analysis.invalidReason = gibberishCheck.reason
    return analysis
  }

  // Check for obviously invalid patterns first
  if (/^[a-z]{25,}$/i.test(localPart)) {
    // Increased threshold from 15 to 25
    analysis.pattern = "very_long_string"
    analysis.score = -35
    analysis.invalidReason = "Local part extremely long without separators"
    return analysis
  }

  if (/^(.)\1{6,}$/.test(localPart)) {
    // Increased threshold from 4 to 6
    analysis.pattern = "repeated_characters"
    analysis.score = -35
    analysis.invalidReason = "Excessive repeated characters"
    return analysis
  }

  // Check for keyboard patterns (more specific)
  const keyboardPatterns = [
    { pattern: /qwertyuiop/i, name: "keyboard_qwerty" },
    { pattern: /asdfghjkl/i, name: "keyboard_asdf" },
    { pattern: /zxcvbnm/i, name: "keyboard_zxcv" },
    { pattern: /1234567890/, name: "sequential_numbers" },
    { pattern: /abcdefghij/i, name: "sequential_letters" },
  ]

  for (const { pattern, name } of keyboardPatterns) {
    if (pattern.test(localPart)) {
      analysis.pattern = name
      analysis.score = -30
      analysis.invalidReason = "Keyboard pattern detected"
      return analysis
    }
  }

  // Now check for legitimate patterns
  if (/^[a-z]+\.[a-z]+$/i.test(localPart)) {
    // Additional validation for firstname.lastname pattern
    const parts = localPart.split(".")
    const firstName = parts[0]
    const lastName = parts[1]

    // More lenient name validation
    if (looksLikeRealName(firstName) && looksLikeRealName(lastName)) {
      analysis.pattern = "firstname.lastname"
      analysis.isRealistic = true
      analysis.score += 30
    } else {
      // Don't immediately fail - could be international names
      analysis.pattern = "possible_international_names"
      analysis.score += 10 // Give some benefit of doubt
      analysis.invalidReason = null // Don't mark as invalid
    }
  } else if (/^[a-z]+[a-z0-9]*$/i.test(localPart) && localPart.length >= 3 && localPart.length <= 20) {
    if (looksLikeRealName(localPart)) {
      analysis.pattern = "name_with_numbers"
      analysis.isRealistic = true
      analysis.score += 20
    } else {
      analysis.pattern = "possible_name"
      analysis.score += 5 // More lenient
    }
  } else if (/^[a-z]+[._-][a-z]+$/i.test(localPart)) {
    const parts = localPart.split(/[._-]/)
    if (parts.every((part) => looksLikeRealName(part))) {
      analysis.pattern = "name_separator_name"
      analysis.isRealistic = true
      analysis.score += 25
    } else {
      analysis.pattern = "possible_separated_names"
      analysis.score += 8 // More lenient
    }
  }

  // Length scoring (more lenient)
  if (analysis.length >= 3 && analysis.length <= 25) {
    // Increased upper limit
    analysis.score += 10
  } else if (analysis.length > 25 || analysis.length < 2) {
    analysis.score -= 10 // Less harsh penalty
  }

  return analysis
}

// More culturally aware gibberish detection
function detectGibberish(text: string): { isGibberish: boolean; reason: string; confidence: number } {
  const lowerText = text.toLowerCase()
  let suspicionScore = 0
  const maxSuspicion = 100

  // 1. Check consonant/vowel ratio (more lenient for international names)
  const vowels = (lowerText.match(/[aeiou]/g) || []).length
  const consonants = (lowerText.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length
  const vowelRatio = vowels / (vowels + consonants)

  // More lenient vowel ratio for international names
  if (text.length > 8 && (vowelRatio < 0.1 || vowelRatio > 0.8)) {
    suspicionScore += 30
  } else if (text.length > 6 && (vowelRatio < 0.05 || vowelRatio > 0.85)) {
    suspicionScore += 20
  }

  // 2. Check for excessive consonant clusters (more lenient)
  const consonantClusters = lowerText.match(/[bcdfghjklmnpqrstvwxyz]{5,}/g)
  if (consonantClusters && consonantClusters.length > 0) {
    suspicionScore += 25
  }

  // 3. Check for repeated character patterns
  if (/(.{3,})\1{2,}/.test(lowerText)) {
    suspicionScore += 40
  }

  // 4. Check for alternating character patterns (more specific)
  if (/^(.)(.)\1\2\1\2\1\2/.test(lowerText) && text.length > 8) {
    suspicionScore += 35
  }

  // 5. Check for obvious random patterns (more specific)
  const obviousRandomPatterns = [
    /[xz]{3,}/i, // Multiple x's or z's
    /[qw]{4,}/i, // Multiple q's or w's
    /[bcdfghjklmnpqrstvwxyz]{8,}/i, // Very long consonant sequences
  ]

  for (const pattern of obviousRandomPatterns) {
    if (pattern.test(lowerText)) {
      suspicionScore += 30
      break
    }
  }

  // 6. Check entropy (more lenient threshold)
  if (text.length > 10) {
    const entropy = calculateEntropy(lowerText)
    if (entropy > 4.0) {
      // Increased threshold from 3.5 to 4.0
      suspicionScore += 25
    }
  }

  // 7. Check for common international name patterns (bonus points)
  const internationalPatterns = [
    /^[a-z]+[aeiou][a-z]*$/i, // Ends with vowel (common in many languages)
    /^[a-z]*[aeiou]{2}[a-z]*$/i, // Contains double vowels
    /^[a-z]*dh[a-z]*$/i, // Contains 'dh' (common in Indian names)
    /^[a-z]*th[a-z]*$/i, // Contains 'th' (common in Indian names)
    /^[a-z]*sh[a-z]*$/i, // Contains 'sh' (common in many languages)
    /^[a-z]*ch[a-z]*$/i, // Contains 'ch' (common in many languages)
  ]

  for (const pattern of internationalPatterns) {
    if (pattern.test(lowerText)) {
      suspicionScore -= 15 // Reduce suspicion for international patterns
      break
    }
  }

  const confidence = suspicionScore / maxSuspicion

  return {
    isGibberish: confidence > 0.8, // Higher threshold
    reason: confidence > 0.8 ? "Multiple suspicious patterns detected" : "",
    confidence,
  }
}

// More inclusive real name validation
function looksLikeRealName(name: string): boolean {
  if (name.length < 2 || name.length > 20) return false // Increased upper limit

  const lowerName = name.toLowerCase()

  // More inclusive name patterns
  const namePatterns = [
    /^[a-z]{2,15}$/, // Simple names (increased length)
    /^[a-z]{2,12}[0-9]{1,3}$/, // Names with numbers
    /^[a-z]*[aeiou][a-z]*$/, // Must contain at least one vowel
  ]

  // Must match at least one pattern
  const matchesPattern = namePatterns.some((pattern) => pattern.test(lowerName))
  if (!matchesPattern) return false

  // More lenient vowel distribution
  const vowels = (lowerName.match(/[aeiou]/g) || []).length
  const vowelRatio = vowels / lowerName.length
  if (vowelRatio < 0.15 || vowelRatio > 0.7) return false // More lenient range

  // Check for common international name patterns
  const internationalPatterns = [
    /dh/,
    /th/,
    /sh/,
    /ch/,
    /kh/,
    /gh/, // Indian/Arabic patterns
    /ng/,
    /ny/,
    /mb/,
    /nd/, // African patterns
    /sz/,
    /cz/,
    /rz/, // Eastern European patterns
    /ll/,
    /rr/,
    /nn/, // Spanish/Italian patterns
  ]

  const hasInternationalPattern = internationalPatterns.some((pattern) => pattern.test(lowerName))

  // Check for common English name patterns
  const commonEndings = ["er", "ed", "ly", "son", "ton", "man", "ing", "an", "en", "el", "al"]
  const hasCommonEnding = commonEndings.some((ending) => lowerName.endsWith(ending))

  // Check for common name beginnings
  const commonBeginnings = [
    "john",
    "mike",
    "dave",
    "tom",
    "bob",
    "jim",
    "sam",
    "alex",
    "chris",
    "matt",
    "raj",
    "ram",
    "krishna",
    "gowtham",
    "kumar",
    "priya",
    "deepa",
  ]
  const hasCommonBeginning = commonBeginnings.some((beginning) => lowerName.startsWith(beginning))

  // More inclusive criteria
  return (
    hasCommonEnding ||
    hasCommonBeginning ||
    hasInternationalPattern ||
    (lowerName.length <= 8 && vowelRatio >= 0.2) ||
    (lowerName.length <= 12 && vowelRatio >= 0.25)
  )
}

// Calculate entropy of a string (same as before)
function calculateEntropy(str: string): number {
  const freq: { [key: string]: number } = {}

  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1
  }

  let entropy = 0
  const len = str.length

  for (const count of Object.values(freq)) {
    const p = count / len
    entropy -= p * Math.log2(p)
  }

  return entropy
}

// Domain Intelligence Analysis - Same as before
async function analyzeDomain(domain: string): Promise<AnalysisResult> {
  const analysis: AnalysisResult = {
    isKnownProvider: false,
    providerType: "unknown",
    domainAge: "unknown",
    hasWebsite: false,
    tlsSupport: false,
    score: 0,
    maxScore: 50,
  }

  const knownProviders = {
    consumer: ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com"],
    business: ["google.com", "microsoft.com", "office365.com"],
    hosting: ["godaddy.com", "bluehost.com", "hostgator.com"],
  }

  for (const [type, providers] of Object.entries(knownProviders)) {
    if (providers.includes(domain.toLowerCase())) {
      analysis.isKnownProvider = true
      analysis.providerType = type
      analysis.score += type === "consumer" ? 30 : type === "business" ? 25 : 15
      break
    }
  }

  try {
    await dns.resolve4(domain)
    analysis.hasWebsite = true
    analysis.score += 10
  } catch {
    analysis.score -= 5
  }

  try {
    await dns.resolve6(domain)
    analysis.score += 5
  } catch {
    // No IPv6 support
  }

  analysis.score = Math.min(analysis.score, analysis.maxScore)
  return analysis
}

// MX Record Deep Analysis - Same as before
async function analyzeMxRecords(domain: string): Promise<AnalysisResult> {
  const analysis: AnalysisResult = {
    recordCount: 0,
    hasBackup: false,
    providerDetected: "unknown",
    prioritySetup: "unknown",
    score: 0,
    maxScore: 45,
  }

  try {
    const mxRecords = await dns.resolveMx(domain)

    if (!mxRecords || mxRecords.length === 0) {
      analysis.score = -50
      return analysis
    }

    analysis.recordCount = mxRecords.length
    analysis.hasBackup = mxRecords.length > 1

    const exchanges = mxRecords.map((r) => r.exchange.toLowerCase())

    if (exchanges.some((ex) => ex.includes("google.com") || ex.includes("googlemail.com"))) {
      analysis.providerDetected = "google_workspace"
      analysis.score += 30
    } else if (exchanges.some((ex) => ex.includes("outlook.com") || ex.includes("office365.com"))) {
      analysis.providerDetected = "microsoft_365"
      analysis.score += 30
    } else if (exchanges.some((ex) => ex.includes("zoho.com"))) {
      analysis.providerDetected = "zoho"
      analysis.score += 25
    } else if (exchanges.some((ex) => ex.includes(domain))) {
      analysis.providerDetected = "self_hosted"
      analysis.score += 15
    } else {
      analysis.providerDetected = "unknown_provider"
      analysis.score += 5
    }

    const priorities = mxRecords.map((r) => r.priority).sort((a, b) => a - b)
    if (priorities[0] <= 10) {
      analysis.prioritySetup = "proper"
      analysis.score += 10
    }

    if (analysis.hasBackup) {
      analysis.score += 5
    }

    analysis.score = Math.min(analysis.score, analysis.maxScore)
  } catch (error) {
    analysis.score = -50
  }

  return analysis
}

// Pattern Recognition - Same as before
function analyzeEmailPatterns(email: string): AnalysisResult {
  const analysis: AnalysisResult = {
    isCommonPattern: false,
    suspiciousPattern: false,
    score: 0,
    maxScore: 25,
  }

  const legitimatePatterns = [
    /^[a-z]+\.[a-z]+@[a-z]+\.[a-z]{2,}$/i,
    /^[a-z]+@[a-z]+\.[a-z]{2,}$/i,
    /^[a-z]+[0-9]{1,3}@[a-z]+\.[a-z]{2,}$/i,
  ]

  for (const pattern of legitimatePatterns) {
    if (pattern.test(email)) {
      analysis.isCommonPattern = true
      analysis.score += 15
      break
    }
  }

  const suspiciousPatterns = [/^[a-z]{20,}@/i, /^[0-9]+@/i, /^[a-z]*test[a-z]*@/i, /^[a-z]*fake[a-z]*@/i]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(email)) {
      analysis.suspiciousPattern = true
      analysis.score -= 20
      break
    }
  }

  analysis.score = Math.max(Math.min(analysis.score, analysis.maxScore), -30)
  return analysis
}

// Domain Reputation Check - Same as before
async function checkDomainReputation(domain: string): Promise<AnalysisResult> {
  const analysis: AnalysisResult = {
    hasSpfRecord: false,
    hasDmarcRecord: false,
    hasDkimRecord: false,
    score: 0,
    maxScore: 30,
  }

  try {
    const txtRecords = await dns.resolveTxt(domain)
    for (const record of txtRecords) {
      const recordString = record.join("")
      if (recordString.includes("v=spf1")) {
        analysis.hasSpfRecord = true
        analysis.score += 10
      }
      if (recordString.includes("v=DMARC1")) {
        analysis.hasDmarcRecord = true
        analysis.score += 10
      }
    }

    try {
      await dns.resolveTxt(`default._domainkey.${domain}`)
      analysis.hasDkimRecord = true
      analysis.score += 10
    } catch {
      // DKIM not found
    }
  } catch (error) {
    analysis.score = 0
  }

  return analysis
}

// Confidence calculation with adjusted weights
function calculateConfidenceScore(analyses: {
  domainAnalysis: AnalysisResult
  localPartAnalysis: AnalysisResult
  mxAnalysis: AnalysisResult
  patternAnalysis: AnalysisResult
  reputationAnalysis: AnalysisResult
}): number {
  const weights = {
    domainAnalysis: 0.25,
    localPartAnalysis: 0.3, // Reduced from 0.4
    mxAnalysis: 0.3, // Increased from 0.25
    patternAnalysis: 0.1,
    reputationAnalysis: 0.05,
  }

  let weightedScore = 0
  let totalWeight = 0

  for (const [key, weight] of Object.entries(weights)) {
    const analysis = analyses[key as keyof typeof analyses]
    if (analysis && typeof analysis.score === "number" && typeof analysis.maxScore === "number") {
      const normalizedScore = Math.max(0, Math.min(100, ((analysis.score + 50) / (analysis.maxScore + 50)) * 100))
      weightedScore += normalizedScore * weight
      totalWeight += weight
    }
  }

  const confidence = totalWeight > 0 ? weightedScore / totalWeight : 0
  return Math.round(Math.max(0, Math.min(100, confidence)))
}

// Enhanced smart message generator - Same as before
function generateSmartMessage(
  passed: boolean,
  confidence: number,
  analyses: {
    domainAnalysis: AnalysisResult
    localPartAnalysis: AnalysisResult
    mxAnalysis: AnalysisResult
    patternAnalysis: AnalysisResult
    reputationAnalysis: AnalysisResult
  },
): string {
  let reason = ""

  if (!passed) {
    if (analyses.localPartAnalysis.invalidReason) {
      reason = ` - ${analyses.localPartAnalysis.invalidReason}`
    } else if (analyses.mxAnalysis.score < 0) {
      reason = " - No MX records found"
    } else if (analyses.patternAnalysis.suspiciousPattern) {
      reason = " - Suspicious email pattern detected"
    } else if (analyses.domainAnalysis.score < 0) {
      reason = " - Domain appears unreliable"
    } else {
      reason = " - Multiple validation concerns"
    }
  } else {
    if (analyses.domainAnalysis.isKnownProvider) {
      reason = " - Known email provider"
    } else if (analyses.mxAnalysis.providerDetected !== "unknown") {
      reason = " - Business email provider detected"
    } else {
      reason = " - Proper email configuration detected"
    }
  }

  if (passed) {
    if (confidence >= 90) {
      return `High confidence valid email (${confidence}%)${reason}`
    } else if (confidence >= 80) {
      return `Likely valid email (${confidence}%)${reason}`
    } else {
      return `Probably valid email (${confidence}%)${reason}`
    }
  } else {
    if (confidence <= 30) {
      return `High confidence invalid email (${confidence}%)${reason}`
    } else if (confidence <= 50) {
      return `Likely invalid email (${confidence}%)${reason}`
    } else {
      return `Possibly invalid email (${confidence}%)${reason}`
    }
  }
}

// Cache management - Same as before
function getCachedResult(domain: string): ValidationResult | null {
  const cached = validationCache[domain]
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.result
  }

  if (cached) {
    delete validationCache[domain]
  }

  return null
}

function setCachedResult(domain: string, result: ValidationResult): void {
  validationCache[domain] = {
    result,
    timestamp: Date.now(),
    ttl: 3600000,
  }
}

export function cleanupExpiredCache(): void {
  const now = Date.now()
  for (const [domain, cached] of Object.entries(validationCache)) {
    if (now - cached.timestamp >= cached.ttl) {
      delete validationCache[domain]
    }
  }
}
