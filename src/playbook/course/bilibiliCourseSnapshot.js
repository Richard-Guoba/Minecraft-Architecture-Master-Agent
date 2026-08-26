import { createHash } from 'node:crypto';
import { validateCourseManifest } from '../contracts/index.js';
import { failPlaybookContract } from '../contracts/playbookContractError.js';

const PRIMARY_AUTHOR_ID = 351448296;
const PRIMARY_AUTHOR_NAME = '黑辉极乐鸟';
const COURSE_SEASON_ID = 4369851;
const TECHNICAL_PROBE_BVID = 'BV1HhEuzZEyZ';

export function buildCourseManifestFromBilibiliSnapshot(
  snapshot,
  {
    capturedAt,
    sourceUrl,
    expectedEpisodeCount,
    sourceSnapshotSha256
  }
) {
  validateSnapshotEnvelope(snapshot);
  const season = snapshot.data.ugc_season;
  if (season.id !== COURSE_SEASON_ID) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_SEASON_INVALID',
      'snapshot.data.ugc_season.id',
      season.id
    );
  }
  if (season.mid !== PRIMARY_AUTHOR_ID) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_AUTHOR_INVALID',
      'snapshot.data.ugc_season.mid',
      season.mid
    );
  }
  const sourceEpisodes = flattenEpisodes(season.sections);
  if (
    season.ep_count !== sourceEpisodes.length
    || sourceEpisodes.length !== expectedEpisodeCount
  ) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_EPISODE_COUNT_INVALID',
      'snapshot.data.ugc_season.ep_count',
      `${season.ep_count}/${sourceEpisodes.length} != ${expectedEpisodeCount}`
    );
  }

  const episodes = sourceEpisodes.map((episode, index) => (
    mapEpisode(episode, index, {
      bvid: snapshot.data.bvid,
      rights: snapshot.data.rights
    })
  ));
  const manifest = {
    schema_version: 1,
    manifest_id: 'bilibili-ugc-season-4369851',
    captured_at: capturedAt,
    source_snapshot_sha256: sourceSnapshotSha256,
    course: {
      platform: 'bilibili',
      season_id: season.id,
      title: season.title,
      primary_school: 'heihui-jileniao',
      canonical_url: sourceUrl,
      author: {
        platform_user_id: season.mid,
        name: snapshot.data.owner?.name ?? PRIMARY_AUTHOR_NAME
      },
      declared_episode_count: season.ep_count
    },
    rights: {
      public_access_observed: true,
      local_analysis_status: 'project-authorized',
      training_status: 'not-reviewed',
      external_release_status: 'not-authorized'
    },
    episodes
  };
  return validateCourseManifest(manifest);
}

function validateSnapshotEnvelope(snapshot) {
  if (
    !snapshot
    || typeof snapshot !== 'object'
    || snapshot.code !== 0
    || !snapshot.data
    || typeof snapshot.data !== 'object'
    || !snapshot.data.ugc_season
    || typeof snapshot.data.ugc_season !== 'object'
  ) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_INVALID',
      'snapshot',
      'expected successful Bilibili view response with ugc_season'
    );
  }
}

function flattenEpisodes(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_SECTIONS_INVALID',
      'snapshot.data.ugc_season.sections',
      'expected non-empty array'
    );
  }
  const episodes = [];
  for (const [sectionIndex, section] of sections.entries()) {
    if (!Array.isArray(section?.episodes)) {
      failPlaybookContract(
        'PLAYBOOK_SNAPSHOT_EPISODES_INVALID',
        `snapshot.data.ugc_season.sections[${sectionIndex}].episodes`,
        'expected array'
      );
    }
    episodes.push(...section.episodes);
  }
  return episodes;
}

function mapEpisode(episode, index, directView) {
  const episodePath = `snapshot.episodes[${index}]`;
  if (!episode || typeof episode !== 'object' || !episode.arc || !episode.page) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_EPISODE_INVALID',
      episodePath,
      'expected episode with arc and page'
    );
  }
  if (episode.arc.author?.mid !== PRIMARY_AUTHOR_ID) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_AUTHOR_INVALID',
      `${episodePath}.arc.author.mid`,
      episode.arc.author?.mid
    );
  }
  if (episode.season_id !== COURSE_SEASON_ID) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_SEASON_INVALID',
      `${episodePath}.season_id`,
      episode.season_id
    );
  }

  const rights = episode.bvid === directView.bvid && directView.rights
    ? {
        api_download_flag: Boolean(directView.rights.download),
        no_reprint_flag: Boolean(directView.rights.no_reprint),
        observation_source: 'direct-view'
      }
    : {
        api_download_flag: null,
        no_reprint_flag: null,
        observation_source: 'season-summary-unverified'
      };
  const stableMetadata = {
    bvid: episode.bvid,
    aid: episode.aid,
    cid: episode.cid,
    season_episode_id: episode.id,
    curriculum_title: episode.title,
    published_title: episode.page.part,
    duration_seconds: episode.arc.duration,
    published_at: unixSecondsToIso(episode.arc.pubdate, `${episodePath}.arc.pubdate`),
    rights
  };
  const sourceStatus = episode.arc.state === 0 ? 'public' : 'source-unavailable';
  return {
    order: index + 1,
    episode_id: `bilibili:${episode.bvid}`,
    ...stableMetadata,
    canonical_url: `https://www.bilibili.com/video/${episode.bvid}/`,
    source_status: sourceStatus,
    metadata_fingerprint_sha256: sha256(stableJson(stableMetadata)),
    processing: {
      role: episode.bvid === TECHNICAL_PROBE_BVID
        ? 'technical-probe'
        : 'course',
      status: sourceStatus === 'public' ? 'metadata-ready' : 'source-unavailable'
    }
  };
}

function unixSecondsToIso(value, valuePath) {
  if (!Number.isSafeInteger(value) || value < 0) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_TIMESTAMP_INVALID',
      valuePath,
      value
    );
  }
  const timestamp = new Date(value * 1000);
  if (!Number.isFinite(timestamp.getTime())) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_TIMESTAMP_INVALID',
      valuePath,
      value
    );
  }
  return timestamp.toISOString();
}

function stableJson(value) {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value) {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortForStableJson(value[key])])
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
