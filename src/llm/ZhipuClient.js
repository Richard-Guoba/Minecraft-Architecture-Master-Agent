import { parseJsonContent } from './parseJsonContent.js';

export class ZhipuClient {
  constructor({ apiKey, baseUrl, model, name = 'zhipu-compatible', responseFormat, maxTokens, thinking, reasoningEffort }) {
    this.name = name;
    this.apiKey = apiKey || '';
    this.baseUrl = baseUrl || '';
    this.model = model || 'glm-4-flash';
    this.responseFormat = normalizeResponseFormat(responseFormat);
    this.maxTokens = normalizePositiveInteger(maxTokens);
    this.thinking = normalizeThinking(thinking);
    this.reasoningEffort = normalizeReasoningEffort(reasoningEffort);
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

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.2
    };
    if (this.responseFormat) body.response_format = this.responseFormat;
    if (this.maxTokens) body.max_tokens = this.maxTokens;
    if (this.thinking) body.thinking = this.thinking;
    if (this.reasoningEffort) body.reasoning_effort = this.reasoningEffort;

    const response = await fetch(this.endpoint(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${this.name} API failed: ${response.status} ${text.slice(0, 200)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.name} API returned no message content.`);
    return parseJsonContent(content);
  }
}

function normalizeResponseFormat(value) {
  if (!value) return undefined;
  const type = String(value).trim();
  return type ? { type } : undefined;
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function normalizeThinking(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!type) return undefined;
  if (!['enabled', 'disabled'].includes(type)) return undefined;
  return { type };
}

function normalizeReasoningEffort(value) {
  const effort = String(value || '').trim().toLowerCase();
  return effort || undefined;
}
