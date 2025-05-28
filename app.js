// EML Parser
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

// Attachment Handler
class AttachmentHandler {
  static isImage(attachment) {
    if (!attachment.name) return false
    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(attachment.name)
  }

  static getDataUrl(attachment) {
    if (!attachment.data) return ""

    // Determine MIME type
    const extension = this.getFileExtension(attachment.name).toLowerCase()
    const mimeTypes = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      bmp: "image/bmp",
      webp: "image/webp",
      svg: "image/svg+xml",
    }

    const mimeType = attachment.contentType || mimeTypes[extension] || "application/octet-stream"

    // Ensure data is base64
    let base64Data = attachment.data
    if (typeof attachment.data === "string") {
      // Check if it's already base64
      try {
        atob(attachment.data)
        base64Data = attachment.data
      } catch {
        // Convert string to base64
        base64Data = btoa(attachment.data)
      }
    }

    return `data:${mimeType};base64,${base64Data}`
  }

  static download(attachment) {
    if (!attachment.data) return

    try {
      const dataUrl = this.getDataUrl(attachment)
      const a = document.createElement("a")
      a.href = dataUrl
      a.download = attachment.name || "attachment"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error("Download failed:", err)
      alert("Failed to download attachment")
    }
  }

  static getFileIcon(filename) {
    const ext = this.getFileExtension(filename).toLowerCase()
    const icons = {
      pdf: "📕",
      doc: "📘",
      docx: "📘",
      xls: "📗",
      xlsx: "📗",
      ppt: "📙",
      pptx: "📙",
      txt: "📄",
      zip: "🗜️",
      rar: "🗜️",
      mp3: "🎵",
      mp4: "🎬",
      avi: "🎬",
      jpg: "🖼️",
      jpeg: "🖼️",
      png: "🖼️",
      gif: "🖼️",
    }
    return icons[ext] || "📎"
  }

  static getFileExtension(filename) {
    if (!filename) return ""
    const parts = filename.split(".")
    return parts.length > 1 ? parts.pop() : ""
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }
}

// Vue App
document.addEventListener("DOMContentLoaded", () => {
  const { createApp, ref } = window.Vue

  createApp({
    setup() {
      const email = ref(null)
      const loading = ref(false)
      const error = ref("")

      const handleFile = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        if (!file.name.toLowerCase().endsWith(".eml")) {
          error.value = "Please select a valid .eml file"
          return
        }

        loading.value = true
        error.value = ""

        try {
          const content = await file.text()
          console.log("Raw EML content length:", content.length)

          const parsed = EMLParser.parse(content)
          console.log("Parsed email:", parsed)
          console.log("Attachments found:", parsed.attachments.length)

          email.value = parsed
        } catch (err) {
          console.error("Error parsing email:", err)
          error.value = `Failed to parse email file: ${err.message}`
        } finally {
          loading.value = false
        }
      }

      const reset = () => {
        email.value = null
        error.value = ""
        const fileInput = document.getElementById("file-input")
        if (fileInput) fileInput.value = ""
      }

      // Attachment methods
      const isImage = (attachment) => AttachmentHandler.isImage(attachment)
      const getDataUrl = (attachment) => AttachmentHandler.getDataUrl(attachment)
      const download = (attachment) => AttachmentHandler.download(attachment)
      const getFileIcon = (filename) => AttachmentHandler.getFileIcon(filename)
      const formatFileSize = (bytes) => AttachmentHandler.formatFileSize(bytes)

      return {
        email,
        loading,
        error,
        handleFile,
        reset,
        isImage,
        getDataUrl,
        download,
        getFileIcon,
        formatFileSize,
      }
    },
  }).mount("#app")
})
