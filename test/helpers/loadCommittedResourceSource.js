import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  validateResourceProbeReport,
  validateResourceSourceProfile
} from '../../src/playbook/resources/contracts/index.js';

export async function loadCommittedResourceSource(
  sourceId,
  { projectRoot = path.resolve(import.meta.dirname, '../..') } = {}
) {
  const sourceRoot = path.join(
    projectRoot,
    'docs',
    'architecture-playbook',
    'resources',
    'sources',
    sourceId
  );
  const probesRoot = path.join(sourceRoot, 'probes');
  const probeFilenames = (await readdir(probesRoot))
    .filter((filename) => filename.endsWith('.json'))
    .sort();
  const [profileText, assessmentText, ...probeTexts] = await Promise.all([
    readFile(path.join(sourceRoot, 'source.json'), 'utf8'),
    readFile(path.join(sourceRoot, 'assessment.md'), 'utf8'),
    ...probeFilenames.map((filename) => readFile(path.join(probesRoot, filename), 'utf8'))
  ]);

  return {
    profile: validateResourceSourceProfile(JSON.parse(profileText)),
    probes: probeTexts.map((text) => validateResourceProbeReport(JSON.parse(text))),
    assessment_text: assessmentText,
    assessment_sha256: createHash('sha256').update(assessmentText).digest('hex')
  };
}
