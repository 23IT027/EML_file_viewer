<template>
  <div class="eml-viewer">
    <h1>📧 EML Viewer</h1>
    
    <!-- Upload -->
    <div v-if="!email" class="upload">
      <input type="file" @change="handleFile" accept=".eml" />
      <p>Choose an EML file</p>
    </div>

    <!-- Email Display -->
    <div v-if="email" class="email">
      <button @click="reset" class="reset-btn">← New File</button>
      
      <div class="headers">
        <div><strong>From:</strong> {{ email.from }}</div>
        <div><strong>To:</strong> {{ email.to }}</div>
        <div><strong>Subject:</strong> {{ email.subject }}</div>
        <div><strong>Date:</strong> {{ email.date }}</div>
      </div>

      <div class="body">
        <div v-if="email.html" v-html="email.html"></div>
        <div v-else>{{ email.text }}</div>
      </div>

      <div v-if="email.attachments.length" class="attachments">
        <h3>Attachments ({{ email.attachments.length }})</h3>
        <div v-for="(att, i) in email.attachments" :key="i" class="attachment">
          <img v-if="isImage(att)" :src="getDataUrl(att)" class="img-preview" />
          <div class="att-info">
            <div>{{ att.name }}</div>
            <button @click="download(att)">Download</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading">Loading...</div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const email = ref(null)
const loading = ref(false)
const error = ref('')

const parseEml = (content) => {
  const lines = content.split(/\r?\n/)
  const headers = {}
  let bodyStart = 0
  
  // Parse headers
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      bodyStart = i + 1
      break
    }
    const match = lines[i].match(/^([^:]+):\s*(.*)/)
    if (match) {
      headers[match[1].toLowerCase()] = match[2]
    }
  }
  
  const body = lines.slice(bodyStart).join('\n')
  const contentType = headers['content-type'] || ''
  
  let text = '', html = '', attachments = []
  
  if (contentType.includes('multipart')) {
    const boundary = contentType.match(/boundary=([^;]+)/)?.[1]?.replace(/"/g, '')
    if (boundary) {
      const parts = body.split(`--${boundary}`)
      
      parts.forEach(part => {
        if (!part.trim()) return
        
        const partLines = part.split(/\r?\n/)
        const partHeaders = {}
        let partBodyStart = 0
        
        for (let i = 0; i < partLines.length; i++) {
          if (partLines[i].trim() === '') {
            partBodyStart = i + 1
            break
          }
          const match = partLines[i].match(/^([^:]+):\s*(.*)/)
          if (match) {
            partHeaders[match[1].toLowerCase()] = match[2]
          }
        }
        
        const partBody = partLines.slice(partBodyStart).join('\n')
        const partType = partHeaders['content-type'] || ''
        const disposition = partHeaders['content-disposition'] || ''
        
        if (disposition.includes('attachment') || disposition.includes('filename')) {
          const filename = disposition.match(/filename="?([^";\n]+)"?/)?.[1] || 'attachment'
          attachments.push({
            name: filename,
            data: partBody.replace(/\s/g, ''),
            contentType: partType.split(';')[0]
          })
        } else if (partType.includes('text/html')) {
          html = partBody
        } else if (partType.includes('text/plain')) {
          text = partBody
        }
      })
    }
  } else {
    if (contentType.includes('text/html')) {
      html = body
    } else {
      text = body
    }
  }
  
  return {
    from: headers.from || 'Unknown',
    to: headers.to || '',
    subject: headers.subject || 'No Subject',
    date: headers.date || '',
    text,
    html,
    attachments
  }
}

const handleFile = async (e) => {
  const file = e.target.files[0]
  if (!file) return
  
  loading.value = true
  error.value = ''
  
  try {
    const content = await file.text()
    email.value = parseEml(content)
  } catch (err) {
    error.value = 'Failed to parse email'
  } finally {
    loading.value = false
  }
}

const reset = () => {
  email.value = null
  error.value = ''
}

const isImage = (att) => {
  return /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(att.name)
}

const getDataUrl = (att) => {
  const mimeType = att.contentType || 'application/octet-stream'
  return `data:${mimeType};base64,${att.data}`
}

const download = (att) => {
  const url = getDataUrl(att)
  const a = document.createElement('a')
  a.href = url
  a.download = att.name
  a.click()
}
</script>

<style scoped>
.eml-viewer {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

h1 {
  text-align: center;
  color: #333;
}

.upload {
  text-align: center;
  padding: 40px;
  border: 2px dashed #ccc;
  border-radius: 8px;
  margin: 20px 0;
}

.upload input {
  margin-bottom: 10px;
}

.email {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.reset-btn {
  background: #666;
  color: white;
  border: none;
  padding: 8px 16px;
  margin: 10px;
  border-radius: 4px;
  cursor: pointer;
}

.headers {
  padding: 20px;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
}

.headers div {
  margin-bottom: 8px;
}

.body {
  padding: 20px;
  border-bottom: 1px solid #ddd;
  max-height: 400px;
  overflow-y: auto;
}

.attachments {
  padding: 20px;
}

.attachment {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 4px;
  margin-bottom: 10px;
}

.img-preview {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}

.att-info {
  flex: 1;
}

.att-info button {
  background: #007bff;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 5px;
}

.error {
  color: red;
  text-align: center;
  padding: 20px;
}
</style>
