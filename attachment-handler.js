// Enhanced Attachment Handler Module with Advanced Preview Capabilities
const pdfjsLib = require("pdfjs-dist") // Import pdfjsLib
const mammoth = require("mammoth") // Import mammoth
const JSZip = require("jszip") // Import JSZip

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

// Export for module usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = { AttachmentHandler }
}
