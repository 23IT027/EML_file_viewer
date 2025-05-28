<template>
  <div class="container">
    <h1>📧 EML File Reader</h1>
    
    <!-- Upload Section -->
    <div v-if="!email" class="upload-section">
      <input 
        type="file" 
        id="file-input" 
        class="file-input"
        @change="handleFile" 
        accept=".eml" 
      />
      <label for="file-input" class="file-label">
        Choose EML File
      </label>
      <p style="margin-top: 1rem; color: #6c757d;">
        Select an .eml email file to view its contents
      </p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Parsing email...</p>
    </div>

    <!-- Error -->
    <div v-if="error" class="error">
      {{ error }}
    </div>

    <!-- Email Content -->
    <div v-if="email" class="email-content">
      <button @click="reset" class="reset-btn">← Upload New File</button>
      
      <!-- Email Headers -->
      <div class="email-header">
        <div class="header-item">
          <strong>From:</strong> {{ email.from }}
        </div>
        <div class="header-item" v-if="email.to">
          <strong>To:</strong> {{ email.to }}
        </div>
        <div class="header-item" v-if="email.cc">
          <strong>CC:</strong> {{ email.cc }}
        </div>
        <div class="header-item">
          <strong>Subject:</strong> {{ email.subject }}
        </div>
        <div class="header-item" v-if="email.date">
          <strong>Date:</strong> {{ email.date }}
        </div>
      </div>

      <!-- Email Body -->
      <div class="email-body-section">
        <h3>Message Content</h3>
        <div class="email-body">
          <div v-if="email.html" v-html="email.html"></div>
          <pre v-else-if="email.text">{{ email.text }}</pre>
          <div v-else class="no-content">
            <p>No message content available</p>
          </div>
        </div>
      </div>

      <!-- Attachments -->
      <div v-if="email.attachments.length" class="attachments">
        <h3>Attachments ({{ email.attachments.length }})</h3>
        <div class="attachment-list">
          <div 
            v-for="(attachment, index) in email.attachments" 
            :key="index"
            class="attachment-item"
          >
            <!-- Image Attachment -->
            <div v-if="isImage(attachment)" class="image-attachment">
              <img :src="getDataUrl(attachment)" :alt="attachment.name" />
              <div class="file-details">
                <div>{{ attachment.name }}</div>
                <div class="file-info">{{ formatFileSize(attachment.size) }}</div>
                <button @click="download(attachment)" class="download-btn">
                  Download
                </button>
              </div>
            </div>

            <!-- File Attachment -->
            <div v-else class="file-attachment">
              <div class="file-icon">{{ getFileIcon(attachment.name) }}</div>
              <div class="file-details">
                <div>{{ attachment.name }}</div>
                <div class="file-info">{{ formatFileSize(attachment.size) }}</div>
                <button @click="download(attachment)" class="download-btn">
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { EMLParser } from './eml-parser.js'
import { AttachmentHandler } from './attachment-handler.js'

const email = ref(null)
const loading = ref(false)
const error = ref('')

const handleFile = async (e) => {
  const file = e.target.files[0]
  if (!file) return
  
  loading.value = true
  error.value = ''
  
  try {
    const content = await file.text()
    email.value = EMLParser.parse(content)
  } catch (err) {
    error.value = 'Failed to parse email file'
    console.error(err)
  } finally {
    loading.value = false
  }
}

const reset = () => {
  email.value = null
  error.value = ''
  document.getElementById('file-input').value = ''
}

// Attachment methods
const isImage = (attachment) => AttachmentHandler.isImage(attachment)
const getDataUrl = (attachment) => AttachmentHandler.getDataUrl(attachment)
const download = (attachment) => AttachmentHandler.download(attachment)
const getFileIcon = (filename) => AttachmentHandler.getFileIcon(filename)
const formatFileSize = (bytes) => AttachmentHandler.formatFileSize(bytes)
</script>
