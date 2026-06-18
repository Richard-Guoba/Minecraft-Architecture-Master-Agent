export class FacadeAgent {
  run(prompt = '', architecture = {}, buildSpec = {}, topology = {}, materialPalette = {}, stylePreset = {}) {
    const family = String(architecture.style_family || buildSpec.style_family || 'general');
    const rules = architecture.facade_rules || {};
    const wide = Boolean(rules.large_glass || buildSpec.facade?.large_glass);
    const protectedOpenings = String(rules.glazing_ratio || buildSpec.facade?.glazing_ratio) === 'low';
    const neon = family === 'cyberpunk' || /霓虹|neon/i.test(prompt);
    const screen = Boolean(rules.screen || buildSpec.facade?.screens);
    const arches = Boolean(rules.arches || rules.pointed_arches || buildSpec.facade?.arches);
    const balcony = Boolean(rules.balcony || buildSpec.facade?.balcony || /阳台|露台|观景/.test(prompt));
    const awning = Boolean(rules.awnings || /遮阳|雨棚|awning|shade/i.test(prompt)) || ['desert', 'mediterranean', 'coastal'].includes(family);
    const flowerBoxes = Boolean(rules.flower_boxes || /花箱|窗台花|flower box|planter/i.test(prompt)) || ['victorian', 'classical', 'cottage'].includes(family);
    const serviceVents = Boolean(rules.service_vents) || family === 'industrial' || /通风|管线|风管|vent|service/i.test(prompt);
    const addressMarker = Boolean(rules.address_marker) || /门牌|信箱|招牌|标识|address|sign|mailbox/i.test(prompt) || neon || buildSpec.scale === 'large';
    const privacyFins = Boolean(rules.privacy_fins || /百叶|格栅|隐私|privacy|fins/i.test(prompt)) || screen;

    return {
      source: 'local-facade-agent',
      style_family: family,
      preset: stylePreset.id || 'none',
      front_side: rules.front_side || buildSpec.door_side || 'south',
      window_system: {
        rhythm: rules.window_rhythm || rhythmForFamily(family, wide, protectedOpenings),
        glazing_ratio: protectedOpenings ? 'low' : wide ? 'high' : 'medium',
        width: wide ? 4 : protectedOpenings ? 1 : 2,
        height: wide ? 3 : 2,
        spacing: wide ? 5 : protectedOpenings ? 8 : 6,
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
      facade_elements: facadeElements({ family, screen, arches, balcony, neon, wide, protectedOpenings, awning, flowerBoxes, serviceVents, addressMarker, privacyFins, prompt }),
      color_bands: colorBandsForFamily(family, materialPalette),
      facade_depth_layers: facadeDepthLayers({ awning, flowerBoxes, serviceVents, privacyFins, wide }),
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
        render_privacy_fins: privacyFins
      }
    };
  }
}

function facadeElements({ family, screen, arches, balcony, neon, wide, protectedOpenings, awning, flowerBoxes, serviceVents, addressMarker, privacyFins, prompt }) {
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
  if (/柱廊|柱|pilaster|column/i.test(prompt) || family === 'classical') elements.push('pilaster-rhythm');
  return [...new Set(elements)];
}

function facadeDepthLayers({ awning, flowerBoxes, serviceVents, privacyFins, wide }) {
  const layers = ['wall-plane', 'window-trim'];
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

function colorBandsForFamily(family, materialPalette = {}) {
  const materials = materialPalette.materials || {};
  if (family === 'cyberpunk') return [{ role: 'neon-line', block: materials.neon || 'minecraft:sea_lantern' }];
  if (family === 'coastal') return [{ role: 'aqua-trim', block: materials.accent || 'minecraft:dark_prismarine' }];
  if (family === 'gothic') return [{ role: 'light-stone-tracery', block: materials.accent || 'minecraft:smooth_quartz' }];
  return [{ role: 'window-trim', block: materials.accent || 'minecraft:smooth_quartz' }];
}
