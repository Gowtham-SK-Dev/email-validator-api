interface ValidationResult {
  passed: boolean
  message: string
}

export function validateSyntax(email: string): ValidationResult {
  // Strict email regex pattern
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

  if (!email || typeof email !== "string") {
    return {
      passed: false,
      message: "Email must be a non-empty string",
    }
  }

  // Check length constraints
  if (email.length > 254) {
    return {
      passed: false,
      message: "Email address is too long (max 254 characters)",
    }
  }

  // Check for basic structure
  if (!email.includes("@")) {
    return {
      passed: false,
      message: "Email must contain @ symbol",
    }
  }

  const parts = email.split("@")
  if (parts.length !== 2) {
    return {
      passed: false,
      message: "Email must contain exactly one @ symbol",
    }
  }

  const [localPart, domain] = parts

  // Check local part length
  if (localPart.length === 0 || localPart.length > 64) {
    return {
      passed: false,
      message: "Local part must be between 1 and 64 characters",
    }
  }

  // Check domain length
  if (domain.length === 0 || domain.length > 253) {
    return {
      passed: false,
      message: "Domain must be between 1 and 253 characters",
    }
  }

  // Test against regex
  if (!emailRegex.test(email)) {
    return {
      passed: false,
      message: "Invalid email format",
    }
  }

  // Additional checks for consecutive dots
  if (email.includes("..")) {
    return {
      passed: false,
      message: "Email cannot contain consecutive dots",
    }
  }

  // Check for leading/trailing dots in local part
  if (localPart.startsWith(".") || localPart.endsWith(".")) {
    return {
      passed: false,
      message: "Local part cannot start or end with a dot",
    }
  }

  return {
    passed: true,
    message: "Valid email syntax",
  }
}
