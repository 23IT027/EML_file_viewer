const { createApp } = Vue;

// Wait for the DOM and all scripts to load
window.addEventListener('load', () => {
    createApp({
        data() {
            return {
                email: null,
                error: null,
                isLibraryLoaded: false,
                loading: false
            }
        },
        mounted() {
            // Check if EMLFormat is available
            this.isLibraryLoaded = typeof EMLFormat !== 'undefined';
            if (!this.isLibraryLoaded) {
                this.error = 'EMLFormat library is not loaded. Please refresh the page.';
            }
        },
        methods: {
            async handleFileUpload(event) {
                if (!this.isLibraryLoaded) {
                    this.error = 'EMLFormat library is not loaded. Please refresh the page.';
                    return;
                }

                const file = event.target.files[0];
                if (!file) {
                    this.error = 'No file selected';
                    return;
                }

                if (!file.name.toLowerCase().endsWith('.eml')) {
                    this.error = 'Please select a valid .eml file';
                    return;
                }

                try {
                    this.loading = true;
                    this.error = null;
                    const content = await this.readFile(file);
                    console.log('File content read successfully, length:', content.length);
                    
                    const parsedEmail = await this.parseEml(content);
                    console.log('Email parsed successfully:', parsedEmail);
                    
                    this.email = parsedEmail;
                } catch (error) {
                    console.error('Error processing EML file:', error);
                    this.error = 'Error processing EML file: ' + error.message;
                } finally {
                    this.loading = false;
                }
            },

            readFile(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        console.log('File read complete');
                        resolve(e.target.result);
                    };
                    reader.onerror = (e) => {
                        console.error('File read error:', e);
                        reject(new Error('Failed to read file'));
                    };
                    reader.readAsText(file);
                });
            },

            async parseEml(content) {
                return new Promise((resolve, reject) => {
                    try {
                        if (!this.isLibraryLoaded) {
                            throw new Error('EMLFormat library not loaded');
                        }

                        const parser = new EMLFormat();
                        const parsed = parser.parse(content);
                        console.log('Raw parsed data:', parsed);

                        // Process attachments
                        const attachments = parsed.attachments.map(attachment => {
                            const contentType = attachment.contentType || '';
                            const isImage = contentType.startsWith('image/');
                            
                            let processedContent = attachment.content;
                            
                            // For binary files, we need to create a proper data URL
                            if (isImage || contentType.includes('application/') || contentType.includes('video/') || contentType.includes('audio/')) {
                                // Convert binary string to base64 if needed
                                try {
                                    const base64Content = btoa(processedContent);
                                    processedContent = `data:${contentType};base64,${base64Content}`;
                                } catch (e) {
                                    console.warn('Could not convert attachment to base64:', attachment.filename);
                                    processedContent = `data:${contentType};base64,${processedContent}`;
                                }
                            }
                            
                            return {
                                filename: attachment.filename,
                                contentType: contentType,
                                content: processedContent,
                                isImage: isImage,
                                size: attachment.size || 0
                            };
                        });

                        // Process email body
                        let body = '';
                        if (parsed.html) {
                            console.log('Using HTML body');
                            body = parsed.html;
                        } else if (parsed.text) {
                            console.log('Using text body');
                            // Convert plain text to HTML with proper line breaks
                            body = '<pre>' + this.escapeHtml(parsed.text) + '</pre>';
                        } else {
                            console.log('No body content found');
                            body = '<p><em>No content available</em></p>';
                        }

                        const emailData = {
                            from: parsed.from || 'Unknown',
                            to: parsed.to || 'Unknown',
                            cc: parsed.cc || '',
                            subject: parsed.subject || 'No Subject',
                            date: parsed.date ? this.formatDate(parsed.date) : 'Unknown Date',
                            body: body,
                            attachments: attachments
                        };

                        console.log('Processed email data:', emailData);
                        resolve(emailData);
                    } catch (error) {
                        console.error('Parse error:', error);
                        reject(error);
                    }
                });
            },

            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            },

            formatDate(dateString) {
                try {
                    const date = new Date(dateString);
                    return date.toLocaleString();
                } catch (e) {
                    return dateString;
                }
            },

            isImageAttachment(attachment) {
                return attachment.isImage;
            },

            downloadAttachment(attachment) {
                try {
                    const link = document.createElement('a');
                    link.href = attachment.content;
                    link.download = attachment.filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                } catch (e) {
                    console.error('Download failed:', e);
                    alert('Could not download attachment');
                }
            },

            formatFileSize(bytes) {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }
        }
    }).mount('#app');
});