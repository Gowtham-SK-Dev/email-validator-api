import { promises as dns } from "dns"
import { testGoogleSigninWithRetry } from "./googleSigninTest"

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

  // Early exit if local part is clearly invalid
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

  // 6. Google Sign-in existence check (ONLY for Gmail) - Using the fixed version
  let googleSigninResult: { status: string; message: string } | null = null
  if (domain.toLowerCase() === "gmail.com") {
    console.log(`🔐 Starting Google sign-in test for Gmail address: ${email}`)

    try {
      // Use the improved retry function with Chrome fix
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

  // Apply Google sign-in results with improved logic
  if (googleSigninResult) {
    console.log(`🔐 Applying Google sign-in result: ${googleSigninResult.status}`)

    switch (googleSigninResult.status) {
      case "success":
        // Gmail account exists and is valid - OVERRIDE to success
        passed = true
        message = `✅ Gmail account verified: ${googleSigninResult.message}`
        console.log(`🔐 ✅ Gmail verification SUCCESS - overriding to PASSED`)
        break

      case "error":
        // Gmail account doesn't exist or has issues - OVERRIDE to failure
        passed = false
        message = `❌ Gmail verification failed: ${googleSigninResult.message}`
        console.log(`🔐 ❌ Gmail verification FAILED - overriding to FAILED`)
        break

      case "technical_error":
        // Technical issue, don't override but append info
        message += ` | Gmail check failed: ${googleSigninResult.message}`
        console.log(`🔐 🔧 Gmail verification technical error - keeping original result`)
        break

      case "unknown":
        // This should rarely happen with the improved code
        message += ` | Gmail check inconclusive: ${googleSigninResult.message}`
        console.log(`🔐 ❓ Gmail verification unknown - keeping original result`)
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

// Keep all your existing helper functions unchanged
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
    analysis.pattern = "gibberish"
    analysis.isRealistic = false
    analysis.score = -40
    analysis.invalidReason = gibberishCheck.reason
    return analysis
  }

  // Check for obviously invalid patterns first
  if (/^[a-z]{25,}$/i.test(localPart)) {
    analysis.pattern = "very_long_string"
    analysis.score = -35
    analysis.invalidReason = "Local part extremely long without separators"
    return analysis
  }

  if (/^(.)\1{6,}$/.test(localPart)) {
    analysis.pattern = "repeated_characters"
    analysis.score = -35
    analysis.invalidReason = "Excessive repeated characters"
    return analysis
  }

  // Check for keyboard patterns
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

  // Check for legitimate patterns
  if (/^[a-z]+\.[a-z]+$/i.test(localPart)) {
    const parts = localPart.split(".")
    const firstName = parts[0]
    const lastName = parts[1]

    if (looksLikeRealName(firstName) && looksLikeRealName(lastName)) {
      analysis.pattern = "firstname.lastname"
      analysis.isRealistic = true
      analysis.score += 30
    } else {
      analysis.pattern = "possible_international_names"
      analysis.score += 10
      analysis.invalidReason = null
    }
  } else if (/^[a-z]+[a-z0-9]*$/i.test(localPart) && localPart.length >= 3 && localPart.length <= 20) {
    if (looksLikeRealName(localPart)) {
      analysis.pattern = "name_with_numbers"
      analysis.isRealistic = true
      analysis.score += 20
    } else {
      analysis.pattern = "possible_name"
      analysis.score += 5
    }
  } else if (/^[a-z]+[._-][a-z]+$/i.test(localPart)) {
    const parts = localPart.split(/[._-]/)
    if (parts.every((part) => looksLikeRealName(part))) {
      analysis.pattern = "name_separator_name"
      analysis.isRealistic = true
      analysis.score += 25
    } else {
      analysis.pattern = "possible_separated_names"
      analysis.score += 8
    }
  }

  // Length scoring
  if (analysis.length >= 3 && analysis.length <= 25) {
    analysis.score += 10
  } else if (analysis.length > 25 || analysis.length < 2) {
    analysis.score -= 10
  }

  return analysis
}

function detectGibberish(text: string): { isGibberish: boolean; reason: string; confidence: number } {
  const lowerText = text.toLowerCase()
  let suspicionScore = 0
  const maxSuspicion = 100

  const vowels = (lowerText.match(/[aeiou]/g) || []).length
  const consonants = (lowerText.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length
  const vowelRatio = vowels / (vowels + consonants)

  if (text.length > 8 && (vowelRatio < 0.1 || vowelRatio > 0.8)) {
    suspicionScore += 30
  } else if (text.length > 6 && (vowelRatio < 0.05 || vowelRatio > 0.85)) {
    suspicionScore += 20
  }

  const consonantClusters = lowerText.match(/[bcdfghjklmnpqrstvwxyz]{5,}/g)
  if (consonantClusters && consonantClusters.length > 0) {
    suspicionScore += 25
  }

  if (/(.{3,})\1{2,}/.test(lowerText)) {
    suspicionScore += 40
  }

  if (/^(.)(.)\1\2\1\2\1\2/.test(lowerText) && text.length > 8) {
    suspicionScore += 35
  }

  const obviousRandomPatterns = [/[xz]{3,}/i, /[qw]{4,}/i, /[bcdfghjklmnpqrstvwxyz]{8,}/i]

  for (const pattern of obviousRandomPatterns) {
    if (pattern.test(lowerText)) {
      suspicionScore += 30
      break
    }
  }

  if (text.length > 10) {
    const entropy = calculateEntropy(lowerText)
    if (entropy > 4.0) {
      suspicionScore += 25
    }
  }

  const internationalPatterns = [
    /^[a-z]+[aeiou][a-z]*$/i,
    /^[a-z]*[aeiou]{2}[a-z]*$/i,
    /^[a-z]*dh[a-z]*$/i,
    /^[a-z]*th[a-z]*$/i,
    /^[a-z]*sh[a-z]*$/i,
    /^[a-z]*ch[a-z]*$/i,
  ]

  for (const pattern of internationalPatterns) {
    if (pattern.test(lowerText)) {
      suspicionScore -= 15
      break
    }
  }

  const confidence = suspicionScore / maxSuspicion

  return {
    isGibberish: confidence > 0.8,
    reason: confidence > 0.8 ? "Multiple suspicious patterns detected" : "",
    confidence,
  }
}

function looksLikeRealName(name: string): boolean {
  if (name.length < 2 || name.length > 20) return false

  const lowerName = name.toLowerCase()

  const namePatterns = [/^[a-z]{2,15}$/, /^[a-z]{2,12}[0-9]{1,3}$/, /^[a-z]*[aeiou][a-z]*$/]

  const matchesPattern = namePatterns.some((pattern) => pattern.test(lowerName))
  if (!matchesPattern) return false

  const vowels = (lowerName.match(/[aeiou]/g) || []).length
  const vowelRatio = vowels / lowerName.length
  if (vowelRatio < 0.15 || vowelRatio > 0.7) return false

  const internationalPatterns = [
    /dh/,
    /th/,
    /sh/,
    /ch/,
    /kh/,
    /gh/,
    /ng/,
    /ny/,
    /mb/,
    /nd/,
    /sz/,
    /cz/,
    /rz/,
    /ll/,
    /rr/,
    /nn/,
  ]

  const hasInternationalPattern = internationalPatterns.some((pattern) => pattern.test(lowerName))

  const commonEndings = ["er", "ed", "ly", "son", "ton", "man", "ing", "an", "en", "el", "al"]
  const hasCommonEnding = commonEndings.some((ending) => lowerName.endsWith(ending))

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

  return (
    hasCommonEnding ||
    hasCommonBeginning ||
    hasInternationalPattern ||
    (lowerName.length <= 8 && vowelRatio >= 0.2) ||
    (lowerName.length <= 12 && vowelRatio >= 0.25)
  )
}

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

function calculateConfidenceScore(analyses: {
  domainAnalysis: AnalysisResult
  localPartAnalysis: AnalysisResult
  mxAnalysis: AnalysisResult
  patternAnalysis: AnalysisResult
  reputationAnalysis: AnalysisResult
}): number {
  const weights = {
    domainAnalysis: 0.25,
    localPartAnalysis: 0.3,
    mxAnalysis: 0.3,
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
