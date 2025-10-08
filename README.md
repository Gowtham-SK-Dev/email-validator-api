# Email Validator API

A comprehensive real-time email validation API built with Node.js, TypeScript, and Express.js. This API performs multiple layers of validation to ensure email addresses are valid, deliverable, and not from disposable or role-based accounts.

## 🚀 Features

- **Syntax Validation**: Strict RFC-compliant email format checking
- **MX Record Verification**: DNS lookup to verify domain has mail servers
- **SMTP Mailbox Validation**: Real-time SMTP connection to verify mailbox exists
- **Disposable Domain Detection**: Blocks temporary/disposable email services
- **Role-Based Email Rejection**: Filters out generic role-based emails (admin@, info@, etc.)

## 📦 Installation

1. Clone the repository:
\`\`\`bash
git clone <repository-url>
cd email-validator-api
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Start the development server:
\`\`\`bash
npm run dev
\`\`\`

The API will be available at \`http://localhost:3000\`

## 🔧 Scripts

- \`npm run dev\` - Start development server with hot reload
- \`npm run build\` - Build TypeScript to JavaScript
- \`npm start\` - Start production server
- \`npm test\` - Run tests (placeholder)

## 📡 API Endpoints

### POST /api/validate-email

Validates an email address through all validation layers.

**Request Body:**
\`\`\`json
{
  "email": "example@gmail.com"
}
\`\`\`

**Response:**
\`\`\`json
{
  "email": "example@gmail.com",
  "valid": true,
  "results": {
    "syntax": {
      "passed": true,
      "message": "Valid email syntax"
    },
    "mx": {
      "passed": true,
      "records": [
        { "exchange": "alt1.gmail-smtp-in.l.google.com", "priority": 10 },
        { "exchange": "alt2.gmail-smtp-in.l.google.com", "priority": 20 }
      ],
      "message": "Found 2 MX record(s)"
    },
    "smtp": {
      "passed": true,
      "message": "SMTP mailbox exists",
      "smtpResponse": "250 2.1.5 OK"
    },
    "disposableDomain": {
      "passed": true,
      "message": "Domain is not disposable"
    },
    "roleBased": {
      "passed": true,
      "message": "Not a role-based email"
    }
  }
}
\`\`\`

### GET /health

Health check endpoint.

**Response:**
\`\`\`json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600
}
\`\`\`

## 🛡️ Validation Layers

### 1. Syntax Check
- RFC-compliant email format validation
- Length constraints (local part ≤ 64 chars, domain ≤ 253 chars)
- Special character handling
- Consecutive dot detection

### 2. MX Record Check
- DNS lookup for mail exchange records
- Verifies domain can receive emails
- Returns sorted MX records by priority

### 3. SMTP Mailbox Validation
- Establishes TCP connection to mail server (port 25)
- Performs SMTP handshake (HELO, MAIL FROM, RCPT TO)
- Handles timeouts and error responses gracefully
- 10-second timeout for connections

### 4. Disposable Domain Detection
- Checks against a comprehensive list of disposable email providers
- Blocks temporary email services like 10minutemail, guerrillamail, etc.
- Regularly updated domain list

### 5. Role-Based Email Rejection
- Filters out generic role-based emails
- Blocks common prefixes: admin, info, support, noreply, etc.
- Prevents automated/generic account registrations

## 🔧 Configuration

### Environment Variables

- \`PORT\` - Server port (default: 3000)

### Disposable Domains

The disposable domains list is stored in \`src/data/disposable-domains.json\`. You can update this file with additional domains as needed.

### Role-Based Prefixes

Role-based email prefixes are defined in \`src/utils/isRoleEmail.ts\`. You can modify the \`roleBasedPrefixes\` array to add or remove prefixes.

## 🚨 Error Handling

The API includes comprehensive error handling:

- Input validation errors (400)
- DNS resolution failures
- SMTP connection timeouts
- Server errors (500)

All errors are logged and return appropriate HTTP status codes with descriptive messages.

## 🔒 Security Considerations

- SMTP connections have timeouts to prevent hanging
- Graceful handling of unresponsive mail servers
- Input sanitization and validation
- No sensitive data logging

## 📊 Performance

- Pipeline validation (stops at first failure)
- Efficient DNS caching
- Connection pooling for SMTP
- Minimal memory footprint

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🐛 Known Limitations

- SMTP validation may fail for servers with strict anti-spam measures
- Some mail servers may not respond to SMTP probes
- Rate limiting may be needed for production use
- IPv6 support not implemented

## 🔮 Future Enhancements

- Rate limiting and API key authentication
- Bulk email validation endpoint
- Webhook notifications
- Email reputation scoring
- IPv6 support
- Caching layer for repeated validations
\`\`\`

Payload - Gowtham

{
    "email":"nija123maran@gmail.com",
    "tests": { 
        "smtp": true, 
        "mx": false, 
        "disposableDomain": false, 
        "roleBased": false
        }
}