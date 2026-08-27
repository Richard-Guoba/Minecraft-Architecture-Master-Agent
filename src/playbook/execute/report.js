export function renderExecuteSelectionReport(selection) {
  const rows = selection.candidates.map((row) => (
    `| ${row.candidate_id} | ${row.seed} | ${row.eligibility.status} | ${row.repair_attempt_count} |`
  )).join('\n');
  return `# Minecraft Architecture Playbook P5 Execution\n\n` +
    `P5 applies four bounded executable repairs. Eleven evidence-required core rules remain review evidence only. ` +
    `Case patterns, unknown results, and not-applicable results are neutral. This report makes no visual-quality or improvement claim.\n\n` +
    `- Candidates: 3\n` +
    `- Selected candidate: ${selection.selected_candidate_id ?? 'none'}\n` +
    `- Repair attempts: ${selection.repair_attempt_count}\n\n` +
    `| Candidate | Seed | Eligibility | Repair attempts |\n| --- | ---: | --- | ---: |\n${rows}\n`;
}
