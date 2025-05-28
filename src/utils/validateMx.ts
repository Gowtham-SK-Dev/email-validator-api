import { promises as dns } from "dns"

interface MxRecordWithIp {
  exchange: string
  priority: number
  ipAddresses?: string[]
}

interface ValidationResult {
  passed: boolean
  message: string
  records?: MxRecordWithIp[]
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

    // For each MX record, resolve its IP addresses (A and AAAA)
    const recordsWithIp: MxRecordWithIp[] = await Promise.all(
      mxRecords.map(async (record) => {
        const exchange = record.exchange
        let ipAddresses: string[] = []
        try {
          const aRecords = await dns.resolve4(exchange)
          ipAddresses = ipAddresses.concat(aRecords)
        } catch {}
        try {
          const aaaaRecords = await dns.resolve6(exchange)
          ipAddresses = ipAddresses.concat(aaaaRecords)
        } catch {}
        return {
          exchange,
          priority: record.priority,
          ipAddresses,
        }
      })
    )

    // Sort by priority (lower number = higher priority)
    const sortedRecords = recordsWithIp.sort((a, b) => a.priority - b.priority)

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
