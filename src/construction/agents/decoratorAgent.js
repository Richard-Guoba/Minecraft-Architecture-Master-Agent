export class ConstructionDecoratorAgent {
  run(rooms, materials) {
    const suggestions = rooms
      .filter((room) => !['stairs', 'corridor', 'balcony'].includes(room.type))
      .map((room) => ({
        room_id: room.id,
        type: room.type,
        local_only: true,
        blocks: [
          { role: 'light', block: materials.lamp || 'minecraft:glowstone', placement: 'room-center-ceiling' },
          { role: 'furniture', block: materials.furniture || 'minecraft:bookshelf', placement: 'one-corner' }
        ]
      }));
    return {
      source: 'local-future-extension',
      enabled: false,
      note: 'Decoration is intentionally kept out of the core PDF workflow.',
      suggestions
    };
  }
}
