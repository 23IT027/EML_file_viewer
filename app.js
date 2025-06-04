// Import necessary libraries
const pdfjsLib = window.pdfjsLib
const mammoth = window.mammoth
const JSZip = window.JSZip

// Configure PDF.js worker
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
}

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

// Enhanced Attachment Handler with advanced preview capabilities
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

  static createBlob(attachment) {
    try {
      const binaryString = atob(attachment.data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const mimeType = attachment.contentType || this.getMimeType(attachment.name)
      return new Blob([bytes], { type: mimeType })
    } catch (error) {
      console.error("Failed to create blob:", error)
      return null
    }
  }

  static getMimeType(filename) {
    const extension = this.getFileExtension(filename).toLowerCase()
    const mimeTypes = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      txt: "text/plain",
      html: "text/html",
      htm: "text/html",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
    }
    return mimeTypes[extension] || "application/octet-stream"
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

  static getPreviewType(attachment) {
    const extension = this.getFileExtension(attachment.name).toLowerCase()
    const contentType = attachment.contentType?.toLowerCase() || ""

    // PDF files
    if (extension === "pdf" || contentType === "application/pdf") {
      return "pdf"
    }

    // DOCX files
    if (extension === "docx" || contentType.includes("wordprocessingml")) {
      return "docx"
    }

    // PPTX files
    if (extension === "pptx" || contentType.includes("presentationml")) {
      return "pptx"
    }

    // Image files
    if (/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(attachment.name) || contentType.startsWith("image/")) {
      return "image"
    }

    // Text files
    if (/\.(txt|csv|log|md|json|xml|js|css)$/i.test(attachment.name) || contentType.startsWith("text/")) {
      return "text"
    }

    // HTML files
    if (/\.(html|htm)$/i.test(attachment.name) || contentType.includes("text/html")) {
      return "html"
    }

    // Audio files
    if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(attachment.name) || contentType.startsWith("audio/")) {
      return "audio"
    }

    // Video files
    if (/\.(mp4|webm|ogg|avi|mov)$/i.test(attachment.name) || contentType.startsWith("video/")) {
      return "video"
    }

    return "unsupported"
  }

  // PDF Preview using PDF.js
  static async previewPDF(attachment) {
    try {
      const blob = this.createBlob(attachment)
      if (!blob) throw new Error("Failed to create blob")

      const arrayBuffer = await blob.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      return {
        pdf: pdf,
        totalPages: pdf.numPages,
        currentPage: 1,
        scale: 1.0,
      }
    } catch (error) {
      console.error("PDF preview error:", error)
      throw new Error(`Failed to load PDF: ${error.message}`)
    }
  }

  // DOCX Preview using Mammoth.js
  static async previewDOCX(attachment) {
    try {
      const blob = this.createBlob(attachment)
      if (!blob) throw new Error("Failed to create blob")

      const arrayBuffer = await blob.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer })

      if (result.messages.length > 0) {
        console.warn("DOCX conversion warnings:", result.messages)
      }

      return result.value
    } catch (error) {
      console.error("DOCX preview error:", error)
      throw new Error(`Failed to load DOCX: ${error.message}`)
    }
  }

  // PPTX Preview (basic implementation)
  static async previewPPTX(attachment) {
    try {
      const blob = this.createBlob(attachment)
      if (!blob) throw new Error("Failed to create blob")

      const zip = await JSZip.loadAsync(blob)
      const slides = []

      // Get slide files
      const slideFiles = Object.keys(zip.files)
        .filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
        .sort()

      for (const slideFile of slideFiles) {
        try {
          const slideXml = await zip.files[slideFile].async("text")
          // Basic XML to HTML conversion (simplified)
          const slideHtml = this.convertSlideXmlToHtml(slideXml)
          slides.push(slideHtml)
        } catch (error) {
          console.warn(`Failed to process slide ${slideFile}:`, error)
          slides.push(`<div class="slide-error">Failed to load slide</div>`)
        }
      }

      if (slides.length === 0) {
        throw new Error("No slides found in presentation")
      }

      return slides
    } catch (error) {
      console.error("PPTX preview error:", error)
      throw new Error(`Failed to load PPTX: ${error.message}`)
    }
  }

  // Simple XML to HTML converter for PPTX slides
  static convertSlideXmlToHtml(xml) {
    try {
      // Extract text content from XML (very basic implementation)
      const textMatches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []
      const texts = textMatches
        .map((match) => {
          const textContent = match.replace(/<[^>]*>/g, "")
          return textContent.trim()
        })
        .filter((text) => text.length > 0)

      if (texts.length === 0) {
        return '<div class="slide-content"><p>No text content found in this slide</p></div>'
      }

      const htmlContent = texts.map((text) => `<p>${text}</p>`).join("")
      return `<div class="slide-content">${htmlContent}</div>`
    } catch (error) {
      console.error("XML conversion error:", error)
      return '<div class="slide-content"><p>Error processing slide content</p></div>'
    }
  }

  static async getPreviewContent(attachment) {
    const type = this.getPreviewType(attachment)

    switch (type) {
      case "pdf":
        return await this.previewPDF(attachment)

      case "docx":
        return await this.previewDOCX(attachment)

      case "pptx":
        return await this.previewPPTX(attachment)

      case "image":
        return this.getDataUrl(attachment)

      case "text":
        try {
          const decodedText = atob(attachment.data)
          return decodedText
        } catch (e) {
          throw new Error("Unable to decode text content")
        }

      case "html":
        try {
          const decodedHtml = atob(attachment.data)
          return decodedHtml
        } catch (e) {
          throw new Error("Unable to decode HTML content")
        }

      case "audio":
      case "video":
        return this.getDataUrl(attachment)

      default:
        return null
    }
  }
}

// Vue App
document.addEventListener("DOMContentLoaded", () => {
  const { createApp, ref, nextTick } = window.Vue

  createApp({
    setup() {
      const email = ref(null)
      const loading = ref(false)
      const error = ref("")
      const previewModal = ref({
        show: false,
        loading: false,
        attachment: null,
        type: null,
        content: null,
        currentFile: null,
        // PDF specific
        pdf: null,
        currentPage: 1,
        totalPages: 0,
        scale: 1.0,
        fullscreen: false,
        // PPTX specific
        slides: [],
        currentSlide: 0,
      })

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
          const parsed = EMLParser.parse(content)
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
        previewModal.value.show = false
        const fileInput = document.getElementById("file-input")
        if (fileInput) fileInput.value = ""
      }

      const previewAttachment = async (attachment) => {
        previewModal.value.loading = true
        previewModal.value.currentFile = attachment.name
        previewModal.value.show = true
        previewModal.value.attachment = attachment

        try {
          const type = AttachmentHandler.getPreviewType(attachment)
          previewModal.value.type = type

          const content = await AttachmentHandler.getPreviewContent(attachment)

          if (type === "pdf") {
            previewModal.value.pdf = content.pdf
            previewModal.value.currentPage = content.currentPage
            previewModal.value.totalPages = content.totalPages
            previewModal.value.scale = content.scale

            // Render first page
            await nextTick()
            await renderPDFPage()
          } else if (type === "pptx") {
            previewModal.value.slides = content
            previewModal.value.currentSlide = 0
          } else {
            previewModal.value.content = content
          }
        } catch (err) {
          console.error("Preview error:", err)
          previewModal.value.type = "error"
          previewModal.value.content = err.message
        } finally {
          previewModal.value.loading = false
          previewModal.value.currentFile = null
        }
      }

      const closePreview = () => {
        previewModal.value.show = false
        previewModal.value.fullscreen = false
        // Clean up PDF resources
        if (previewModal.value.pdf) {
          previewModal.value.pdf.destroy()
          previewModal.value.pdf = null
        }
      }

      // PDF Controls
      const renderPDFPage = async () => {
        if (!previewModal.value.pdf) return

        try {
          const page = await previewModal.value.pdf.getPage(previewModal.value.currentPage)
          const canvas = document.querySelector(".pdf-canvas")
          if (!canvas) return

          const context = canvas.getContext("2d")
          const viewport = page.getViewport({ scale: previewModal.value.scale })

          canvas.height = viewport.height
          canvas.width = viewport.width

          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise
        } catch (error) {
          console.error("Error rendering PDF page:", error)
        }
      }

      const previousPage = async () => {
        if (previewModal.value.currentPage > 1) {
          previewModal.value.currentPage--
          await renderPDFPage()
        }
      }

      const nextPage = async () => {
        if (previewModal.value.currentPage < previewModal.value.totalPages) {
          previewModal.value.currentPage++
          await renderPDFPage()
        }
      }

      const zoomIn = async () => {
        previewModal.value.scale = Math.min(previewModal.value.scale + 0.25, 3.0)
        await renderPDFPage()
      }

      const zoomOut = async () => {
        previewModal.value.scale = Math.max(previewModal.value.scale - 0.25, 0.5)
        await renderPDFPage()
      }

      const toggleFullscreen = () => {
        previewModal.value.fullscreen = !previewModal.value.fullscreen
      }

      // PPTX Controls
      const previousSlide = () => {
        if (previewModal.value.currentSlide > 0) {
          previewModal.value.currentSlide--
        }
      }

      const nextSlide = () => {
        if (previewModal.value.currentSlide < previewModal.value.slides.length - 1) {
          previewModal.value.currentSlide++
        }
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
        previewModal,
        handleFile,
        reset,
        previewAttachment,
        closePreview,
        previousPage,
        nextPage,
        zoomIn,
        zoomOut,
        toggleFullscreen,
        previousSlide,
        nextSlide,
        isImage,
        getDataUrl,
        download,
        getFileIcon,
        formatFileSize,
      }
    },
  }).mount("#app")
})
