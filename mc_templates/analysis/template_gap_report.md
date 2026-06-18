# MC Template Corpus Gap Report

Generated: 2026-06-18T13:42:36.708Z

## Corpus

- Templates: 64
- Categories: Arenas=6, Buildings=7, Castles=8, House=30, Temples=6, Tower=7
- Styles: classical=8, general=9, modern=17, gothic=3, desert=2, medieval=13, fantasy=1, coastal=4, japanese=7
- Typologies: arena=6, public-building=6, temple=6, castle=8, house=30, tower=8
- Average size: 105 x 66 x 103
- Terrain-integrated templates: 58 (91%)
- Garden/scene templates: 47 (73%)
- Water-edge templates: 32

## What The Reference Buildings Do Better

- They often make the site part of the building: cliffs, caves, raised plinths, islands, paths, courtyards, water edges, trees, and foreground scenery are part of the composition.
- They use many small blocks for depth: stairs, slabs, fences, walls, panes, lights, vines, and plants create readable layers on roofs, walls, entries, and gardens.
- Their silhouettes are specific: towers taper, pagodas stack, castles use turrets and buttresses, modern builds use horizontal glass bands, and temples use strong axes.
- The foreground is designed: paths, gates, hedges, rocks, water, plazas, and planting beds frame the building before the wall begins.
- The current generator still leans toward a rectangular residential shell with simplified roof/site modules, so it needs template retrieval, terrain shaping, and garden composition.

## Terrain Examples

- Amphitheatre Arena: terrain range 48; 16040 vegetation blocks; 1333 water blocks; landscape-composition, terrain-integrated
- Colosseum: terrain range 35; 24091 vegetation blocks; 36 water blocks; formal-axis, landscape-composition, terrain-integrated
- Skywars Lobby: terrain range 19; 1461 vegetation blocks; 124 water blocks; landscape-composition, terrain-integrated, water-edge
- Tennis Court: terrain range 10; 580 water blocks; landscape-composition, rail-and-fence-detail, terrain-integrated
- The Colosseum - (mcbuild_org): terrain range 35; 24091 vegetation blocks; 36 water blocks; formal-axis, landscape-composition, terrain-integrated
- Beach Hotel: terrain range 99; 2 vegetation blocks; 600 water blocks; furnished-interior, glass-emphasis, layered-interior
- Futuristic Building: terrain range 92; 1562 vegetation blocks; 197 water blocks; landscape-composition, large-glass-or-panel-grid, layered-interior
- Giant Church: terrain range 21; 89527 water blocks; furnished-interior, landscape-composition, layered-interior
- Grand Hotel: terrain range 37; 3113 vegetation blocks; 3190 water blocks; furnished-interior, glass-emphasis, landscape-composition
- Great Pyramid: terrain range 10; 23 vegetation blocks; 264 water blocks; furnished-interior, layered-interior, terrain-integrated

## Garden And Scene Examples

- Amphitheatre Arena: terrain range 48; 16040 vegetation blocks; 1333 water blocks; landscape-composition, terrain-integrated
- Colosseum: terrain range 35; 24091 vegetation blocks; 36 water blocks; formal-axis, landscape-composition, terrain-integrated
- Skywars Lobby: terrain range 19; 1461 vegetation blocks; 124 water blocks; landscape-composition, terrain-integrated, water-edge
- Tennis Court: terrain range 10; 580 water blocks; landscape-composition, rail-and-fence-detail, terrain-integrated
- The Colosseum - (mcbuild_org): terrain range 35; 24091 vegetation blocks; 36 water blocks; formal-axis, landscape-composition, terrain-integrated
- Futuristic Building: terrain range 92; 1562 vegetation blocks; 197 water blocks; landscape-composition, large-glass-or-panel-grid, layered-interior
- Giant Church: terrain range 21; 89527 water blocks; furnished-interior, landscape-composition, layered-interior
- Grand Hotel: terrain range 37; 3113 vegetation blocks; 3190 water blocks; furnished-interior, glass-emphasis, landscape-composition
- Modern Apartment Building: terrain range 40; 776 vegetation blocks; 24 water blocks; furnished-interior, landscape-composition, large-glass-or-panel-grid
- Disney Fort: terrain range 174; 15977 vegetation blocks; 84906 water blocks; furnished-interior, landscape-composition, layered-interior

## High Detail Examples

- Small_Medium Castle: detail=high, tags=furnished-interior, layered-interior, micro-block-detailing, rail-and-fence-detail, stone-massing
- Japanese temple - (mcbuild_org): detail=high, tags=furnished-interior, landscape-composition, layered-eaves, layered-interior, micro-block-detailing, rail-and-fence-detail, terrain-integrated, vertical-icon, water-edge
- A Small Modern House: detail=high, tags=furnished-interior, glass-emphasis, landscape-composition, large-glass-or-panel-grid, layered-interior, micro-block-detailing, terrain-integrated
- Great Library: detail=high, tags=furnished-interior, glass-emphasis, layered-interior, micro-block-detailing, rail-and-fence-detail, vertical-icon
- Wood Modern House: detail=high, tags=furnished-interior, landscape-composition, large-glass-or-panel-grid, layered-interior, micro-block-detailing, rail-and-fence-detail, terrain-integrated
- Market with the villagers: detail=high, tags=furnished-interior, landscape-composition, layered-interior, micro-block-detailing, rail-and-fence-detail, terrain-integrated
- Tavern: detail=high, tags=furnished-interior, landscape-composition, layered-interior, micro-block-detailing, rail-and-fence-detail, terrain-integrated, vertical-icon
- Watermill: detail=high, tags=furnished-interior, landscape-composition, layered-interior, micro-block-detailing, rail-and-fence-detail, terrain-integrated, water-edge
- Dark Mansion: detail=high, tags=furnished-interior, landscape-composition, layered-interior, micro-block-detailing, terrain-integrated
- Amphitheatre Arena: detail=high, tags=landscape-composition, terrain-integrated

## Implementation Priorities

1. replace flat-lot assumption with terrain-aware bases
2. compose foreground gardens, paths, rocks, vegetation, and water as a scene
3. learn style-specific roof silhouettes and eave layering
4. increase facade depth with trims, stairs/slabs, columns, rails, and relief
5. support large public/monument typologies beyond single residential shells
