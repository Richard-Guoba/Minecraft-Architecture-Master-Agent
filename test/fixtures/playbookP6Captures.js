import { P6_PROTOCOL_FILE_HASHES, P6_VIEW_IDS, P6_VISUAL_SETTINGS } from '../../src/playbook/p6/constants.js';
import { sha256 } from '../../src/playbook/shadow/canonical.js';

export const P6_CAPTURE_SOLUTION_IDS = Object.freeze([
  'playbook-candidate-01',
  'playbook-candidate-02',
  'playbook-candidate-03',
  'baseline-current'
]);

export function createP6CaptureInputs() {
  const cohort = {
    input_sha256: p6CaptureHash('cohort-input'),
    manifest: {
      schema_version: 1,
      protocol_version: '0.1.0',
      cohort_id: 'p6-v0.1',
      request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
      visual_settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
      solutions: P6_CAPTURE_SOLUTION_IDS.map((solution_id, index) => ({
        solution_id,
        playbook_mode: index === 3 ? 'off' : 'execute',
        slot_index: index === 3 ? 0 : index + 1,
        root_seed: 424242,
        prompt_sha256: p6CaptureHash('prompt'),
        blueprint_sha256: p6CaptureHash(`blueprint-${index}`),
        operation_list_sha256: p6CaptureHash(`operations-${index}`),
        build_function_sha256: p6CaptureHash(`build-${index}`),
        hard_qa_ok: true,
        minecraft_version: '1.21.9'
      }))
    }
  };
  const cameraManifests = cohort.manifest.solutions.map((solution, solutionIndex) => ({
    schema_version: 1,
    protocol_version: '0.1.0',
    solution_id: solution.solution_id,
    blueprint_sha256: solution.blueprint_sha256,
    build_function_sha256: solution.build_function_sha256,
    request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
    settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
    bounds: { min_x: 0, min_y: 4, min_z: 0, max_x: 20, max_y: 18, max_z: 14 },
    main_entry: { center_x: '10.000000', center_y: '5.000000', center_z: '14.000000', facing: 'south' },
    views: P6_VIEW_IDS.map((view_id, viewIndex) => ({
      view_id,
      purpose: [
        'principal-facade-hierarchy', 'side-facade-depth', 'volume-attachment-roof-silhouette',
        'opposite-volume-relationship', 'roof-composition-footprint', 'approach-scale-entrance-legibility'
      ][viewIndex],
      horizontal_fov_degrees: 70,
      framing_multiplier: '1.000000',
      position: { x: `${10 + solutionIndex}.000000`, y: `${20 + viewIndex}.000000`, z: `${30 + viewIndex}.000000` },
      target: { x: '10.000000', y: '10.000000', z: '7.000000' },
      ...(view_id === 'entry-eye' ? { entry_offset_blocks: 8 } : {})
    }))
  }));
  return { cohort, cameraManifests, settings: P6_VISUAL_SETTINGS };
}

export function p6CapturePngHeader(width = 1920, height = 1080) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

export function p6CaptureHash(value) { return sha256(String(value)); }
