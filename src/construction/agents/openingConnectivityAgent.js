export class OpeningConnectivityAgent {
  run(prompt = '', architecture = {}, buildSpec = {}, topology = {}, shell = {}, layout = {}, facade = {}) {
    const rooms = Array.isArray(layout.rooms) ? layout.rooms : [];
    const doors = Array.isArray(layout.interiorDoors) ? layout.interiorDoors : [];
    const floorCount = Number(buildSpec.floors || 1);
    const frontSide = facade.front_side || architecture.facade_rules?.front_side || buildSpec.door_side || 'south';
    const largeEntry = /大门|双开门|宽门|门厅|玻璃门/.test(prompt) || buildSpec.scale === 'large' || architecture.facade_rules?.arches;
    const width = Math.max(Number(buildSpec.door_width || 1), largeEntry ? 2 : 1);
    const height = Math.max(Number(buildSpec.door_height || 2), architecture.facade_rules?.arches ? 4 : 2);

    return {
      source: 'local-opening-connectivity-agent',
      main_entry: {
        side: frontSide,
        width,
        height,
        target_room: selectEntryRoom(rooms)?.id || 'entry',
        strategy: architecture.facade_rules?.arches ? 'ceremonial-arched-entry' : 'direct-entry'
      },
      window_openings: plannedWindows(rooms, facade, buildSpec),
      interior_thresholds: doors.map((door) => ({
        kind: door.kind,
        floor: door.floor,
        axis: door.axis,
        connects: door.connects || [],
        source: door.source
      })),
      attached_links: doors.filter((door) => door.kind === 'attached-volume').map((door) => ({
        source: door.source,
        connects: door.connects || []
      })),
      vertical_openings: floorCount > 1 ? [{ floors: [0, floorCount - 1], strategy: 'stair-core-openings' }] : [],
      safety_clearances: {
        protect_modules: ['structural_frame', 'bracing', 'retaining_wall', 'foundation_anchor'],
        min_door_height: height,
        min_route_width: width >= 3 ? 2 : 1
      },
      engine_hints: {
        prefer_wide_entry: width >= 2,
        use_facade_side: frontSide,
        protect_structural_modules: true,
        planned_opening_count: 1 + doors.length + (floorCount > 1 ? floorCount - 1 : 0)
      }
    };
  }
}

function selectEntryRoom(rooms) {
  return rooms.find((room) => room.id === 'entry') ||
    rooms.find((room) => room.type === 'entry') ||
    rooms.find((room) => room.zone === 'public');
}

function plannedWindows(rooms, facade = {}, buildSpec = {}) {
  const highGlazing = facade.window_system?.glazing_ratio === 'high' || buildSpec.facade?.large_glass;
  const publicRooms = rooms
    .filter((room) => Number(room.floor || 0) === 0)
    .filter((room) => ['living', 'great_hall', 'lounge', 'sunroom', 'greenhouse', 'dining'].includes(room.type))
    .map((room) => room.id);
  return [{
    side: facade.front_side || buildSpec.door_side || 'south',
    priority_rooms: publicRooms,
    rhythm: facade.window_system?.rhythm || 'balanced',
    glazing_ratio: highGlazing ? 'high' : facade.window_system?.glazing_ratio || 'medium'
  }];
}
