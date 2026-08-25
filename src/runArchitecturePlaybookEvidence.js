import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireEpisodeMedia } from './playbook/course/episodeMedia.js';
import {
  runFrameExtraction,
  runTranscription
} from './playbook/course/localEvidenceProcessor.js';
import { getPilotEpisodeIdentity } from './playbook/course/pilotEpisodeSet.js';
import { failPlaybookContract } from './playbook/contracts/playbookContractError.js';

const VALUE_OPTIONS = new Set(['--bvid']);
const BOOLEAN_OPTIONS = new Set(['--replace']);

export function parseArchitecturePlaybookEvidenceArgs(
  argv,
  { projectRoot = path.resolve(import.meta.dirname, '..') } = {}
) {
  const command = argv[0];
  if (!['media', 'transcribe', 'frames'].includes(command)) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_COMMAND_INVALID',
      'argv[0]',
      String(command)
    );
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!VALUE_OPTIONS.has(flag) && !BOOLEAN_OPTIONS.has(flag)) {
      failPlaybookContract(
        'PLAYBOOK_EVIDENCE_ARGUMENT_UNKNOWN',
        `argv[${index}]`,
        String(flag)
      );
    }
    if (values.has(flag)) {
      failPlaybookContract(
        'PLAYBOOK_EVIDENCE_ARGUMENT_DUPLICATE',
        `argv[${index}]`,
        flag
      );
    }
    if (BOOLEAN_OPTIONS.has(flag)) {
      values.set(flag, true);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      failPlaybookContract(
        'PLAYBOOK_EVIDENCE_ARGUMENT_VALUE_MISSING',
        `argv[${index}]`,
        flag
      );
    }
    values.set(flag, value);
    index += 1;
  }
  if (!values.has('--bvid')) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_ARGUMENT_REQUIRED',
      '--bvid',
      'missing option'
    );
  }
  const episode = getPilotEpisodeIdentity(values.get('--bvid'));
  if (command !== 'media' && values.has('--replace')) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_ARGUMENT_INVALID_FOR_COMMAND',
      '--replace',
      `not supported by ${command}`
    );
  }
  return Object.freeze({
    command,
    bvid: episode.bvid,
    episode,
    replace: values.get('--replace') === true,
    projectRoot: path.resolve(projectRoot)
  });
}

export async function main(argv = process.argv.slice(2)) {
  const projectRoot = process.env.PLAYBOOK_PROJECT_ROOT
    ? path.resolve(process.env.PLAYBOOK_PROJECT_ROOT)
    : path.resolve(import.meta.dirname, '..');
  const options = parseArchitecturePlaybookEvidenceArgs(argv, { projectRoot });
  if (options.command === 'media') {
    const result = await acquireEpisodeMedia(options);
    process.stdout.write([
      `media_status=${result.status}`,
      `bvid=${result.media_index.bvid}`,
      `byte_size=${result.media_index.byte_size}`,
      `sha256=${result.media_index.sha256}`
    ].join('\n') + '\n');
    return;
  }
  if (options.command === 'transcribe') {
    const result = await runTranscription(options);
    process.stdout.write([
      `transcript_status=${result.status}`,
      `bvid=${result.bvid}`,
      `segment_count=${result.segment_count}`,
      `duration_ms=${result.duration_ms}`,
      `segment_index_sha256=${result.segment_index_sha256}`
    ].join('\n') + '\n');
    return;
  }
  const result = await runFrameExtraction(options);
  process.stdout.write([
    `frames_status=${result.status}`,
    `bvid=${result.bvid}`,
    `frame_count=${result.frame_count}`,
    `frame_index_sha256=${result.frame_index_sha256}`
  ].join('\n') + '\n');
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    const code = error?.code || 'PLAYBOOK_EVIDENCE_FAILED';
    const detail = error?.detail || error?.message || String(error);
    process.stderr.write(`${code}: ${detail}\n`);
    process.exitCode = 1;
  });
}
