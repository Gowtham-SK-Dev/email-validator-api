import { promises as dns } from "dns"

interface ValidationResult {
  passed: boolean
  message: string
  records?: Array<{ exchange: string; priority: number }>
}

export async function validateMx(email: string): Promise<ValidationResult> {
  try {
    const domain = email.split("@")[1]

    if (!domain) {
      return {
        passed: false,
        message: "Invalid email format - no domain found",
      }
    }

    // Resolve MX records
    const mxRecords = await dns.resolveMx(domain)

    if (!mxRecords || mxRecords.length === 0) {
      return {
        passed: false,
        message: "No MX records found for domain",
      }
    }

    // Sort by priority (lower number = higher priority)
    const sortedRecords = mxRecords
      .sort((a, b) => a.priority - b.priority)
      .map((record) => ({
        exchange: record.exchange,
        priority: record.priority,
      }))

    return {
      passed: true,
      message: `Found ${mxRecords.length} MX record(s)`,
      records: sortedRecords,
    }
  } catch (error) {
    // Handle specific DNS errors
    if (error instanceof Error) {
      if (error.message.includes("ENOTFOUND")) {
        return {
          passed: false,
          message: "Domain does not exist",
        }
      }

      if (error.message.includes("ENODATA")) {
        return {
          passed: false,
          message: "No MX records found for domain",
        }
      }
    }

    return {
      passed: false,
      message: `DNS lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}
