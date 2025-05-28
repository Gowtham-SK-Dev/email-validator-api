import * as fs from "fs/promises"
import * as path from "path"

interface ValidationResult {
  passed: boolean
  message: string
  matchedDomain?: string
}

let disposableDomains: Set<string> | null = null

async function loadDisposableDomains(): Promise<Set<string>> {
  if (disposableDomains) {
    return disposableDomains
  }

  try {
    const filePath = path.join(__dirname, "../data/disposable-domains.json")
    const data = await fs.readFile(filePath, "utf-8")
    const domains = JSON.parse(data)

    if (Array.isArray(domains)) {
      disposableDomains = new Set(domains.map((domain) => domain.toLowerCase()))
    } else {
      console.warn("Disposable domains file is not an array, using empty set")
      disposableDomains = new Set()
    }

    return disposableDomains
  } catch (error) {
    console.warn("Could not load disposable domains file, using empty set:", error)
    disposableDomains = new Set()
    return disposableDomains
  }
}

export async function isDisposableDomain(email: string): Promise<ValidationResult> {
  try {
    const domain = email.split("@")[1]?.toLowerCase()

    if (!domain) {
      return {
        passed: false,
        message: "Invalid email format - no domain found",
      }
    }

    const disposableSet = await loadDisposableDomains()

    if (disposableSet.has(domain)) {
      return {
        passed: false,
        message: "Email domain is disposable/temporary",
        matchedDomain: domain,
      }
    }

    return {
      passed: true,
      message: "Domain is not disposable",
    }
  } catch (error) {
    console.error("Error checking disposable domain:", error)
    return {
      passed: true, // Fail open - don't block if we can't check
      message: "Could not verify disposable domain status",
    }
  }
}
