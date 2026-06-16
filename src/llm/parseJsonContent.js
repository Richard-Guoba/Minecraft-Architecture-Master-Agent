export function parseJsonContent(content) {
  const fenced = String(content).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : String(content);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('LLM response did not contain a JSON object.');
  }
  return JSON.parse(raw.slice(start, end + 1));
}
