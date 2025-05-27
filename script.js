document.getElementById('emlFile').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    const content = event.target.result;
    parseEML(content);
  };
  reader.readAsText(file);
});

function parseEML(content) {
  // Extract headers
  const from = /From:\s*(.*)/i.exec(content)?.[1] || '';
  const to = /To:\s*(.*)/i.exec(content)?.[1] || '';
  const subject = /Subject:\s*(.*)/i.exec(content)?.[1] || '';
  const date = /Date:\s*(.*)/i.exec(content)?.[1] || '';

  document.getElementById('from').textContent = from;
  document.getElementById('to').textContent = to;
  document.getElementById('subject').textContent = subject;
  document.getElementById('date').textContent = date;

  // Detect and show email body
  const htmlMatch = /Content-Type:\s*text\/html[^]*?\r?\n\r?\n([^]*?)\r?\n--/i.exec(content);
  const textMatch = /Content-Type:\s*text\/plain[^]*?\r?\n\r?\n([^]*?)\r?\n--/i.exec(content);

  if (htmlMatch) {
    const html = htmlMatch[1].trim();
    document.getElementById('body').innerHTML = `<iframe srcdoc="${html.replace(/"/g, '&quot;')}"></iframe>`;
  } else if (textMatch) {
    const text = textMatch[1].trim();
    document.getElementById('body').innerHTML = `<pre>${text}</pre>`;
  } else {
    document.getElementById('body').innerHTML = `<pre>(No body found)</pre>`;
  }

  // Find attachments
  const attachments = [];
  const boundaryMatch = /boundary="([^"]+)"/i.exec(content);
  const boundary = boundaryMatch ? boundaryMatch[1] : null;

  if (boundary) {
    const parts = content.split(`--${boundary}`);
    parts.forEach(part => {
      const isAttachment = /Content-Disposition:\s*attachment/i.test(part);
      if (isAttachment) {
        const nameMatch = /name="?([^"\r\n]+)"?/i.exec(part);
        const typeMatch = /Content-Type:\s*([^;\r\n]+)/i.exec(part);
        attachments.push({
          filename: nameMatch?.[1] || '(unnamed)',
          type: typeMatch?.[1] || 'unknown'
        });
      }
    });
  }

  const attachmentList = document.getElementById('attachments');
  attachmentList.innerHTML = attachments.length
    ? attachments.map(att => `<li>${att.filename} (${att.type})</li>`).join('')
    : '<li>No attachments</li>';

  document.getElementById('email-details').style.display = 'block';
}
