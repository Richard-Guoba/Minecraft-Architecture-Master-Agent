import { CORE_EXTERIOR_DETAIL_KIT_IDS, exteriorBlockPaletteForFamily, exteriorDetailKitsForFamily } from './exteriorDetailKits.js';

export class FacadeAgent {
  run(prompt = '', architecture = {}, buildSpec = {}, topology = {}, materialPalette = {}, stylePreset = {}) {
    const family = String(architecture.style_family || buildSpec.style_family || 'general');
    const materials = materialPalette.materials || architecture.materials || {};
    const rules = architecture.facade_rules || {};
    const design = architecture.design_directives?.facade || {};
    const compositionStrategy = rules.template_composition_strategy ||
      architecture.generation_hints?.template_composition_strategy ||
      architecture.template_knowledge?.recommendations?.composition_strategy ||
      buildSpec.design?.template_composition_strategy ||
      {};
    const compositionDirectives = compositionStrategy.directives || {};
    const referenceReproduction = rules.reference_reproduction ||
      architecture.generation_hints?.reference_reproduction ||
      architecture.detail_rules?.reference_reproduction ||
      buildSpec.design?.reference_reproduction ||
      {};
    const referenceStrength = String(referenceReproduction.strength || 'low');
    const referenceBoost = Boolean(referenceReproduction.active && ['high', 'medium'].includes(referenceStrength));
    const highDetailReference = referenceReproduction.detail_targets?.detail_density === 'high' || referenceStrength === 'high';
    const designGlazing = design.glazing_ratio || buildSpec.facade?.glazing_ratio;
    const wide = Boolean(rules.large_glass || buildSpec.facade?.large_glass || designGlazing === 'high' || compositionDirectives.use_large_view_glass);
    const protectedOpenings = String(rules.glazing_ratio || designGlazing || buildSpec.facade?.glazing_ratio) === 'low';
    const neon = family === 'cyberpunk' || /霓虹|neon/i.test(prompt);
    const screen = Boolean(rules.screen || buildSpec.facade?.screens);
    const arches = Boolean(rules.arches || rules.pointed_arches || buildSpec.facade?.arches);
    const balcony = Boolean(rules.balcony || buildSpec.facade?.balcony || /阳台|露台|观景/.test(prompt) || (referenceBoost && compositionDirectives.use_waterfront_transition));
    const awning = Boolean(rules.awnings || /遮阳|雨棚|awning|shade/i.test(prompt)) || ['desert', 'mediterranean', 'coastal', 'tropical'].includes(family) || (highDetailReference && !['modern', 'industrial', 'cyberpunk'].includes(family));
    const flowerBoxes = Boolean(rules.flower_boxes || /花箱|窗台花|flower box|planter/i.test(prompt)) || ['victorian', 'classical', 'cottage'].includes(family) || (highDetailReference && ['rustic', 'alpine', 'nordic', 'classical'].includes(family));
    const serviceVents = Boolean(rules.service_vents) || family === 'industrial' || /通风|管线|风管|vent|service/i.test(prompt);
    const addressMarker = Boolean(rules.address_marker) || /门牌|信箱|招牌|标识|address|sign|mailbox/i.test(prompt) || neon;
    const privacyFins = Boolean(rules.privacy_fins || /百叶|隐私鳍片|privacy|fins/i.test(prompt)) || ['industrial', 'cyberpunk'].includes(family);
    const wallRelief = rules.wall_relief !== false || Boolean(compositionDirectives.use_facade_depth || referenceBoost);
    const windowSurrounds = rules.window_surrounds !== false;
    const entryDetail = rules.entry_detail !== false;
    const windowRhythm = design.window_rhythm || rules.template_facade_rhythm || compositionDirectives.preferred_facade_rhythm || rules.window_rhythm || rhythmForFamily(family, wide, protectedOpenings);
    const windowWidth = design.window_width || (wide ? 4 : protectedOpenings ? 1 : 2);
    const windowHeight = design.window_height || (wide ? 3 : 2);
    const windowSpacing = design.window_spacing || (wide ? 5 : protectedOpenings ? 8 : 6);
    const ornamentBudget = ornamentBudgetForFamily(family, { wide, protectedOpenings, prompt, windowWidth, windowSpacing, referenceBoost, highDetailReference });
    const exteriorDetailKits = exteriorDetailKitsForFamily(family, materials);
    const exteriorBlockPalette = exteriorBlockPaletteForFamily(family, materials);

    return {
      source: 'local-facade-agent',
      style_family: family,
      preset: stylePreset.id || 'none',
      front_side: rules.front_side || buildSpec.door_side || 'south',
      window_system: {
        rhythm: windowRhythm,
        glazing_ratio: protectedOpenings ? 'low' : wide ? 'high' : design.glazing_ratio || 'medium',
        width: windowWidth,
        height: windowHeight,
        spacing: windowSpacing,
        trim: materialPalette.materials?.accent || architecture.materials?.trim || 'minecraft:smooth_quartz',
        sill: materialPalette.materials?.roof_detail || architecture.materials?.trim || 'minecraft:smooth_quartz'
      },
      entry_system: {
        side: rules.front_side || buildSpec.door_side || 'south',
        type: arches ? rules.pointed_arches ? 'pointed-arch-entry' : 'arched-entry' : 'framed-entry',
        width: Number(buildSpec.door_width || 1),
        height: Number(buildSpec.door_height || 2),
        material: architecture.materials?.door || 'minecraft:dark_oak_door'
      },
      facade_elements: facadeElements({ family, screen, arches, balcony, neon, wide, protectedOpenings, awning, flowerBoxes, serviceVents, addressMarker, privacyFins, wallRelief, windowSurrounds, entryDetail, prompt }),
      exterior_detail_kits: exteriorDetailKits,
      exterior_block_palette: exteriorBlockPalette,
      exterior_detail_requirements: {
        strategy: 'quality-over-quantity',
        minimum_detail_types: 0,
        minimum_blocks_per_detail: 1,
        preferred_non_full_block_types: 'style-dependent',
        avoid_window_overlap: true,
        min_blank_wall_span_for_relief: ornamentBudget.min_blank_wall_span,
        skip_relief_when_window_gap_under: ornamentBudget.skip_gap_under,
        max_detail_blocks_per_window: ornamentBudget.max_detail_blocks_per_window,
        core_detail_types: CORE_EXTERIOR_DETAIL_KIT_IDS.slice(0, 3)
      },
      composition_strategy: {
        template_guidance: compositionStrategy,
        ornament_budget: ornamentBudget,
        blank_wall_policy: {
          place_relief_only_on_blank_bays: true,
          skip_when_clear_gap_below: ornamentBudget.skip_gap_under,
          prefer_edges_belts_and_corners: true
        },
        window_surround_policy: {
          pattern: design.window_surround_pattern || rules.window_surround_pattern || surroundPatternForFamily(family, wide, protectedOpenings),
          keep_glass_plane_clear: true,
          sill_and_lintel_first: true,
          side_jambs_need_clear_gap: 4,
          shutters_only_when_style_explicit: true
        },
        material_use_policy: {
          allow_full_catalog_for_prompted_accents: true,
          unusual_blocks_are_focal_accents: true,
          utility_blocks_cluster_in_service_zones: true
        },
        reference_reproduction: referenceReproduction,
        part_usage_policies: materialPalette.part_usage_policies || []
      },
      color_bands: colorBandsForFamily(family, materialPalette),
      facade_depth_layers: facadeDepthLayers({ awning, flowerBoxes, serviceVents, privacyFins, wide, wallRelief, windowSurrounds, entryDetail }),
      relief_density: design.relief_density || ornamentBudget.relief_density,
      window_surround_pattern: design.window_surround_pattern || rules.window_surround_pattern || surroundPatternForFamily(family, wide, protectedOpenings),
      entry_detail_style: design.entry_detail_style || rules.entry_detail_variant || 'framed-entry',
      creative_signature: architecture.design_directives?.signature || buildSpec.creative_design_signature || 'none',
      room_alignment: {
        public_rooms_to_glass: wide,
        private_rooms_to_screens: screen,
        entry_as_focal_point: true,
        outdoor_rooms_to_balcony: balcony,
        service_rooms_to_vents: serviceVents,
        private_rooms_to_privacy_fins: privacyFins
      },
      engine_hints: {
        render_window_trim: true,
        render_sills: !protectedOpenings,
        render_shutters: ['alpine', 'rustic', 'farmhouse', 'victorian'].includes(family),
        render_screens: screen,
        render_arch_details: arches,
        render_balcony_rail: balcony,
        render_neon_trim: neon,
        render_protected_slits: protectedOpenings,
        render_view_glass_frame: wide,
        render_awnings: awning,
        render_flower_boxes: flowerBoxes,
        render_service_vents: serviceVents,
        render_address_marker: addressMarker,
        render_privacy_fins: privacyFins,
        render_wall_relief: wallRelief && ornamentBudget.relief_density !== 'none',
        render_window_surrounds: windowSurrounds,
        render_entry_detail: entryDetail
      }
    };
  }
}

function facadeElements({ family, screen, arches, balcony, neon, wide, protectedOpenings, awning, flowerBoxes, serviceVents, addressMarker, privacyFins, wallRelief, windowSurrounds, entryDetail, prompt }) {
  const elements = ['window-trim', 'entry-frame'];
  if (screen) elements.push('screen-panels');
  if (arches) elements.push('archivolts');
  if (balcony) elements.push('balcony-rail');
  if (neon) elements.push('neon-trim', 'roof-sign');
  if (wide) elements.push('view-glass-frame');
  if (protectedOpenings) elements.push('protected-slit-windows');
  if (awning) elements.push('entry-awning', 'window-awnings');
  if (flowerBoxes) elements.push('flower-boxes');
  if (serviceVents) elements.push('service-vents');
  if (addressMarker) elements.push('address-marker');
  if (privacyFins) elements.push('privacy-fins');
  if (wallRelief) elements.push('wall-relief-panels');
  if (windowSurrounds) elements.push('window-surrounds');
  if (entryDetail) elements.push('entry-threshold-detail');
  if (/柱廊|柱|pilaster|column/i.test(prompt) || family === 'classical') elements.push('pilaster-rhythm');
  return [...new Set(elements)];
}

function facadeDepthLayers({ awning, flowerBoxes, serviceVents, privacyFins, wide, wallRelief, windowSurrounds, entryDetail }) {
  const layers = ['wall-plane', 'window-trim'];
  if (wallRelief) layers.push('relief-panel-layer');
  if (windowSurrounds) layers.push('window-surround-layer');
  if (entryDetail) layers.push('entry-detail-layer');
  if (wide) layers.push('deep-glass-frame');
  if (privacyFins) layers.push('screen-or-fin-layer');
  if (awning) layers.push('shade-canopy-layer');
  if (flowerBoxes) layers.push('planting-sill-layer');
  if (serviceVents) layers.push('service-utility-layer');
  return layers;
}

function rhythmForFamily(family, wide, protectedOpenings) {
  if (protectedOpenings) return 'small-protected';
  if (wide) return 'panoramic';
  if (family === 'gothic') return 'vertical';
  if (family === 'japanese' || family === 'chinese-courtyard') return 'screen-grid';
  if (family === 'industrial') return 'warehouse-grid';
  return 'balanced';
}

function ornamentBudgetForFamily(family, { wide, protectedOpenings, prompt, windowWidth, windowSpacing, referenceBoost = false, highDetailReference = false }) {
  const explicitOrnament = /浮雕|花纹|雕花|柱廊|外饰|装饰|ornament|relief|pilaster/i.test(prompt);
  const clearGap = Math.max(0, Number(windowSpacing || 0) - Number(windowWidth || 0));
  const denseFamilies = ['classical', 'gothic', 'victorian', 'chinese-courtyard'];
  const naturalFamilies = ['treehouse', 'tropical', 'rustic', 'alpine', 'japanese'];
  const serviceFamilies = ['industrial', 'cyberpunk'];
  const low = wide || family === 'modern' || clearGap < 4;
  const reliefDensity = highDetailReference
    ? 'high'
    : referenceBoost && !wide
      ? 'medium'
      : explicitOrnament || denseFamilies.includes(family)
    ? 'medium'
    : serviceFamilies.includes(family)
      ? 'low'
      : naturalFamilies.includes(family)
        ? 'organic-low'
        : low ? 'low' : 'medium';
  return {
    relief_density: protectedOpenings ? 'low' : reliefDensity,
    min_blank_wall_span: highDetailReference ? 3 : low ? 5 : 4,
    skip_gap_under: 4,
    max_detail_blocks_per_window: highDetailReference ? 6 : low ? 2 : denseFamilies.includes(family) ? 5 : 3,
    clear_gap: clearGap,
    focus: explicitOrnament ? 'prompted-ornament' : low ? 'edges-and-entry' : 'blank-bay-layering'
  };
}

function surroundPatternForFamily(family, wide, protectedOpenings) {
  if (protectedOpenings) return 'protected-slit-frame';
  if (wide || family === 'modern' || family === 'futuristic') return 'minimal-sill-lintel';
  if (family === 'gothic') return 'vertical-tracery-lite';
  if (family === 'japanese' || family === 'chinese-courtyard') return 'screen-edge';
  if (family === 'treehouse' || family === 'tropical') return 'organic-wood-sill';
  return 'sill-lintel-with-optional-jambs';
}

function colorBandsForFamily(family, materialPalette = {}) {
  const materials = materialPalette.materials || {};
  if (family === 'cyberpunk') return [{ role: 'neon-line', block: materials.neon || 'minecraft:sea_lantern' }];
  if (family === 'coastal') return [{ role: 'aqua-trim', block: materials.accent || 'minecraft:dark_prismarine' }];
  if (family === 'gothic') return [{ role: 'light-stone-tracery', block: materials.accent || 'minecraft:smooth_quartz' }];
  return [{ role: 'window-trim', block: materials.accent || 'minecraft:smooth_quartz' }];
}
