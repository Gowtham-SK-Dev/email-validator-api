// Simple test script to verify the API functionality
async function testEmailValidation() {
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"

  const testEmails = [
    "valid@gmail.com",
    "invalid-email",
    "admin@example.com",
    "test@10minutemail.com",
    "user@nonexistentdomain12345.com",
  ]

  console.log(`🧪 Testing Email Validator API at ${baseUrl}`)
  console.log("=".repeat(50))

  for (const email of testEmails) {
    try {
      console.log(`\n📧 Testing: ${email}`)

      const response = await fetch(`${baseUrl}/api/validate-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })

      const result = await response.json()

      console.log(`✅ Valid: ${result.valid}`)
      if (!result.valid) {
        // Find the first failed validation
        const failedValidation = Object.entries(result.results).find(
          ([_, validation]: [string, any]) => !validation.passed,
        )
        if (failedValidation) {
          console.log(`❌ Failed at: ${failedValidation[0]} - ${failedValidation[1].message}`)
        }
      }
    } catch (error) {
      console.log(`❌ Error testing ${email}:`, error)
    }
  }

  // Test health endpoint
  try {
    console.log("\n🏥 Testing health endpoint...")
    const healthResponse = await fetch(`${baseUrl}/health`)
    const healthResult = await healthResponse.json()
    console.log(`✅ Health check: ${healthResult.status}`)
  } catch (error) {
    console.log("❌ Health check failed:", error)
  }
}

// Run the test
testEmailValidation().catch(console.error)
