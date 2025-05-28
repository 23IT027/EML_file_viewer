// Attachment Handler Module
export class AttachmentHandler {
  static isImage(attachment) {
    return /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(attachment.name)
  }

  static getDataUrl(attachment) {
    const mimeType = attachment.contentType || "application/octet-stream"
    return `data:${mimeType};base64,${attachment.data}`
  }

  static download(attachment) {
    const url = this.getDataUrl(attachment)
    const a = document.createElement("a")
    a.href = url
    a.download = attachment.name
    a.click()
  }

  static getFileIcon(filename) {
    const ext = filename.split(".").pop()?.toLowerCase()
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
    }
    return icons[ext] || "📎"
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }
}
