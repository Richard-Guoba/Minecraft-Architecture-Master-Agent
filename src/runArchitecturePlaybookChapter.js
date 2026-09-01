import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createChapterLedger,
  readChapterLedger
} from './playbook/course/chapterLedger.js';
import {
  getChapterEpisodeIdentity,
  validateChapterPlan
} from './playbook/course/chapterPlan.js';
import {
  verifyAndAdvanceEpisode
} from './playbook/course/chapterArtifactVerifier.js';
import { validateCourseManifest } from './playbook/contracts/courseManifest.js';
import { failPlaybookContract } from './playbook/contracts/playbookContractError.js';
import {
  deepFreeze,
  sha256,
  stableJson
} from './playbook/shadow/canonical.js';

const SOURCE_ROOT = path.resolve(import.meta.dirname, '..');
const COURSE_MANIFEST_PATH =
  'docs/architecture-playbook/course/course-manifest.json';
const CHAPTER_PLAN_PATH =
  'docs/architecture-playbook/course/chapter-plan-v1.json';
const STAGES = Object.freeze([
  'pending',
  'media-verified',
  'asr-complete',
  'events-indexed',
  'visual-reviewed',
  'evidence-packed',
  'notes-reviewed',
  'rules-reviewed'
]);
const COMMAND_BY_STAGE = Object.freeze({
  pending: (bvid) => `npm run playbook:evidence -- media --bvid ${bvid}`,
  'media-verified': (bvid) =>
    `npm run playbook:evidence -- transcribe --bvid ${bvid}`,
  'events-indexed': (bvid) =>
    `npm run playbook:evidence -- frames --bvid ${bvid}`,
  'visual-reviewed': (bvid) =>
    `npm run playbook:evidence -- pack --bvid ${bvid}`
});
const REVIEW_BOUNDARY_BY_STAGE = Object.freeze({
  'asr-complete': 'reviewed teaching-event index'
});

export async function runChapterCli(argv, {
  projectRoot = SOURCE_ROOT,
  courseManifest,
  chapterPlan
} = {}) {
  const options = parseChapterArgs(argv);
  const resolvedProjectRoot = path.resolve(projectRoot);
  const manifest = validateCourseManifest(
    courseManifest ?? await readFixedJson(COURSE_MANIFEST_PATH)
  );
  const plan = validateChapterPlan(
    chapterPlan ?? await readFixedJson(CHAPTER_PLAN_PATH),
    manifest
  );
  if (options.command === 'init') {
    let current;
    try {
      current = await readChapterLedger({ projectRoot: resolvedProjectRoot });
      assertLedgerPlanBinding(current.ledger, plan);
      return deepFreeze({ status: 'unchanged', ...globalStatus(plan, current.ledger) });
    } catch (error) {
      if (error?.code !== 'PLAYBOOK_CHAPTER_LEDGER_MISSING') throw error;
    }
    const created = await createChapterLedger({
      projectRoot: resolvedProjectRoot,
      chapterPlan: plan
    });
    assertLedgerPlanBinding(created.ledger, plan);
    return deepFreeze({ status: created.status, ...globalStatus(plan, created.ledger) });
  }
  if (options.command === 'advance') {
    const episode = getChapterEpisodeIdentity({
      chapterPlan: plan,
      courseManifest: manifest,
      bvid: options.bvid
    });
    const current = await readChapterLedger({ projectRoot: resolvedProjectRoot });
    assertLedgerPlanBinding(current.ledger, plan);
    const fromStage = current.ledger.episodes[episode.bvid].stage;
    const advanced = await verifyAndAdvanceEpisode({
      projectRoot: resolvedProjectRoot,
      episode,
      expectedCurrentStage: fromStage
    });
    const toStage = advanced.ledger.episodes[episode.bvid].stage;
    return deepFreeze({
      status: advanced.status,
      bvid: episode.bvid,
      from_stage: fromStage,
      to_stage: toStage,
      evidence: transitionEvidence(advanced.ledger.episodes[episode.bvid], toStage)
    });
  }
  const chapter = options.chapterId === undefined
    ? undefined
    : plan.chapters.find((candidate) => candidate.chapter_id === options.chapterId);
  if (options.chapterId !== undefined && !chapter) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_ID_INVALID',
      '--chapter',
      'unknown chapter'
    );
  }

  const { ledger } = await readChapterLedger({ projectRoot: resolvedProjectRoot });
  assertLedgerPlanBinding(ledger, plan);

  if (options.command === 'status') {
    return chapter ? chapterStatus(chapter, ledger) : globalStatus(plan, ledger);
  }
  return nextAction(chapter, ledger);
}

export async function main(argv = process.argv.slice(2)) {
  const projectRoot = process.env.PLAYBOOK_PROJECT_ROOT
    ? path.resolve(process.env.PLAYBOOK_PROJECT_ROOT)
    : SOURCE_ROOT;
  const result = await runChapterCli(argv, { projectRoot });
  process.stdout.write(stableJson(result));
  return result;
}

function parseChapterArgs(argv) {
  const command = Array.isArray(argv) ? argv[0] : undefined;
  if (!['init', 'status', 'next', 'advance'].includes(command)) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_COMMAND_INVALID',
      'argv[0]',
      'expected init, status, next, or advance'
    );
  }
  if (command === 'init') {
    if (argv.length !== 1) {
      failPlaybookContract(
        'PLAYBOOK_CHAPTER_ARGUMENT_UNKNOWN',
        'argv[1]',
        'unsupported argument'
      );
    }
    return Object.freeze({ command, chapterId: undefined });
  }
  let chapterId;
  let bvid;
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const expectedFlag = command === 'advance' ? '--bvid' : '--chapter';
    if (flag !== expectedFlag) {
      failPlaybookContract(
        'PLAYBOOK_CHAPTER_ARGUMENT_UNKNOWN',
        `argv[${index}]`,
        'unsupported argument'
      );
    }
    if (chapterId !== undefined || bvid !== undefined) {
      failPlaybookContract(
        'PLAYBOOK_CHAPTER_ARGUMENT_DUPLICATE',
        `argv[${index}]`,
        expectedFlag
      );
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      failPlaybookContract(
        'PLAYBOOK_CHAPTER_ARGUMENT_VALUE_MISSING',
        `argv[${index}]`,
        expectedFlag
      );
    }
    if (command === 'advance') bvid = value;
    else chapterId = value;
    index += 1;
  }
  if (command === 'next' && chapterId === undefined) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_ARGUMENT_REQUIRED',
      '--chapter',
      'missing option'
    );
  }
  if (command === 'advance' && bvid === undefined) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_ARGUMENT_REQUIRED',
      '--bvid',
      'missing option'
    );
  }
  return Object.freeze({ command, chapterId, bvid });
}

function transitionEvidence(episode, stage) {
  const fields = {
    'media-verified': ['media_sha256', 'byte_size'],
    'asr-complete': ['segment_index_sha256', 'segment_count'],
    'events-indexed': ['event_index_sha256', 'event_count'],
    'visual-reviewed': ['visual_review_sha256', 'reviewed_frame_count'],
    'evidence-packed': ['evidence_pack_sha256', 'evidence_count'],
    'notes-reviewed': ['notes_sha256', 'note_count'],
    'rules-reviewed': ['rules_sha256', 'rule_count']
  }[stage];
  if (!fields) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_STAGE_INVALID',
      'stage',
      'unsupported transition result'
    );
  }
  return Object.fromEntries(fields.map((field) => [field, episode.evidence[field]]));
}

function chapterStatus(chapter, ledger) {
  const episodes = chapter.episodes.map((episode) => ({
    ...episode,
    stage: ledger.episodes[episode.bvid].stage
  }));
  const completedCount = episodes.filter(
    (episode) => episode.stage === STAGES.at(-1)
  ).length;
  const next = episodes.find((episode) => episode.stage !== STAGES.at(-1));
  return deepFreeze({
    chapter_id: chapter.chapter_id,
    episode_count: chapter.episode_count,
    completed_count: completedCount,
    remaining_count: chapter.episode_count - completedCount,
    next_bvid: next?.bvid ?? null,
    next_stage: next ? followingStage(next.stage) : null
  });
}

function globalStatus(plan, ledger) {
  const episodes = plan.chapters.flatMap((chapter) => chapter.episodes.map((episode) => ({
    ...episode,
    chapter_id: chapter.chapter_id,
    stage: ledger.episodes[episode.bvid].stage
  })));
  const completedCount = episodes.filter(
    (episode) => episode.stage === STAGES.at(-1)
  ).length;
  const next = episodes.find((episode) => episode.stage !== STAGES.at(-1));
  return deepFreeze({
    chapter_count: plan.chapter_count,
    episode_count: plan.episode_count,
    completed_count: completedCount,
    remaining_count: plan.episode_count - completedCount,
    next_chapter_id: next?.chapter_id ?? null,
    next_bvid: next?.bvid ?? null,
    next_stage: next ? followingStage(next.stage) : null
  });
}

function nextAction(chapter, ledger) {
  const next = chapter.episodes.find(
    (episode) => ledger.episodes[episode.bvid].stage !== STAGES.at(-1)
  );
  if (!next) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_COMPLETE',
      '--chapter',
      'chapter has no remaining episode'
    );
  }
  const currentStage = ledger.episodes[next.bvid].stage;
  const commandBuilder = COMMAND_BY_STAGE[currentStage];
  const requiredArtifact = REVIEW_BOUNDARY_BY_STAGE[currentStage];
  if (requiredArtifact) {
    return deepFreeze({
      chapter_id: chapter.chapter_id,
      bvid: next.bvid,
      current_stage: currentStage,
      next_stage: followingStage(currentStage),
      command: null,
      human_review_required: true,
      required_artifact: requiredArtifact
    });
  }
  if (!commandBuilder) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_ACTION_UNAVAILABLE',
      'stage',
      'reviewed artifact adapter required'
    );
  }
  return deepFreeze({
    chapter_id: chapter.chapter_id,
    bvid: next.bvid,
    current_stage: currentStage,
    next_stage: followingStage(currentStage),
    command: commandBuilder(next.bvid)
  });
}

function followingStage(stage) {
  const index = STAGES.indexOf(stage);
  if (index < 0 || index === STAGES.length - 1) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_SOURCE_DRIFT',
      'ledger',
      'ledger stage does not match chapter authority'
    );
  }
  return STAGES[index + 1];
}

function assertLedgerPlanBinding(ledger, plan) {
  if (ledger.chapter_plan_sha256 !== sha256(stableJson(plan))) sourceDrift();
  const expected = plan.chapters.flatMap((chapter) => chapter.episodes.map((episode) => ({
    bvid: episode.bvid,
    chapter_id: chapter.chapter_id,
    course_order: episode.course_order
  })));
  if (expected.length !== Object.keys(ledger.episodes).length) sourceDrift();
  for (const episode of expected) {
    const actual = ledger.episodes[episode.bvid];
    if (
      !actual
      || actual.chapter_id !== episode.chapter_id
      || actual.course_order !== episode.course_order
    ) {
      sourceDrift();
    }
  }
}

function sourceDrift() {
  failPlaybookContract(
    'PLAYBOOK_CHAPTER_SOURCE_DRIFT',
    'ledger',
    'ledger does not match checked-in chapter authority'
  );
}

async function readFixedJson(relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, relativePath), 'utf8'));
  } catch {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_SOURCE_DRIFT',
      'authority',
      'checked-in chapter authority unavailable'
    );
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error?.code || 'PLAYBOOK_CHAPTER_FAILED'}\n`);
    process.exitCode = 1;
  });
}
