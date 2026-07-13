export function canonicalizeStage7RealCaseReadinessAudit(audit = {}) {
  return `${JSON.stringify(audit, null, 2)}\n`;
}

export function renderStage7RealCaseReadinessMarkdown(audit = {}) {
  return `# Stage 7 Real-Case Readiness Audit

- Advisory only: ${audit.advisory_only ? 'yes' : 'no'}
- Mutates Dataset: ${audit.mutates_dataset ? 'yes' : 'no'}
- Authorizes training: ${audit.authorizes_training ? 'yes' : 'no'}
`;
}
