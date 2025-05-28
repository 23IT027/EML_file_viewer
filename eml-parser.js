// EML Parser Module
export class EMLParser {
  static parse(content) {
    const lines = content.split(/\r?\n/)
    const headers = {}
    let bodyStart = 0

    // Parse headers
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "") {
        bodyStart = i + 1
        break
      }
      const match = lines[i].match(/^([^:]+):\s*(.*)/)
      if (match) {
        headers[match[1].toLowerCase()] = match[2]
      }
    }

    const body = lines.slice(bodyStart).join("\n")
    const contentType = headers["content-type"] || ""

    let text = "",
      html = "",
      attachments = []

    if (contentType.includes("multipart")) {
      const result = this.parseMultipart(body, contentType)
      text = result.text
      html = result.html
      attachments = result.attachments
    } else {
      if (contentType.includes("text/html")) {
        html = body
      } else {
        text = body
      }
    }

    return {
      from: headers.from || "Unknown",
      to: headers.to || "",
      cc: headers.cc || "",
      subject: headers.subject || "No Subject",
      date: headers.date || "",
      text,
      html,
      attachments,
    }
  }

  static parseMultipart(body, contentType) {
    const boundary = contentType.match(/boundary=([^;]+)/)?.[1]?.replace(/"/g, "")
    if (!boundary) return { text: "", html: "", attachments: [] }

    const parts = body.split(`--${boundary}`)
    let text = "",
      html = "",
      attachments = []

    parts.forEach((part) => {
      if (!part.trim()) return

      const partLines = part.split(/\r?\n/)
      const partHeaders = {}
      let partBodyStart = 0

      // Parse part headers
      for (let i = 0; i < partLines.length; i++) {
        if (partLines[i].trim() === "") {
          partBodyStart = i + 1
          break
        }
        const match = partLines[i].match(/^([^:]+):\s*(.*)/)
        if (match) {
          partHeaders[match[1].toLowerCase()] = match[2]
        }
      }

      const partBody = partLines.slice(partBodyStart).join("\n")
      const partType = partHeaders["content-type"] || ""
      const disposition = partHeaders["content-disposition"] || ""

      if (disposition.includes("attachment") || disposition.includes("filename")) {
        const filename = disposition.match(/filename="?([^";\n]+)"?/)?.[1] || "attachment"
        attachments.push({
          name: filename,
          data: partBody.replace(/\s/g, ""),
          contentType: partType.split(";")[0],
          size: partBody.length,
        })
      } else if (partType.includes("text/html")) {
        html = partBody
      } else if (partType.includes("text/plain")) {
        text = partBody
      }
    })

    return { text, html, attachments }
  }
}
