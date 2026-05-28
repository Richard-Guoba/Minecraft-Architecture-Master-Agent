export class ZhipuClient {
  constructor({ apiKey, baseUrl, model }) {
    this.apiKey = apiKey || '';
    this.baseUrl = baseUrl || '';
    this.model = model || 'glm-4-flash';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.baseUrl);
  }

  endpoint() {
    if (this.baseUrl.endsWith('/chat/completions')) return this.baseUrl;
    return `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  async chatJson({ system, user }) {
    if (!this.isConfigured()) {
      throw new Error('Zhipu API is not configured.');
    }

    const response = await fetch(this.endpoint(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Zhipu API failed: ${response.status} ${text.slice(0, 200)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Zhipu API returned no message content.');
    return parseJsonContent(content);
  }
}

function parseJsonContent(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : content;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('LLM response did not contain a JSON object.');
  }
  return JSON.parse(raw.slice(start, end + 1));
}
