export function parseJsonContent(content) {
  const fenced = String(content).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : String(content);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('LLM response did not contain a JSON object.');
  }
  const jsonText = raw.slice(start, end + 1);
  const attempts = [...new Set([jsonText, repairJsonLikeText(jsonText)])];
  const errors = [];

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors[0] || 'LLM response was not valid JSON.');
}

function repairJsonLikeText(value) {
  return String(value)
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/"\s+(?=")/g, '", ')
    .replace(/}\s+(?={)/g, '}, ')
    .replace(/]\s+(?=\[)/g, '], ')
    .replace(/]\s+(?={)/g, '], ')
    .replace(/([}\]])\s+(?="[^"]+"\s*:)/g, '$1, ')
    .replace(/\b(true|false|null)\s+(?="[^"]+"\s*:)/g, '$1, ')
    .replace(/(-?\d+(?:\.\d+)?)\s+(?="[^"]+"\s*:)/g, '$1, ');
}
