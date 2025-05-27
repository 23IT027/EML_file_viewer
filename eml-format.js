class EMLFormat {
    constructor() {
        this.boundary = null;
        this.parts = [];
    }

    parse(eml) {
        console.log('Starting EML parse...');
        const lines = eml.split(/\r?\n/);
        const headers = {};
        let currentHeader = '';
        let currentValue = '';
        let inBody = false;
        let bodyStartIndex = 0;

        // First pass: collect headers and find body start
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (!inBody) {
                if (line.trim() === '') {
                    inBody = true;
                    bodyStartIndex = i + 1;
                    console.log('Found end of headers at line', i);
                    break;
                }

                if (line.startsWith(' ') || line.startsWith('\t')) {
                    currentValue += ' ' + line.trim();
                    if (currentHeader) {
                        headers[currentHeader] = currentValue;
                    }
                } else {
                    const colonIndex = line.indexOf(':');
                    if (colonIndex > 0) {
                        if (currentHeader) {
                            headers[currentHeader] = currentValue;
                        }
                        currentHeader = line.substring(0, colonIndex).toLowerCase();
                        currentValue = line.substring(colonIndex + 1).trim();
                        headers[currentHeader] = currentValue;
                    }
                }
            }
        }

        console.log('Headers found:', headers);

        // Parse content type and boundary
        const contentType = headers['content-type'] || '';
        console.log('Content-Type:', contentType);
        const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
        
        if (boundaryMatch) {
            this.boundary = boundaryMatch[1];
            console.log('Found boundary:', this.boundary);
            this.parseMultipart(eml, bodyStartIndex);
        } else {
            // Handle single part message
            console.log('Handling single part message');
            const contentTransferEncoding = headers['content-transfer-encoding'] || '';
            const bodyLines = lines.slice(bodyStartIndex);
            const bodyContent = bodyLines.join('\n');
            console.log('Raw body content length:', bodyContent.length);
            
            this.parts.push({
                headers: headers,
                body: this.decodeContent(bodyContent, contentTransferEncoding)
            });
        }

        const textPart = this.getTextPart();
        const htmlPart = this.getHtmlPart();
        console.log('Text part found:', !!textPart);
        console.log('HTML part found:', !!htmlPart);
        console.log('Attachments found:', this.getAttachments().length);

        return {
            from: this.parseEmailAddress(headers['from']),
            to: this.parseEmailAddress(headers['to']),
            cc: this.parseEmailAddress(headers['cc']),
            subject: this.decodeHeader(headers['subject']) || '',
            date: headers['date'] || '',
            text: textPart,
            html: htmlPart,
            attachments: this.getAttachments()
        };
    }

    parseMultipart(eml, bodyStartIndex) {
        if (!this.boundary) return;

        console.log('Parsing multipart message with boundary:', this.boundary);
        const lines = eml.split(/\r?\n/);
        const bodyLines = lines.slice(bodyStartIndex);
        const bodyContent = bodyLines.join('\n');
        
        // Split by boundary
        const boundaryDelimiter = '--' + this.boundary;
        const parts = bodyContent.split(boundaryDelimiter);
        
        console.log('Found', parts.length, 'parts');

        for (let i = 1; i < parts.length - 1; i++) { // Skip first empty part and last closing part
            const part = parts[i];
            if (part.trim() === '' || part.trim() === '--') continue;

            const headers = {};
            const partLines = part.split(/\r?\n/);
            let currentHeader = '';
            let currentValue = '';
            let inBody = false;
            let bodyLines = [];

            for (const line of partLines) {
                if (!inBody) {
                    if (line.trim() === '') {
                        inBody = true;
                        continue;
                    }

                    if (line.startsWith(' ') || line.startsWith('\t')) {
                        currentValue += ' ' + line.trim();
                        if (currentHeader) {
                            headers[currentHeader] = currentValue;
                        }
                    } else {
                        const colonIndex = line.indexOf(':');
                        if (colonIndex > 0) {
                            if (currentHeader) {
                                headers[currentHeader] = currentValue;
                            }
                            currentHeader = line.substring(0, colonIndex).toLowerCase();
                            currentValue = line.substring(colonIndex + 1).trim();
                            headers[currentHeader] = currentValue;
                        }
                    }
                } else {
                    bodyLines.push(line);
                }
            }

            const body = bodyLines.join('\n');
            console.log('Part headers:', headers);
            console.log('Part body length:', body.length);
            
            const contentTransferEncoding = headers['content-transfer-encoding'] || '';
            const decodedBody = this.decodeContent(body, contentTransferEncoding);

            this.parts.push({
                headers: headers,
                body: decodedBody
            });
        }
    }

    decodeContent(content, encoding) {
        if (!content) return '';

        console.log('Decoding content with encoding:', encoding);
        const cleanEncoding = encoding.toLowerCase().trim();
        
        switch (cleanEncoding) {
            case 'base64':
                try {
                    // Clean up base64 content
                    const cleanContent = content.replace(/[\r\n\s]/g, '');
                    const decoded = atob(cleanContent);
                    console.log('Base64 decoded successfully, length:', decoded.length);
                    return decoded;
                } catch (e) {
                    console.error('Base64 decode error:', e);
                    return content;
                }
            case 'quoted-printable':
                const decoded = this.decodeQuotedPrintable(content);
                console.log('Quoted-printable decoded successfully');
                return decoded;
            default:
                console.log('Using raw content');
                return content;
        }
    }

    decodeQuotedPrintable(content) {
        return content
            .replace(/=\r?\n/g, '') // Remove soft line breaks
            .replace(/=([0-9A-F]{2})/gi, (_, p1) => 
                String.fromCharCode(parseInt(p1, 16))
            );
    }

    decodeHeader(header) {
        if (!header) return '';
        
        // Decode RFC 2047 encoded headers (=?charset?encoding?text?=)
        return header.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (match, charset, encoding, text) => {
            try {
                if (encoding.toUpperCase() === 'B') {
                    return atob(text);
                } else if (encoding.toUpperCase() === 'Q') {
                    return this.decodeQuotedPrintable(text.replace(/_/g, ' '));
                }
            } catch (e) {
                console.error('Header decode error:', e);
            }
            return match;
        });
    }

    getTextPart() {
        const textPart = this.parts.find(part => {
            const contentType = part.headers['content-type'] || '';
            return contentType.toLowerCase().includes('text/plain');
        });
        return textPart ? textPart.body : '';
    }

    getHtmlPart() {
        const htmlPart = this.parts.find(part => {
            const contentType = part.headers['content-type'] || '';
            return contentType.toLowerCase().includes('text/html');
        });
        return htmlPart ? htmlPart.body : '';
    }

    getAttachments() {
        return this.parts
            .filter(part => {
                const contentType = part.headers['content-type'] || '';
                const disposition = part.headers['content-disposition'] || '';
                
                // Check if it's an attachment by disposition or if it's a non-text content type
                return disposition.toLowerCase().includes('attachment') ||
                       (contentType && 
                        !contentType.toLowerCase().includes('text/plain') && 
                        !contentType.toLowerCase().includes('text/html') &&
                        !contentType.toLowerCase().includes('multipart/'));
            })
            .map(part => {
                const contentType = part.headers['content-type'] || 'application/octet-stream';
                const disposition = part.headers['content-disposition'] || '';
                
                // Extract filename from Content-Disposition or Content-Type
                let filename = 'attachment';
                const dispositionFilename = disposition.match(/filename[*]?="?([^";\r\n]+)"?/i);
                const contentTypeFilename = contentType.match(/name="?([^";\r\n]+)"?/i);
                
                if (dispositionFilename) {
                    filename = dispositionFilename[1];
                } else if (contentTypeFilename) {
                    filename = contentTypeFilename[1];
                }

                // Clean content type
                const cleanContentType = contentType.split(';')[0].trim();

                return {
                    filename: filename,
                    contentType: cleanContentType,
                    content: part.body,
                    size: part.body.length
                };
            });
    }

    parseEmailAddress(address) {
        if (!address) return '';
        
        // Handle multiple addresses
        if (address.includes(',')) {
            return address.split(',').map(addr => this.extractEmail(addr.trim())).join(', ');
        }
        
        return this.extractEmail(address);
    }

    extractEmail(address) {
        // Extract email from "Name <email@domain.com>" format
        const match = address.match(/<([^>]+)>/);
        if (match) {
            return match[1];
        }
        
        // If no angle brackets, check if it looks like an email
        if (address.includes('@')) {
            return address.trim();
        }
        
        return address;
    }
}