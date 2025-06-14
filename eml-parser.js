// Enhanced EML Parser Module with Advanced Parsing Capabilities
class EMLParser {
  static parse(content) {
    const lines = content.split(/\r?\n/)
    const headers = {}
    let bodyStart = 0
    let currentHeader = ""

    // Parse headers with multi-line support
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.trim() === "") {
        bodyStart = i + 1
        break
      }

      if (line.match(/^[A-Za-z-]+:/)) {
        // New header
        const colonIndex = line.indexOf(":")
        const key = line.substring(0, colonIndex).toLowerCase().trim()
        const value = line.substring(colonIndex + 1).trim()
        headers[key] = value
        currentHeader = key
      } else if (line.match(/^\s+/) && currentHeader) {
        // Continuation of previous header
        headers[currentHeader] += " " + line.trim()
      }
    }

    const body = lines.slice(bodyStart).join("\n")
    const contentType = headers["content-type"] || ""

    let text = "",
      html = "",
      attachments = []

    if (contentType.toLowerCase().includes("multipart")) {
      const result = this.parseMultipart(body, contentType)
      text = result.text
      html = result.html
      attachments = result.attachments
    } else {
      // Single part message
      const encoding = headers["content-transfer-encoding"] || ""
      const decodedBody = this.decodeContent(body, encoding)

      if (contentType.toLowerCase().includes("text/html")) {
        html = decodedBody
      } else {
        text = decodedBody
      }
    }

    return {
      from: this.cleanEmailAddress(headers.from) || "Unknown",
      to: this.cleanEmailAddress(headers.to) || "",
      cc: this.cleanEmailAddress(headers.cc) || "",
      subject: this.decodeHeaderValue(headers.subject) || "No Subject",
      date: headers.date || "",
      text,
      html,
      attachments: this.filterValidAttachments(attachments),
    }
  }

  // Filter out invalid or empty attachments
  static filterValidAttachments(attachments) {
    return attachments.filter((attachment) => {
      // Filter out attachments with generic names and small sizes (likely not real attachments)
      if (attachment.name.toLowerCase() === "attachment" && attachment.size < 500) {
        return false
      }

      // Filter out empty attachments
      if (!attachment.data || attachment.data.length === 0) {
        return false
      }

      // Filter out attachments with no name
      if (!attachment.name || attachment.name.trim() === "") {
        return false
      }

      return true
    })
  }

  static parseMultipart(body, contentType) {
    const boundaryMatch = contentType.match(/boundary=([^;\s]+)/i)
    if (!boundaryMatch) return { text: "", html: "", attachments: [] }

    const boundary = boundaryMatch[1].replace(/['"]/g, "")

    // Split by boundary
    const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"))

    let text = "",
      html = "",
      attachments = []

    parts.forEach((part) => {
      part = part.trim()
      if (!part || part === "--" || part.startsWith("--")) return

      const partResult = this.parseMimePart(part)
      if (partResult) {
        if (partResult.isAttachment) {
          // Only add if it has a valid filename and isn't empty
          if (partResult.name && partResult.name !== "attachment" && partResult.data && partResult.data.length > 0) {
            attachments.push(partResult)
          }
        } else if (partResult.contentType?.toLowerCase().includes("text/html")) {
          html = partResult.content
        } else if (partResult.contentType?.toLowerCase().includes("text/plain")) {
          text = partResult.content
        }
      }
    })

    return { text, html, attachments }
  }

  static parseMimePart(partContent) {
    const lines = partContent.split("\n")
    const partHeaders = {}
    let partBodyStart = 0
    let currentHeader = ""

    // Parse part headers
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (line === "") {
        partBodyStart = i + 1
        break
      }

      if (line.match(/^[A-Za-z-]+:/)) {
        const colonIndex = line.indexOf(":")
        const key = line.substring(0, colonIndex).toLowerCase().trim()
        const value = line.substring(colonIndex + 1).trim()
        partHeaders[key] = value
        currentHeader = key
      } else if (line.match(/^\s+/) && currentHeader) {
        partHeaders[currentHeader] += " " + line.trim()
      }
    }

    const partBody = lines.slice(partBodyStart).join("\n").trim()
    const contentType = partHeaders["content-type"] || ""
    const contentDisposition = partHeaders["content-disposition"] || ""
    const contentTransferEncoding = partHeaders["content-transfer-encoding"] || ""

    // Check if it's an attachment
    const isAttachment =
      contentDisposition.toLowerCase().includes("attachment") ||
      (contentDisposition.toLowerCase().includes("filename") && !contentDisposition.toLowerCase().includes("inline")) ||
      (contentType && !contentType.toLowerCase().includes("text/") && contentType.toLowerCase().includes("name="))

    if (isAttachment) {
      // Extract filename
      let filename = ""
      const filenameMatch = contentDisposition.match(/filename[*]?=([^;]+)/i) || contentType.match(/name[*]?=([^;]+)/i)

      if (filenameMatch) {
        filename = filenameMatch[1].replace(/['"]/g, "").trim()
        // Handle encoded filenames
        if (filename.includes("UTF-8")) {
          const parts = filename.split("''")
          if (parts.length > 1) {
            filename = decodeURIComponent(parts[1])
          }
        }
      }

      // Skip if no filename or generic "attachment" with small size
      if (!filename || filename === "attachment") {
        if (partBody.length < 500) {
          return null
        }
      }

      // Decode attachment data
      let decodedData = partBody
      if (contentTransferEncoding.toLowerCase() === "base64") {
        decodedData = partBody.replace(/\s/g, "")
      } else if (contentTransferEncoding.toLowerCase() === "quoted-printable") {
        decodedData = this.decodeQuotedPrintable(partBody)
        decodedData = btoa(decodedData) // Convert to base64 for consistency
      }

      return {
        name: filename || "attachment",
        contentType: contentType.split(";")[0].trim(),
        data: decodedData,
        size: decodedData.length,
        isAttachment: true,
      }
    } else {
      // Text content
      const decodedContent = this.decodeContent(partBody, contentTransferEncoding)
      return {
        content: decodedContent,
        contentType: contentType.split(";")[0].trim(),
        isAttachment: false,
      }
    }
  }

  // Decode content based on transfer encoding
  static decodeContent(content, encoding) {
    if (!encoding) return content

    const enc = encoding.toLowerCase()
    if (enc === "base64") {
      try {
        return atob(content.replace(/\s/g, ""))
      } catch (e) {
        console.warn("Failed to decode base64 content:", e)
        return content
      }
    } else if (enc === "quoted-printable") {
      return this.decodeQuotedPrintable(content)
    }

    return content
  }

  // Decode quoted-printable encoding
  static decodeQuotedPrintable(str) {
    return str
      .replace(/=\r?\n/g, "") // Remove soft line breaks
      .replace(/=([0-9A-F]{2})/gi, (match, hex) => {
        return String.fromCharCode(Number.parseInt(hex, 16))
      })
  }

  // Clean and decode email addresses
  static cleanEmailAddress(address) {
    if (!address) return ""

    // Handle encoded headers
    address = this.decodeHeaderValue(address)

    // Extract multiple addresses
    if (address.includes(",")) {
      return address
        .split(",")
        .map((addr) => addr.trim())
        .join(", ")
    }

    return address.trim()
  }

  // Decode RFC 2047 encoded headers
  static decodeHeaderValue(value) {
    if (!value) return ""

    // Handle RFC 2047 encoded words: =?charset?encoding?encoded-text?=
    return value.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (match, charset, encoding, encodedText) => {
      try {
        if (encoding.toUpperCase() === "B") {
          // Base64
          return atob(encodedText)
        } else if (encoding.toUpperCase() === "Q") {
          // Quoted-printable
          return this.decodeQuotedPrintable(encodedText.replace(/_/g, " "))
        }
      } catch (e) {
        console.warn("Failed to decode header:", e)
      }
      return match
    })
  }
}

// Export for module usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = { EMLParser }
}
