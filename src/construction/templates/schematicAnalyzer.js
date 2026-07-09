import fs from 'node:fs/promises';
import path from 'node:path';
import { parseNbt } from './nbt.js';
import { buildTemplateCaseProfile, renderCaseIndexReport, summarizeCaseIndex } from './templateCaseProfile.js';
import { buildTemplateCaseLibrary, caseClausesJsonl, renderTemplateCaseLibraryReport } from './templateCaseLibrary.js';
import { buildTemplateDesignLawBook, designLawsJsonl, interiorLawsJsonl, renderTemplateDesignLawReport } from './templateDesignLawDistiller.js';
import { analyzeTemplateComposition } from './templateCompositionMiner.js';
import { analyzeSpatialLayout } from './templateSpatialAnalyzer.js';
import { parseTemplateReviewOverlay, mergeReviewRecords } from './templateReviewOverlay.js';
import { writeTemplateKnowledgeBaseV2Artifacts } from './templateKnowledgeBaseV2.js';
import { loadTagTaxonomy } from './templateTagTaxonomy.js';

const DEFAULT_TEMPLATE_KB_V2_GENERATED_AT = '2026-07-09T00:00:00.000Z';
const MCBUILD_URL_PATTERN = /https?:\/\/\S+/i;
const AIR_IDS = new Set([0]);
const WATER_IDS = new Set([8, 9]);
const GROUND_IDS = new Set([1, 2, 3, 12, 13, 24, 80, 82, 87, 88, 110, 121, 172, 174, 179]);
const EARTH_IDS = new Set([2, 3, 12, 13, 80, 82, 110, 172]);
const ROCK_IDS = new Set([1, 4, 7, 43, 44, 48, 67, 97, 98, 109, 139, 168]);
const WOOD_IDS = new Set([5, 17, 53, 54, 63, 64, 65, 68, 72, 85, 96, 107, 126, 127, 134, 135, 136, 143, 162, 163, 164, 183, 184, 185, 186, 187, 193, 194, 195, 196, 197]);
const LEAF_IDS = new Set([18, 106, 161]);
const PLANT_IDS = new Set([6, 31, 32, 37, 38, 39, 40, 59, 81, 83, 86, 91, 103, 104, 105, 111, 115, 141, 142, 175]);
const GLASS_IDS = new Set([20, 95, 102, 160]);
const LIGHT_IDS = new Set([50, 75, 76, 89, 91, 123, 124, 169]);
const FENCE_IDS = new Set([85, 101, 102, 107, 113, 139, 160, 183, 184, 185, 186, 187]);
const STAIR_IDS = new Set([53, 67, 108, 109, 114, 128, 134, 135, 136, 156, 163, 164, 180]);
const SLAB_IDS = new Set([43, 44, 125, 126, 181, 182]);
const DOOR_IDS = new Set([64, 71, 96, 167, 193, 194, 195, 196, 197]);
const DECOR_IDS = new Set([23, 25, 30, 47, 58, 61, 62, 84, 116, 117, 118, 130, 138, 140, 144, 145, 146, 151, 154, 176, 177]);

const OLD_BLOCK_NAMES = {
  0: 'air',
  1: 'stone',
  2: 'grass_block',
  3: 'dirt',
  4: 'cobblestone',
  5: 'planks',
  8: 'water',
  9: 'stationary_water',
  12: 'sand',
  13: 'gravel',
  17: 'log',
  18: 'leaves',
  20: 'glass',
  24: 'sandstone',
  31: 'tall_grass',
  35: 'wool',
  41: 'gold_block',
  42: 'iron_block',
  43: 'double_slab',
  44: 'slab',
  45: 'bricks',
  47: 'bookshelf',
  48: 'mossy_cobblestone',
  49: 'obsidian',
  50: 'torch',
  53: 'oak_stairs',
  54: 'chest',
  58: 'crafting_table',
  64: 'wooden_door',
  65: 'ladder',
  67: 'cobblestone_stairs',
  79: 'ice',
  80: 'snow_block',
  81: 'cactus',
  82: 'clay',
  85: 'fence',
  87: 'netherrack',
  88: 'soul_sand',
  89: 'glowstone',
  91: 'jack_o_lantern',
  95: 'stained_glass',
  96: 'trapdoor',
  98: 'stone_bricks',
  101: 'iron_bars',
  102: 'glass_pane',
  106: 'vine',
  107: 'fence_gate',
  108: 'brick_stairs',
  109: 'stone_brick_stairs',
  110: 'mycelium',
  111: 'lily_pad',
  112: 'nether_bricks',
  113: 'nether_brick_fence',
  114: 'nether_brick_stairs',
  116: 'enchanting_table',
  118: 'cauldron',
  121: 'end_stone',
  123: 'redstone_lamp',
  124: 'lit_redstone_lamp',
  125: 'double_wooden_slab',
  126: 'wooden_slab',
  128: 'sandstone_stairs',
  130: 'ender_chest',
  134: 'spruce_stairs',
  135: 'birch_stairs',
  136: 'jungle_stairs',
  138: 'beacon',
  139: 'cobblestone_wall',
  140: 'flower_pot',
  144: 'skull',
  145: 'anvil',
  146: 'trapped_chest',
  151: 'daylight_detector',
  152: 'redstone_block',
  154: 'hopper',
  155: 'quartz_block',
  156: 'quartz_stairs',
  159: 'stained_hardened_clay',
  160: 'stained_glass_pane',
  161: 'leaves2',
  162: 'log2',
  163: 'acacia_stairs',
  164: 'dark_oak_stairs',
  168: 'prismarine',
  169: 'sea_lantern',
  171: 'carpet',
  172: 'hardened_clay',
  174: 'packed_ice',
  175: 'double_plant',
  179: 'red_sandstone',
  180: 'red_sandstone_stairs',
  181: 'double_red_sandstone_slab',
  182: 'red_sandstone_slab'
};

export async function analyzeTemplateCorpus({
  rootDir = 'mc_templates',
  outputDir = path.join(rootDir, 'analysis'),
  fetchPages = true,
  maxPageFetches = Infinity,
  continueOnError = true,
  cwd = process.cwd()
} = {}) {
  const absoluteRoot = path.resolve(cwd, rootDir);
  const absoluteOutput = path.resolve(cwd, outputDir);
  const sources = await readTemplateSources(absoluteRoot);
  const files = await collectSchematicFiles(absoluteRoot);
  const pageCache = {};
  const templates = [];
  const importErrors = [];
  let fetched = 0;
  const generatedAt = new Date().toISOString();

  for (const filePath of files) {
    const relativePath = path.relative(absoluteRoot, filePath).replaceAll('\\', '/');
    const source = mergeSourceRecords(
      sources.byTemplateName.get(normalizeTemplateName(path.basename(filePath, path.extname(filePath)))),
      sources.byRelativePath.get(relativePath)
    );
    const page = fetchPages && source.url && fetched < maxPageFetches
      ? await fetchPageMetadata(source.url).catch((error) => ({ url: source.url, error: error.message }))
      : source.url ? { url: source.url, skipped: !fetchPages ? 'fetch-disabled' : 'fetch-limit' } : {};
    if (page.url && !page.skipped) fetched += 1;
    if (page.url) pageCache[page.url] = page;
    try {
      templates.push(await analyzeSchematicFile(filePath, {
        rootDir: absoluteRoot,
        source,
        page
      }));
    } catch (error) {
      const record = {
        file: relativePath,
        path: filePath,
        error: error.message
      };
      importErrors.push(record);
      if (!continueOnError) throw error;
    }
  }

  const corpus = summarizeCorpus(templates, sources.unmatched);
  const caseIndex = {
    generated_at: generatedAt,
    root: rootDir,
    summary: summarizeCaseIndex(templates),
    cases: templates.map((template) => template.case_profile)
  };
  const caseLibrary = buildTemplateCaseLibrary({
    root: rootDir,
    generatedAt,
    templates,
    corpus,
    importErrors
  });
  const designLawBook = buildTemplateDesignLawBook({
    root: rootDir,
    generatedAt,
    caseLibrary
  });
  const labels = templates.map((template) => makeGeneratedLabel(template));
  const report = renderGapReport(corpus, templates);
  await fs.mkdir(absoluteOutput, { recursive: true });
  await fs.writeFile(path.join(absoluteOutput, 'template_index.json'), `${JSON.stringify({ generated_at: generatedAt, root: rootDir, corpus, templates, import_errors: importErrors }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'case_index.json'), `${JSON.stringify(caseIndex, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'case_index.md'), renderCaseIndexReport(caseIndex), 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'case_library.json'), `${JSON.stringify(caseLibrary, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'case_library.md'), renderTemplateCaseLibraryReport(caseLibrary), 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'retrieval_index.json'), `${JSON.stringify(caseLibrary.retrieval_index, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'semantic_clauses.jsonl'), caseClausesJsonl(caseLibrary), 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'design_laws.json'), `${JSON.stringify(designLawBook, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'design_laws.md'), renderTemplateDesignLawReport(designLawBook), 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'distilled_laws.jsonl'), designLawsJsonl(designLawBook), 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'interior_laws.jsonl'), interiorLawsJsonl(designLawBook), 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'template_import_errors.json'), `${JSON.stringify(importErrors, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'labels.generated.jsonl'), `${labels.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');
  await fs.writeFile(path.join(absoluteOutput, 'template_gap_report.md'), report, 'utf8');

  const reviewOverlayPath = path.join(absoluteRoot, 'curation', 'template_reviews.jsonl');
  const tagTaxonomyPath = path.join(absoluteRoot, 'curation', 'tag_taxonomy.json');
  let reviewText = '';
  try {
    reviewText = await fs.readFile(reviewOverlayPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const taxonomy = await loadTagTaxonomy(tagTaxonomyPath);
  const parsedReviewOverlay = parseTemplateReviewOverlay(reviewText, {
    taxonomy,
    strict: !continueOnError
  });
  const reviewOverlay = mergeReviewRecords(parsedReviewOverlay.records);
  const knowledgeBaseV2Result = await writeTemplateKnowledgeBaseV2Artifacts({
    outputDir: absoluteOutput,
    generatedAt: stableTemplateKnowledgeBaseV2GeneratedAt(),
    caseLibrary,
    templateIndex: { corpus, templates },
    designLawBook,
    reviewOverlay,
    taxonomy,
    overlayErrors: parsedReviewOverlay.errors,
    inputs: normalizeTemplateKnowledgeBaseV2Inputs({ rootDir, outputDir })
  });

  return {
    outputDir: absoluteOutput,
    corpus,
    caseIndex,
    caseLibrary,
    designLawBook,
    knowledgeBaseV2: {
      summary: knowledgeBaseV2Result.knowledgeBase.summary,
      artifacts: {
        knowledgeBase: knowledgeBaseV2Result.knowledgeBaseFile,
        retrievalIndex: knowledgeBaseV2Result.retrievalIndexFile,
        priorityReport: knowledgeBaseV2Result.priorityReportFile,
        reviewQueue: knowledgeBaseV2Result.reviewQueueFile
      },
      overlayErrors: parsedReviewOverlay.errors
    },
    templates,
    importErrors,
    fetchedPages: fetched,
    pageCache
  };
}

function stableTemplateKnowledgeBaseV2GeneratedAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined) {
    const seconds = Number(epoch);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return DEFAULT_TEMPLATE_KB_V2_GENERATED_AT;
}

export function normalizeTemplateKnowledgeBaseV2Inputs({
  rootDir = 'mc_templates',
  outputDir = path.join(rootDir, 'analysis')
} = {}) {
  return {
    case_library: path.join(outputDir, 'case_library.json').replaceAll('\\', '/'),
    template_index: path.join(outputDir, 'template_index.json').replaceAll('\\', '/'),
    design_laws: path.join(outputDir, 'design_laws.json').replaceAll('\\', '/'),
    review_overlay: path.join(rootDir, 'curation', 'template_reviews.jsonl').replaceAll('\\', '/'),
    tag_taxonomy: path.join(rootDir, 'curation', 'tag_taxonomy.json').replaceAll('\\', '/')
  };
}

export async function analyzeSchematicFile(filePath, { rootDir = process.cwd(), source = {}, page = {} } = {}) {
  const buffer = await fs.readFile(filePath);
  const parsed = parseNbt(buffer);
  const schematic = normalizeSchematicRoot(parsed.value);
  const voxels = analyzeVoxels(schematic);
  voxels.spatial_layout = analyzeSpatialLayout(schematic, {
    blockAt: (index) => blockAt(schematic, index),
    interiorSignalCategories
  });
  const relativePath = path.relative(rootDir, filePath).replaceAll('\\', '/');
  const category = relativePath.split('/')[0] || 'uncategorized';
  const title = source.title || page.title || path.basename(filePath, path.extname(filePath));
  const text = [title, source.note, source.description, ...(source.tags || []), page.title, page.description, category].filter(Boolean).join(' ');
  const style = inferStyleFamily(text, category);
  const typology = inferTypology(text, category);
  const featureTags = [...new Set([...inferFeatureTags(text, voxels, category, typology), ...normalizeStringArray(source.tags)])].sort();
  voxels.composition_grammar = analyzeTemplateComposition(schematic, {
    blockAt: (index) => blockAt(schematic, index),
    analysis: voxels,
    text,
    styleFamily: style,
    typology,
    tags: featureTags
  });

  const template = {
    file: relativePath,
    title,
    category,
    source,
    page,
    style_family: style,
    typology,
    quality: Number.isFinite(Number(source.quality)) ? Number(source.quality) : 5,
    tags: featureTags,
    schematic: {
      format: schematic.format,
      root_name: parsed.name,
      width: schematic.width,
      height: schematic.height,
      length: schematic.length,
      materials: schematic.materials,
      block_array_length: schematic.blockCount || schematic.blocks.length
    },
    analysis: voxels,
    recommendations: recommendationsForTemplate({ text, voxels, style, typology, category, tags: featureTags })
  };
  template.case_profile = buildTemplateCaseProfile(template);
  return template;
}

export async function readTemplateSources(rootDir) {
  const dataFiles = await collectFiles(rootDir, (file) => path.basename(file).toLowerCase() === 'data.txt');
  const labelFiles = await collectFiles(rootDir, (file) => /^labels?\.jsonl$/i.test(path.basename(file)) || /^case[-_ ]?labels?\.jsonl$/i.test(path.basename(file)));
  const sidecarFiles = await collectFiles(rootDir, (file) => isSidecarMetadataFile(file));
  const byTemplateName = new Map();
  const byRelativePath = new Map();
  const unmatched = [];
  for (const dataFile of dataFiles) {
    const category = path.basename(path.dirname(dataFile));
    const content = await fs.readFile(dataFile, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const url = line.match(MCBUILD_URL_PATTERN)?.[0];
      const title = cleanTitle((url ? line.slice(0, line.indexOf(url)) : line).trim());
      const note = url ? line.slice(line.indexOf(url) + url.length).trim() : stripKnownSuffix(line);
      const record = {
        category,
        data_file: path.relative(rootDir, dataFile).replaceAll('\\', '/'),
        title,
        url,
        note: note && note !== title ? note : undefined,
        raw: line
      };
      byTemplateName.set(normalizeTemplateName(title), record);
      unmatched.push(record);
    }
  }
  for (const labelFile of labelFiles) {
    const content = await fs.readFile(labelFile, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const record = parseLabelRecord(line, labelFile, rootDir);
      if (!record) continue;
      if (record.file) {
        const normalizedPath = normalizeRelativePath(record.file);
        byRelativePath.set(normalizedPath, mergeSourceRecords(byRelativePath.get(normalizedPath), record));
      }
      if (record.title) {
        byTemplateName.set(normalizeTemplateName(record.title), mergeSourceRecords(byTemplateName.get(normalizeTemplateName(record.title)), record));
      }
      unmatched.push(record);
    }
  }
  for (const sidecarFile of sidecarFiles) {
    const record = await readSidecarMetadata(sidecarFile, rootDir);
    if (!record) continue;
    byRelativePath.set(record.file, mergeSourceRecords(byRelativePath.get(record.file), record));
    if (record.title) byTemplateName.set(normalizeTemplateName(record.title), mergeSourceRecords(byTemplateName.get(normalizeTemplateName(record.title)), record));
    unmatched.push(record);
  }
  return { byTemplateName, byRelativePath, unmatched };
}

async function collectSchematicFiles(rootDir) {
  return collectFiles(rootDir, (file) => /\.(schematic|schem|litematic)$/i.test(file));
}

async function collectFiles(rootDir, predicate) {
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'analysis') continue;
        await walk(fullPath);
      } else if (predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return results.sort((a, b) => a.localeCompare(b));
}

function mergeSourceRecords(...records) {
  const result = {};
  for (const record of records.filter(Boolean)) {
    result.category = record.category ?? result.category;
    result.data_file = record.data_file ?? result.data_file;
    result.label_file = record.label_file ?? result.label_file;
    result.sidecar_file = record.sidecar_file ?? result.sidecar_file;
    result.file = record.file ?? result.file;
    result.title = record.title ?? result.title;
    result.url = record.url ?? result.url;
    result.note = mergeText(result.note, record.note);
    result.description = mergeText(result.description, record.description);
    result.quality = record.quality ?? result.quality;
    result.raw = record.raw ?? result.raw;
    result.tags = [...new Set([...normalizeStringArray(result.tags), ...normalizeStringArray(record.tags)])].sort();
  }
  return result;
}

function mergeText(a, b) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left) return right || undefined;
  if (!right || left.includes(right)) return left;
  if (right.includes(left)) return right;
  return `${left} ${right}`;
}

function parseLabelRecord(line, labelFile, rootDir) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    parsed = parseLooseLabelLine(line);
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const title = cleanTitle(parsed.title || parsed.name || parsed.case || parsed.template || parsed.file);
  const url = parsed.url || String(parsed.source || '').match(MCBUILD_URL_PATTERN)?.[0];
  const file = parsed.file || parsed.path || parsed.schematic;
  return {
    category: parsed.category || path.basename(path.dirname(labelFile)),
    label_file: path.relative(rootDir, labelFile).replaceAll('\\', '/'),
    file: file ? normalizeRelativePath(file) : undefined,
    title,
    url,
    note: parsed.note || parsed.notes || parsed.comment,
    description: parsed.description || parsed.desc,
    quality: parsed.quality,
    tags: normalizeStringArray(parsed.tags || parsed.labels || parsed.tag),
    raw: line
  };
}

function parseLooseLabelLine(line) {
  const url = line.match(MCBUILD_URL_PATTERN)?.[0];
  const withoutUrl = url ? line.replace(url, ' ') : line;
  const parts = withoutUrl.split(/\t|\s+\|\s+|;/).map((part) => part.trim()).filter(Boolean);
  const file = parts.find((part) => /\.(schematic|schem|litematic)$/i.test(part));
  const tagPart = parts.find((part) => /^tags?\s*[:=]/i.test(part));
  const title = cleanTitle(parts.find((part) => part !== file && !/^tags?\s*[:=]/i.test(part)) || file || withoutUrl);
  return {
    file,
    title,
    url,
    tags: tagPart ? tagPart.replace(/^tags?\s*[:=]\s*/i, '').split(/[,，、\s]+/).filter(Boolean) : [],
    note: parts.filter((part) => part !== file && part !== title && part !== tagPart).join(' ')
  };
}

function isSidecarMetadataFile(file) {
  const base = path.basename(file).toLowerCase();
  if (!base.endsWith('.txt')) return false;
  if (base === 'data.txt') return false;
  if (base.endsWith('.tags.txt') || base.endsWith('.label.txt') || base.endsWith('.labels.txt') || base.endsWith('.url.txt') || base.endsWith('.note.txt')) return true;
  return !/(readme|说明|license|credits)/i.test(base);
}

async function readSidecarMetadata(sidecarFile, rootDir) {
  const content = await fs.readFile(sidecarFile, 'utf8');
  const relativeSidecar = path.relative(rootDir, sidecarFile).replaceAll('\\', '/');
  const templateFile = sidecarPathToTemplatePath(sidecarFile, rootDir);
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const record = {
    category: path.basename(path.dirname(sidecarFile)),
    sidecar_file: relativeSidecar,
    file: templateFile,
    title: cleanTitle(path.basename(templateFile, path.extname(templateFile))),
    tags: []
  };
  const notes = [];
  for (const line of lines) {
    const url = line.match(MCBUILD_URL_PATTERN)?.[0];
    if (url) record.url = url;
    if (/^title\s*[:=]/i.test(line)) record.title = cleanTitle(line.replace(/^title\s*[:=]\s*/i, ''));
    else if (/^tags?\s*[:=]/i.test(line)) record.tags.push(...line.replace(/^tags?\s*[:=]\s*/i, '').split(/[,，、\s]+/).filter(Boolean));
    else if (/^quality\s*[:=]/i.test(line)) record.quality = Number(line.replace(/^quality\s*[:=]\s*/i, ''));
    else if (/^desc(?:ription)?\s*[:=]/i.test(line)) record.description = mergeText(record.description, line.replace(/^desc(?:ription)?\s*[:=]\s*/i, ''));
    else if (!url) notes.push(line);
  }
  record.note = notes.join(' ') || undefined;
  record.tags = [...new Set(record.tags)].sort();
  return record;
}

function sidecarPathToTemplatePath(sidecarFile, rootDir) {
  const dir = path.dirname(sidecarFile);
  const base = path.basename(sidecarFile)
    .replace(/\.(tags|labels|label|url|note)\.txt$/i, '')
    .replace(/\.txt$/i, '');
  const relative = path.relative(rootDir, path.join(dir, `${base}.schematic`)).replaceAll('\\', '/');
  return normalizeRelativePath(relative);
}

async function fetchPageMetadata(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Minecraft-Constructing-Agents template analyzer'
      }
    });
    const html = await response.text();
    return {
      url,
      status: response.status,
      title: extractTitle(html),
      description: extractDescription(html),
      text_sample: extractTextSample(html)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSchematicRoot(root) {
  const width = numberTag(root.Width ?? root.width);
  const height = numberTag(root.Height ?? root.height);
  const length = numberTag(root.Length ?? root.length);
  if (width && height && length && Buffer.isBuffer(root.Blocks)) {
    return {
      format: root.SchematicVersion || root.Version ? 'mcedit-or-schematica' : 'mcedit-classic',
      kind: 'legacy',
      width,
      height,
      length,
      materials: root.Materials || 'unknown',
      blocks: root.Blocks,
      blockCount: root.Blocks.length,
      data: Buffer.isBuffer(root.Data) ? root.Data : Buffer.alloc(root.Blocks.length),
      addBlocks: Buffer.isBuffer(root.AddBlocks) ? root.AddBlocks : undefined
    };
  }

  if (width && height && length && Buffer.isBuffer(root.BlockData) && root.Palette && typeof root.Palette === 'object') {
    const paletteNames = paletteNamesFromSpongePalette(root.Palette);
    const paletteIds = decodeVarintBlockData(root.BlockData, width * height * length);
    return {
      format: 'sponge-schematic',
      kind: 'palette',
      width,
      height,
      length,
      materials: `palette:${paletteNames.length}`,
      blocks: root.BlockData,
      blockCount: paletteIds.length,
      paletteIds,
      paletteNames
    };
  }

  if (root.Regions && typeof root.Regions === 'object') {
    return normalizeRegionSchematic(root);
  }

  throw new Error('Unsupported schematic: expected classic Blocks, Sponge BlockData, or Regions.');
}

function paletteNamesFromSpongePalette(palette) {
  const reverse = [];
  for (const [blockState, id] of Object.entries(palette)) reverse[Number(id)] = blockState;
  return reverse.map((value) => value || 'minecraft:air');
}

function decodeVarintBlockData(buffer, expectedLength) {
  const values = new Int32Array(expectedLength);
  let offset = 0;
  let index = 0;
  while (offset < buffer.length && index < expectedLength) {
    let value = 0;
    let shift = 0;
    while (true) {
      if (offset >= buffer.length) break;
      const byte = buffer[offset];
      offset += 1;
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new Error('Invalid Sponge schematic varint block data.');
    }
    values[index] = value;
    index += 1;
  }
  return values;
}

function normalizeRegionSchematic(root) {
  const regions = Object.entries(root.Regions);
  if (!regions.length) throw new Error('Unsupported Regions schematic: no regions.');
  const [regionName, region] = regions[0];
  const size = region.Size || root.Metadata?.EnclosingSize || {};
  const width = Math.abs(numberTag(size.x ?? size.X ?? size.Width) || 0);
  const height = Math.abs(numberTag(size.y ?? size.Y ?? size.Height) || 0);
  const length = Math.abs(numberTag(size.z ?? size.Z ?? size.Length) || 0);
  const paletteNames = Array.isArray(region.BlockStatePalette)
    ? region.BlockStatePalette.map(blockStateName)
    : [];
  if (!width || !height || !length || !paletteNames.length || !Array.isArray(region.BlockStates)) {
    throw new Error('Unsupported Regions schematic: expected Size, BlockStatePalette, and BlockStates.');
  }
  const paletteIds = decodePackedBlockStates(region.BlockStates, paletteNames.length, width * height * length);
  return {
    format: 'region-palette-schematic',
    kind: 'palette',
    regionName,
    width,
    height,
    length,
    materials: `palette:${paletteNames.length}`,
    blocks: Buffer.alloc(0),
    blockCount: paletteIds.length,
    paletteIds,
    paletteNames
  };
}

function blockStateName(value = {}) {
  const name = String(value.Name || value.name || 'minecraft:air');
  const properties = value.Properties && typeof value.Properties === 'object'
    ? Object.entries(value.Properties).sort(([a], [b]) => a.localeCompare(b)).map(([key, propertyValue]) => `${key}=${propertyValue}`).join(',')
    : '';
  return properties ? `${name}[${properties}]` : name;
}

function decodePackedBlockStates(longs, paletteLength, expectedLength) {
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(1, paletteLength))));
  const mask = (1n << BigInt(bits)) - 1n;
  const unsigned = longs.map((value) => BigInt.asUintN(64, typeof value === 'bigint' ? value : BigInt(value)));
  const values = new Int32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) {
    const bitIndex = BigInt(index * bits);
    const longIndex = Number(bitIndex / 64n);
    const offset = Number(bitIndex % 64n);
    const current = unsigned[longIndex] || 0n;
    const next = unsigned[longIndex + 1] || 0n;
    const combined = offset + bits > 64
      ? (current >> BigInt(offset)) | (next << BigInt(64 - offset))
      : current >> BigInt(offset);
    values[index] = Number(combined & mask);
  }
  return values;
}

function analyzeVoxels(schematic) {
  const counts = {};
  const categories = emptyCategoryCounts();
  const interiorSignals = emptyInteriorSignalCounts();
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };
  const naturalHeight = new Map();
  const occupiedColumns = new Set();
  let nonAir = 0;
  let edgeContact = 0;

  for (let y = 0; y < schematic.height; y += 1) {
    for (let z = 0; z < schematic.length; z += 1) {
      for (let x = 0; x < schematic.width; x += 1) {
        const index = y * schematic.length * schematic.width + z * schematic.width + x;
        const block = blockAt(schematic, index);
        if (block.air) continue;
        nonAir += 1;
        counts[block.key] = (counts[block.key] || 0) + 1;
        const category = block.category;
        categories[category] = (categories[category] || 0) + 1;
        for (const signal of interiorSignalCategories(block)) interiorSignals[signal] = (interiorSignals[signal] || 0) + 1;
        updateBounds(bounds, x, y, z);
        occupiedColumns.add(`${x},${z}`);
        if (x === 0 || z === 0 || x === schematic.width - 1 || z === schematic.length - 1) edgeContact += 1;
        if (isNaturalSurfaceCandidate(block, y, schematic.height)) {
          const key = `${x},${z}`;
          const current = naturalHeight.get(key);
          if (current === undefined || y > current) naturalHeight.set(key, y);
        }
      }
    }
  }

  const topBlocks = Object.entries(counts)
    .map(([key, count]) => ({ key, id: numericKey(key), name: blockName(key), count, ratio: round(count / Math.max(1, nonAir), 4), category: blockCategory(key) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);
  const terrainHeights = [...naturalHeight.values()];
  const terrainMinMax = minMax(terrainHeights);
  const terrainRange = terrainMinMax ? terrainMinMax.max - terrainMinMax.min : 0;
  const terrainStdDev = stddev(terrainHeights);
  const naturalColumnRatio = round(terrainHeights.length / Math.max(1, schematic.width * schematic.length), 4);
  const vegetationRatio = ratio(categories.vegetation, nonAir);
  const waterRatio = ratio(categories.water, nonAir);
  const nonFlatTerrain = terrainRange >= 3 && terrainStdDev >= 0.7;
  const integratedTerrain = (nonFlatTerrain && naturalColumnRatio > 0.08) || vegetationRatio > 0.025 || waterRatio > 0.015;
  const footprintArea = occupiedColumns.size;
  const volume = schematic.width * schematic.height * schematic.length;
  const verticalProfile = layerProfile(schematic, counts);

  return {
    dimensions: {
      width: schematic.width,
      height: schematic.height,
      length: schematic.length,
      volume,
      non_air_blocks: nonAir,
      density: round(nonAir / Math.max(1, volume), 4)
    },
    bounds: normalizeBounds(bounds),
    footprint: {
      occupied_columns: footprintArea,
      occupied_ratio: round(footprintArea / Math.max(1, schematic.width * schematic.length), 4),
      edge_contact_ratio: round(edgeContact / Math.max(1, nonAir), 4)
    },
    block_categories: normalizeCategoryRatios(categories, nonAir),
    top_blocks: topBlocks,
    terrain: {
      natural_columns: terrainHeights.length,
      natural_column_ratio: naturalColumnRatio,
      height_range: terrainRange,
      height_stddev: round(terrainStdDev, 3),
      non_flat: nonFlatTerrain,
      integrated: integratedTerrain
    },
    detail_metrics: {
      glass_ratio: ratio(categories.glass, nonAir),
      stair_slab_ratio: ratio((categories.stair || 0) + (categories.slab || 0), nonAir),
      fence_ratio: ratio(categories.fence, nonAir),
      light_ratio: ratio(categories.light, nonAir),
      decor_ratio: ratio(categories.decor, nonAir),
      natural_ratio: ratio((categories.earth || 0) + (categories.rock || 0) + (categories.vegetation || 0) + (categories.water || 0), nonAir),
      garden_signal: gardenSignal(categories, terrainRange, nonAir)
    },
    interior_signals: normalizeInteriorSignals(interiorSignals, nonAir),
    vertical_profile: verticalProfile
  };
}

function layerProfile(schematic) {
  const layerCounts = Array.from({ length: schematic.height }, () => 0);
  const length = schematic.blockCount || schematic.blocks.length;
  for (let index = 0; index < length; index += 1) {
    const block = blockAt(schematic, index);
    if (block.air) continue;
    const y = Math.floor(index / (schematic.length * schematic.width));
    layerCounts[y] += 1;
  }
  const peak = Math.max(...layerCounts, 1);
  const occupiedLayers = layerCounts.filter((count) => count > 0).length;
  const highDetailLayers = layerCounts.filter((count) => count > peak * 0.45).length;
  return {
    occupied_layers: occupiedLayers,
    massing_core_layers: highDetailLayers,
    peak_layer_occupancy: peak,
    tower_like: schematic.height >= Math.max(schematic.width, schematic.length) * 0.8 && highDetailLayers < schematic.height * 0.45
  };
}

function blockAt(schematic, index) {
  if (schematic.kind === 'palette') {
    const paletteId = schematic.paletteIds[index] || 0;
    const state = schematic.paletteNames[paletteId] || 'minecraft:air';
    const key = stripBlockProperties(state);
    return {
      id: paletteId,
      state,
      key,
      name: key,
      category: blockCategory(key),
      air: key === 'minecraft:air'
    };
  }

  let id = schematic.blocks[index] & 0xff;
  if (schematic.addBlocks) {
    const packed = schematic.addBlocks[Math.floor(index / 2)] || 0;
    const high = index % 2 === 0 ? packed & 0x0f : (packed >> 4) & 0x0f;
    id += high << 8;
  }
  return {
    id,
    state: blockName(id),
    key: String(id),
    name: blockName(id),
    category: blockCategory(id),
    air: AIR_IDS.has(id)
  };
}

function blockCategory(id) {
  if (typeof id === 'string' && !/^\d+$/.test(id)) return blockNameCategory(id);
  id = Number(id);
  if (AIR_IDS.has(id)) return 'air';
  if (WATER_IDS.has(id)) return 'water';
  if (LEAF_IDS.has(id)) return 'vegetation';
  if (PLANT_IDS.has(id)) return 'vegetation';
  if (EARTH_IDS.has(id)) return 'earth';
  if (ROCK_IDS.has(id)) return 'rock';
  if (WOOD_IDS.has(id)) return 'wood';
  if (GLASS_IDS.has(id)) return 'glass';
  if (LIGHT_IDS.has(id)) return 'light';
  if (FENCE_IDS.has(id)) return 'fence';
  if (STAIR_IDS.has(id)) return 'stair';
  if (SLAB_IDS.has(id)) return 'slab';
  if (DOOR_IDS.has(id)) return 'opening';
  if (DECOR_IDS.has(id)) return 'decor';
  return 'other';
}

function blockNameCategory(name) {
  const value = stripBlockProperties(name).replace(/^minecraft:/, '');
  if (value === 'air' || value === 'cave_air' || value === 'void_air') return 'air';
  if (value.includes('water') || value.includes('kelp') || value.includes('seagrass')) return 'water';
  if (/(glass|pane)/.test(value)) return 'glass';
  if (/(torch|lantern|lamp|glowstone|sea_lantern|end_rod|beacon|light)/.test(value)) return 'light';
  if (/(leaves|leaf|vine|grass|fern|flower|azalea|sapling|bush|cactus|bamboo|lily|moss_carpet|mushroom|roots)/.test(value)) return 'vegetation';
  if (/(fence|wall|bars|railing)/.test(value)) return 'fence';
  if (/stairs?$/.test(value)) return 'stair';
  if (/slab/.test(value)) return 'slab';
  if (/(door|trapdoor|gate|button|pressure_plate|ladder)/.test(value)) return 'opening';
  if (/(chest|barrel|table|pot|skull|banner|bed|lectern|bookshelf|anvil|hopper|cauldron|campfire|carpet|chain|decorated_pot)/.test(value)) return 'decor';
  if (/(dirt|grass_block|podzol|sand|gravel|clay|mud|mycelium|snow_block|soul_sand|red_sand|terracotta|farmland)/.test(value)) return 'earth';
  if (/(stone|cobble|deepslate|blackstone|basalt|tuff|calcite|andesite|diorite|granite|brick|quartz|sandstone|prismarine|end_stone|netherrack|obsidian|purpur)/.test(value)) return 'rock';
  if (/(planks|log|wood|stem|hyphae|stripped|wool)/.test(value)) return 'wood';
  return 'other';
}

function isNaturalSurfaceCandidate(block, y, height) {
  const category = block.category || blockCategory(block.key);
  if (['water', 'earth', 'vegetation'].includes(category)) return true;
  const id = Number(block.key);
  if (WATER_IDS.has(id) || EARTH_IDS.has(id) || LEAF_IDS.has(id) || PLANT_IDS.has(id)) return true;
  return GROUND_IDS.has(id) && y < height * 0.45;
}

function inferStyleFamily(text, category) {
  const value = `${text} ${category}`.toLowerCase();
  if (/japanese|pagoda|ninja|temple|tea house|日式|日本|茶/.test(value)) return 'japanese';
  if (/goth|church|cathedral|big ben|clock tower|tower of gods|哥特|教堂/.test(value)) return 'gothic';
  if (/castle|fort|hogwarts|medieval|m[eé]di[eé]val|tavern|spruce|spawn village|castle|城堡|中世纪/.test(value)) return 'medieval';
  if (/modern|futuristic|stark|hospital|apartment|hotel|estate|iron man|现代|未来/.test(value)) return 'modern';
  if (/classi|colonial|white house|parthenon|library|colosseum|amphitheatre|villa|古典|巴特农/.test(value)) return 'classical';
  if (/pyramid|sandstone|desert|sand/.test(value)) return 'desert';
  if (/lake|cove|beach|watermill|lighthouse|海|湖|水/.test(value)) return 'coastal';
  if (/cave|retreat|ygg|sky city|floating|cove/.test(value)) return 'fantasy';
  return 'general';
}

function inferTypology(text, category) {
  const value = `${text} ${category}`.toLowerCase();
  if (/castle|fort|hogwarts|城堡/.test(value)) return 'castle';
  if (/tower|big ben|eiffel|lighthouse|塔/.test(value)) return 'tower';
  if (/temple|pagoda|parthenon|church|庙|神庙|教堂/.test(value)) return 'temple';
  if (/arena|colosseum|\bcourt\b|field|lobby|amphitheatre|竞技|球场/.test(value)) return 'arena';
  if (/hotel|hospital|library|apartment|building|金字塔|pyramid/.test(value)) return 'public-building';
  if (/mansion|estate|villa|house|home|tavern|market|住宅|别墅/.test(value)) return 'house';
  return String(category || 'building').toLowerCase();
}

function inferFeatureTags(text, voxels, category, typology) {
  const value = `${text} ${category}`.toLowerCase();
  const tags = new Set();
  if (/symmetry|classi|colonial|white house|parthenon|colosseum|formal|古典/.test(value)) tags.add('formal-axis');
  if (/tower|big ben|eiffel|clock|lighthouse|塔/.test(value) || voxels.vertical_profile.tower_like) tags.add('vertical-icon');
  if (/castle|fort|medieval|hogwarts|goth|church|中世纪|城堡/.test(value)) tags.add('stone-massing');
  if (/modern|futuristic|stark|hospital|apartment/.test(value)) tags.add('large-glass-or-panel-grid');
  if (/japanese|pagoda|tea|ninja|日式|日本/.test(value)) tags.add('layered-eaves');
  if (/garden|village|market|spawn|tea house|retreat|园|庭/.test(value) || voxels.detail_metrics.garden_signal !== 'none') tags.add('landscape-composition');
  if (/water|lake|cove|beach|lighthouse|watermill|海|湖|水/.test(value) || Number(voxels.block_categories.water?.ratio || 0) > 0.005) tags.add('water-edge');
  if (/cave|retreat|sky city|floating|spawn|cove|山|洞/.test(value) || voxels.terrain.integrated) tags.add('terrain-integrated');
  if (voxels.detail_metrics.stair_slab_ratio > 0.08) tags.add('micro-block-detailing');
  if (voxels.detail_metrics.fence_ratio > 0.025) tags.add('rail-and-fence-detail');
  if (voxels.detail_metrics.glass_ratio > 0.08) tags.add('glass-emphasis');
  if (isInteriorLearningTypology(typology, category) && voxels.interior_signals?.furnished_likelihood !== 'low') tags.add('furnished-interior');
  if (isInteriorLearningTypology(typology, category) && Number(voxels.interior_signals?.richness || 0) >= 6) tags.add('layered-interior');
  return [...tags].sort();
}

function recommendationsForTemplate({ text, voxels, style, typology, category, tags }) {
  const landscapeFeatures = new Set();
  if (voxels.terrain.non_flat || tags.includes('terrain-integrated')) landscapeFeatures.add('layered-terrain');
  if (voxels.terrain.integrated) landscapeFeatures.add('rock-and-earth-base');
  if (tags.includes('landscape-composition') || voxels.detail_metrics.garden_signal !== 'none') landscapeFeatures.add('garden-composition');
  if (tags.includes('water-edge')) landscapeFeatures.add('water-edge');
  if (voxels.block_categories.vegetation?.ratio > 0.02) landscapeFeatures.add('tree-and-shrub-clusters');

  const designPriorities = [];
  if (voxels.detail_metrics.stair_slab_ratio > 0.05) designPriorities.push('use disciplined micro-depth trim, piers, rails, screens, and relief to break flat walls');
  if (voxels.detail_metrics.fence_ratio > 0.015) designPriorities.push('add rail/fence rhythm to edges and terraces');
  if (voxels.terrain.integrated) designPriorities.push('treat terrain as part of the composition, not a flat base');
  if (voxels.detail_metrics.garden_signal !== 'none') designPriorities.push('compose garden rooms and foreground scenery');
  if (isInteriorLearningTypology(typology, category) && voxels.interior_signals?.furnished_likelihood !== 'low') {
    designPriorities.push('use layered interior grammar: focal walls, storage, textiles, plants, and task zones');
  }
  if (voxels.vertical_profile.tower_like || typology === 'tower') designPriorities.push('preserve strong vertical silhouette and staged tapering');

  return {
    style_family: style,
    typology,
    template_scale: scaleBucket(voxels.dimensions.non_air_blocks),
    terrain_profile: voxels.terrain.non_flat ? 'non-flat-integrated' : voxels.terrain.integrated ? 'landscape-integrated' : 'flat-or-built-platform',
    landscape_features: [...landscapeFeatures].sort(),
    detail_density: detailDensity(voxels),
    design_priorities: designPriorities,
    source_category: category,
    source_keywords: keywordHints(text)
  };
}

function isInteriorLearningTypology(typology, category) {
  const type = String(typology || '').toLowerCase();
  const group = String(category || '').toLowerCase();
  if (type === 'arena' || group === 'arenas') return false;
  return true;
}

function summarizeCorpus(templates, rawSources = []) {
  const categories = groupCount(templates.map((item) => item.category));
  const styles = groupCount(templates.map((item) => item.style_family));
  const typologies = groupCount(templates.map((item) => item.typology));
  const terrainTemplates = templates.filter((item) => item.analysis.terrain.integrated || item.tags.includes('terrain-integrated'));
  const gardenTemplates = templates.filter((item) => item.tags.includes('landscape-composition') || item.analysis.detail_metrics.garden_signal !== 'none');
  const waterTemplates = templates.filter((item) => item.tags.includes('water-edge'));
  const topBlocks = aggregateTopBlocks(templates);
  const dimensions = templates.map((item) => item.analysis.dimensions);
  return {
    template_count: templates.length,
    source_count: rawSources.length,
    category_counts: categories,
    style_counts: styles,
    typology_counts: typologies,
    scale: {
      avg_width: average(dimensions.map((item) => item.width)),
      avg_height: average(dimensions.map((item) => item.height)),
      avg_length: average(dimensions.map((item) => item.length)),
      avg_non_air_blocks: average(dimensions.map((item) => item.non_air_blocks)),
      max_non_air_blocks: Math.max(...dimensions.map((item) => item.non_air_blocks), 0)
    },
    terrain: {
      integrated_count: terrainTemplates.length,
      integrated_ratio: ratio(terrainTemplates.length, templates.length),
      examples: terrainTemplates.slice(0, 10).map(exampleSummary)
    },
    gardens: {
      garden_count: gardenTemplates.length,
      garden_ratio: ratio(gardenTemplates.length, templates.length),
      water_edge_count: waterTemplates.length,
      examples: gardenTemplates.slice(0, 10).map(exampleSummary)
    },
    top_blocks: topBlocks,
    gap_priorities: [
      'replace flat-lot assumption with terrain-aware bases',
      'compose foreground gardens, paths, rocks, vegetation, and water as a scene',
      'learn style-specific roof silhouettes and eave layering',
      'increase facade depth with trims, columns, rails, screens, lights, and relief',
      'support large public/monument typologies beyond single residential shells'
    ]
  };
}

function makeGeneratedLabel(template) {
  return {
    file: template.file,
    title: template.title,
    style_family: template.style_family,
    typology: template.typology,
    quality: 5,
    tags: template.tags,
    quality_tags: template.case_profile?.quality_tags || [],
    learning_roles: (template.case_profile?.learning_roles || []).map((role) => role.role),
    phase2_room_mining_priority: template.case_profile?.phase2_room_mining_priority || 'unknown',
    spatial_pattern_mining_readiness: template.case_profile?.phase2_spatial_evidence?.pattern_mining_readiness || 'skip',
    spatial_room_candidate_count: template.case_profile?.phase2_spatial_evidence?.room_candidate_count || 0,
    spatial_detected_room_types: template.case_profile?.phase2_spatial_evidence?.detected_room_types || {},
    furniture_pattern_readiness: template.case_profile?.phase3_pattern_evidence?.furniture_pattern_readiness || 'skip',
    furniture_group_count: template.case_profile?.phase3_pattern_evidence?.furniture_group_count || 0,
    detected_furniture_patterns: template.case_profile?.phase3_pattern_evidence?.detected_furniture_patterns || {},
    composition_readiness: template.analysis.composition_grammar?.readiness || 'skip',
    composition_patterns: compositionPatternSummary(template.analysis.composition_grammar),
    room_reference_candidates: (template.case_profile?.room_reference_candidates || []).map((room) => room.room_type),
    front_side: 'unknown',
    has_interior: template.analysis.dimensions.density < 0.55,
    source: template.source?.url || template.source?.note || 'local-schematic',
    generated_from: ['data.txt', 'schematic-analysis']
  };
}

function compositionPatternSummary(grammar = {}) {
  return {
    massing: (grammar.massing_patterns || []).slice(0, 4).map((item) => item.pattern_type),
    approach: (grammar.approach_sequence || []).slice(0, 4).map((item) => item.pattern_type),
    facade: (grammar.facade_rhythm || []).slice(0, 4).map((item) => item.pattern_type),
    roof: (grammar.roof_composition || []).slice(0, 4).map((item) => item.pattern_type),
    site: (grammar.site_composition || []).slice(0, 4).map((item) => item.pattern_type)
  };
}

function renderGapReport(corpus, templates) {
  const terrainExamples = corpus.terrain.examples.map((item) => `- ${item.title}: ${item.reason}`).join('\n') || '- none detected';
  const gardenExamples = corpus.gardens.examples.map((item) => `- ${item.title}: ${item.reason}`).join('\n') || '- none detected';
  const topStyles = Object.entries(corpus.style_counts).map(([key, value]) => `${key}=${value}`).join(', ');
  const topTypologies = Object.entries(corpus.typology_counts).map(([key, value]) => `${key}=${value}`).join(', ');
  const highestDetail = [...templates]
    .sort((a, b) => detailScore(b.analysis) - detailScore(a.analysis))
    .slice(0, 10)
    .map((item) => `- ${item.title}: detail=${detailDensity(item.analysis)}, tags=${item.tags.join(', ') || 'none'}`)
    .join('\n');

  return `# MC Template Corpus Gap Report

Generated: ${new Date().toISOString()}

## Corpus

- Templates: ${corpus.template_count}
- Categories: ${Object.entries(corpus.category_counts).map(([key, value]) => `${key}=${value}`).join(', ')}
- Styles: ${topStyles}
- Typologies: ${topTypologies}
- Average size: ${Math.round(corpus.scale.avg_width)} x ${Math.round(corpus.scale.avg_height)} x ${Math.round(corpus.scale.avg_length)}
- Terrain-integrated templates: ${corpus.terrain.integrated_count} (${Math.round(corpus.terrain.integrated_ratio * 100)}%)
- Garden/scene templates: ${corpus.gardens.garden_count} (${Math.round(corpus.gardens.garden_ratio * 100)}%)
- Water-edge templates: ${corpus.gardens.water_edge_count}

## What The Reference Buildings Do Better

- They often make the site part of the building: cliffs, caves, raised plinths, islands, paths, courtyards, water edges, trees, and foreground scenery are part of the composition.
- They use disciplined small-block depth: columns, rails, walls, panes, lights, screens, vines, plants, and occasional shaped blocks create readable layers without turning windows into half-slab patches.
- Their silhouettes are specific: towers taper, pagodas stack, castles use turrets and buttresses, modern builds use horizontal glass bands, and temples use strong axes.
- The foreground is designed: paths, gates, hedges, rocks, water, plazas, and planting beds frame the building before the wall begins.
- The current generator still leans toward a rectangular residential shell with simplified roof/site modules, so it needs template retrieval, terrain shaping, and garden composition.

## Terrain Examples

${terrainExamples}

## Garden And Scene Examples

${gardenExamples}

## High Detail Examples

${highestDetail}

## Implementation Priorities

${corpus.gap_priorities.map((item, index) => `${index + 1}. ${item}`).join('\n')}
`;
}

function normalizeTemplateName(value) {
  return cleanTitle(value)
    .toLowerCase()
    .replace(/\s+-\s+\(mcbuild_org\)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value) {
  return stripKnownSuffix(String(value || '').replace(/\.(schematic|schem|litematic)$/i, '').trim());
}

function stripKnownSuffix(value) {
  return String(value || '').replace(/\s+-\s+\(mcbuild_org\)\s*$/i, '').trim();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeStringArray(item));
  if (value === undefined || value === null) return [];
  return String(value)
    .split(/[,，、\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRelativePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.?\//, '').trim();
}

function numberTag(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function updateBounds(bounds, x, y, z) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxY = Math.max(bounds.maxY, y);
  bounds.minZ = Math.min(bounds.minZ, z);
  bounds.maxZ = Math.max(bounds.maxZ, z);
}

function normalizeBounds(bounds) {
  if (bounds.minX === Infinity) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  return bounds;
}

function emptyCategoryCounts() {
  return {
    air: 0,
    earth: 0,
    rock: 0,
    wood: 0,
    glass: 0,
    water: 0,
    vegetation: 0,
    light: 0,
    fence: 0,
    stair: 0,
    slab: 0,
    opening: 0,
    decor: 0,
    other: 0
  };
}

function emptyInteriorSignalCounts() {
  return {
    storage: 0,
    bed: 0,
    books_library: 0,
    kitchen_work: 0,
    workshop: 0,
    textile: 0,
    wall_art: 0,
    potted_plant: 0,
    light_fixture: 0,
    seating_shape: 0,
    table_surface: 0,
    wet_fixture: 0,
    music_play: 0,
    ceremonial: 0,
    vertical_detail: 0,
    display_object: 0
  };
}

function interiorSignalCategories(block = {}) {
  const name = String(block.name || block.state || block.key || '').replace(/^minecraft:/, '');
  const category = block.category || '';
  const result = [];
  if (/(chest|barrel|shulker_box|hopper|dropper|dispenser)/.test(name)) result.push('storage');
  if (/_bed$|^bed$/.test(name)) result.push('bed', 'textile');
  if (/(bookshelf|lectern|enchanting_table|cartography_table)/.test(name)) result.push('books_library', 'display_object');
  if (/(furnace|smoker|blast_furnace|crafting_table|cake)/.test(name)) result.push('kitchen_work');
  if (/(anvil|smithing_table|grindstone|stonecutter|loom|fletching_table|brewing_stand)/.test(name)) result.push('workshop');
  if (/(carpet|wool|banner|curtain)/.test(name)) result.push('textile');
  if (/(banner|painting|skull|head)/.test(name)) result.push('wall_art', 'display_object');
  if (/(flower_pot|potted_)/.test(name)) result.push('potted_plant');
  if (category === 'light' || /(torch|lantern|candle|lamp|glowstone|sea_lantern|froglight|end_rod|beacon)/.test(name)) result.push('light_fixture');
  if (category === 'stair' || /stairs?$/.test(name)) result.push('seating_shape');
  if (category === 'slab' || /(slab|pressure_plate|trapdoor)/.test(name)) result.push('table_surface');
  if (/(cauldron|sink|basin)/.test(name)) result.push('wet_fixture');
  if (/(jukebox|note_block|bell)/.test(name)) result.push('music_play', 'display_object');
  if (/(candle|banner|lectern|bell|chain)/.test(name)) result.push('ceremonial');
  if (/(chain|iron_bars|fence|wall|pane|rod)/.test(name)) result.push('vertical_detail');
  if (/(decorated_pot|flower_pot|pot|skull|banner|beacon|end_rod)/.test(name)) result.push('display_object');
  return [...new Set(result)];
}

function normalizeInteriorSignals(signals, total) {
  const counts = Object.fromEntries(Object.entries(signals).map(([key, count]) => [key, count]));
  const totalHits = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const richness = Object.values(counts).filter((count) => count > 0).length;
  const strongSignalKeys = [
    'storage',
    'bed',
    'books_library',
    'kitchen_work',
    'workshop',
    'wall_art',
    'potted_plant',
    'light_fixture',
    'wet_fixture',
    'music_play',
    'ceremonial',
    'display_object'
  ];
  const strongHits = strongSignalKeys.reduce((sum, key) => sum + Number(counts[key] || 0), 0);
  const strongRichness = strongSignalKeys.filter((key) => Number(counts[key] || 0) > 0).length;
  const ratioValue = ratio(totalHits, total);
  const strongRatio = ratio(strongHits, total);
  return {
    counts,
    total_hits: totalHits,
    ratio: ratioValue,
    strong_hits: strongHits,
    strong_ratio: strongRatio,
    richness,
    strong_richness: strongRichness,
    furnished_likelihood: strongRatio > 0.012 || strongRichness >= 6 ? 'high' : strongRatio > 0.003 || strongRichness >= 3 ? 'medium' : 'low',
    dominant_signals: Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([signal, count]) => ({ signal, count, ratio: ratio(count, total) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  };
}

function normalizeCategoryRatios(categories, total) {
  return Object.fromEntries(Object.entries(categories).map(([key, count]) => [key, { count, ratio: ratio(count, total) }]));
}

function ratio(value, total) {
  return round(Number(value || 0) / Math.max(1, Number(total || 0)), 4);
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function stddev(values) {
  if (!values.length) return 0;
  const avg = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length, 3);
}

function minMax(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return min === Infinity ? undefined : { min, max };
}

function gardenSignal(categories, terrainRange, total) {
  const vegetationRatio = ratio(categories.vegetation, total);
  const waterRatio = ratio(categories.water, total);
  if (vegetationRatio > 0.045 && waterRatio > 0.005) return 'water-garden';
  if (vegetationRatio > 0.04) return 'planting-heavy';
  if (waterRatio > 0.02) return 'water-scene';
  if (terrainRange >= 4 && vegetationRatio > 0.01) return 'naturalized-terrain';
  return 'none';
}

function detailDensity(voxels) {
  const score = detailScore(voxels);
  if (score > 0.18) return 'high';
  if (score > 0.09) return 'medium';
  return 'low';
}

function detailScore(voxels) {
  return (voxels.detail_metrics.stair_slab_ratio || 0) +
    (voxels.detail_metrics.fence_ratio || 0) +
    (voxels.detail_metrics.light_ratio || 0) +
    (voxels.detail_metrics.decor_ratio || 0) +
    Math.min(0.08, voxels.detail_metrics.glass_ratio || 0);
}

function scaleBucket(nonAirBlocks) {
  if (nonAirBlocks > 60000) return 'monumental';
  if (nonAirBlocks > 20000) return 'large';
  if (nonAirBlocks > 6000) return 'medium';
  return 'compact';
}

function keywordHints(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .filter((item) => item.length >= 3)
    .slice(0, 16);
}

function groupCount(values) {
  return values.reduce((acc, value) => {
    const key = String(value || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function aggregateTopBlocks(templates) {
  const counts = {};
  for (const template of templates) {
    for (const block of template.analysis.top_blocks) {
      const key = block.key ?? String(block.id);
      counts[key] = (counts[key] || 0) + block.count;
    }
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, id: numericKey(key), name: blockName(key), count, category: blockCategory(key) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function exampleSummary(template) {
  const reasons = [];
  if (template.analysis.terrain.height_range >= 3) reasons.push(`terrain range ${template.analysis.terrain.height_range}`);
  if (template.analysis.block_categories.vegetation?.count) reasons.push(`${template.analysis.block_categories.vegetation.count} vegetation blocks`);
  if (template.analysis.block_categories.water?.count) reasons.push(`${template.analysis.block_categories.water.count} water blocks`);
  if (template.tags.length) reasons.push(template.tags.slice(0, 3).join(', '));
  return {
    file: template.file,
    title: template.title,
    reason: reasons.join('; ') || 'template signal'
  };
}

function blockName(value) {
  if (typeof value === 'string' && !/^\d+$/.test(value)) return stripBlockProperties(value);
  const id = Number(value);
  return OLD_BLOCK_NAMES[id] || `legacy_${id}`;
}

function stripBlockProperties(value) {
  return String(value || 'minecraft:air').replace(/\[.*\]$/, '');
}

function numericKey(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function extractTitle(html) {
  return decodeHtml(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || '').replace(/\s+/g, ' ').trim();
}

function extractDescription(html) {
  const meta = html.match(/<meta\s+[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i)?.[1];
  if (meta) return decodeHtml(meta).replace(/\s+/g, ' ').trim();
  const text = extractTextSample(html);
  const marker = text.toLowerCase().indexOf('description');
  return marker >= 0 ? text.slice(marker, marker + 500).trim() : text.slice(0, 300).trim();
}

function extractTextSample(html) {
  const text = decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
  return text.slice(0, 1400);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
