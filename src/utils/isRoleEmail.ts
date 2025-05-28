interface ValidationResult {
  passed: boolean
  message: string
  matchedRole?: string
}

// Common role-based email prefixes
const roleBasedPrefixes = [
  "admin",
  "administrator",
  "info",
  "support",
  "help",
  "sales",
  "marketing",
  "contact",
  "service",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "postmaster",
  "webmaster",
  "hostmaster",
  "abuse",
  "security",
  "privacy",
  "legal",
  "billing",
  "accounts",
  "accounting",
  "finance",
  "hr",
  "humanresources",
  "jobs",
  "careers",
  "recruitment",
  "press",
  "media",
  "news",
  "newsletter",
  "notifications",
  "alerts",
  "system",
  "root",
  "daemon",
  "ftp",
  "mail",
  "email",
  "www",
  "web",
  "api",
  "dev",
  "developer",
  "test",
  "testing",
  "demo",
  "example",
  "sample",
]

export function isRoleEmail(email: string): ValidationResult {
  const localPart = email.split("@")[0]?.toLowerCase()

  if (!localPart) {
    return {
      passed: false,
      message: "Invalid email format - no local part found",
    }
  }

  // Check if the local part matches any role-based prefix
  for (const role of roleBasedPrefixes) {
    if (localPart === role || localPart.startsWith(role + ".") || localPart.startsWith(role + "+")) {
      return {
        passed: false,
        message: "Email appears to be role-based",
        matchedRole: role,
      }
    }
  }

  return {
    passed: true,
    message: "Not a role-based email",
  }
}
