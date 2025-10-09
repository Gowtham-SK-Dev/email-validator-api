import disposableDomainsList from "../data/disposable-domains.json"

interface ValidationResult {
  passed: boolean
  message: string
  matchedDomain?: string
}

let disposableDomains: Set<string> | null = null

function loadDisposableDomainsSync(): Set<string> {
  if (disposableDomains) return disposableDomains
  const arr = Array.isArray(disposableDomainsList) ? disposableDomainsList : []
  disposableDomains = new Set(arr.map((d: unknown) => String(d).toLowerCase()))
  return disposableDomains
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

    const disposableSet = loadDisposableDomainsSync()

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
