# Stage 5A Template Case Index

Generated: 2026-06-19T04:31:03.439Z

## What This Stage Means

Stage 5A does not copy buildings. It combines metadata, block statistics, schematic spatial scans, mined room furniture-group patterns, and whole-composition grammar to decide what each reference is allowed to teach the generator: interior rooms, furniture clusters, facade, massing, terrain, garden, water edge, roof profile, approach sequence, or only metadata. Risky cases are kept, but tagged so later stages do not learn the wrong thing from them.

## Summary

- Cases indexed: 64
- Study priorities: low=12, high=15, medium=37
- Learning roles: terrain_base=58, furniture_group_reference=56, room_layout_reference=56, interior_reference=54, vertical_circulation_reference=54, garden_scene=47, landmark_presence=34, massing_silhouette=33, water_edge=32, library_study_reference=28, facade_detail=16, roof_eaves=3
- Room candidates: living=50, entry_or_lobby=40, bedroom=36, corridor_or_gallery=28, study=28, kitchen=23, storage=20, workshop=18, bathroom=16, tower_room=16, chapel_or_ceremonial_hall=7
- Review flags: monumental-scale-normalize-before-use=13, missing-source-url=8, weak-text-metadata=8, arena-not-for-room-mining=6, non-residential-interior-noise=5, spatial-analysis-skipped=5, exterior-only-reference=2, exterior-edge-room-noise=1
- High-priority room-mining cases: 40
- Site learning-ready cases: 58
- Spatial scans analyzed: 56
- Cases with spatial room components: 56
- Spatial room components: 1810 total, 1584 high-confidence
- Spatial room adjacencies: 646
- Pattern-mining-ready spatial cases: 52 (48 high)
- Furniture-group cases: 56
- Furniture groups: 4377 total, 4040 high-confidence
- Furniture-pattern-ready cases: 52 (52 high)
- Furniture pattern types: social_cluster=1431, circulation_spine=1125, layered_lighting=648, storage_wall=357, display_wall=296, plant_corner=187, library_focus_wall=172, kitchen_work_wall=65, wet_wall=44, workshop_bench_wall=38, sleep_niche=14
- Composition grammar analyzed: 64
- Composition-ready cases: 64 (64 high)
- Massing grammar: stepped_terraces=63, terrain_plinth=59, vertical_landmark=59, waterfront_deck_massing=48, compact_block=37, balanced_axis=35, courtyard_or_void=11, asymmetric_wings=10, long_bar=4
- Approach grammar: stepped_terrain_arrival=59, waterfront_transition=48, garden_forecourt=47, central_axis_entry=35, landmark_reveal=25, porch_or_threshold_layer=24
- Facade grammar: formal_symmetry=35, micro_depth_trim=23, large_glass_bands=20, vertical_slots=19, rail_balcony_edges=15, lit_depth_points=12
- Roof grammar: tower_cap=58, stepped_roofline=52, deep_overhang_edges=19, layered_eaves=16, flat_terrace_or_platform=10
- Site grammar: foreground_scene=63, rock_earth_plinth=63, layered_terrain_base=59, tree_shrub_clusters=54, water_edge=48, garden_rooms=47

## Best Room-Mining Candidates

- Japanese temple - (mcbuild_org) (Temples/Japanese temple - (mcbuild_org).schematic): score=91, rooms=entry_or_lobby/chapel_or_ceremonial_hall/workshop/storage, roles=furniture_group_reference/garden_scene/interior_reference/room_layout_reference, spatial=high/46, furniture=high/114, flags=missing-source-url/weak-text-metadata, phase2=high
- Tavern (House/Tavern - (mcbuild_org).schematic): score=84, rooms=bedroom/entry_or_lobby/study/kitchen/living, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/10, furniture=high/55, phase2=high
- Wood Modern House (House/Wood Modern House - (mcbuild_org).schematic): score=77, rooms=entry_or_lobby/bedroom/study/kitchen/living, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=medium/3, furniture=high/16, phase2=medium
- A Small Modern House (House/A Small Modern House - (mcbuild_org).schematic): score=76, rooms=bedroom/entry_or_lobby/study/kitchen/living, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/5, furniture=high/26, phase2=high
- Grand Hotel (Buildings/Grand Hotel - (mcbuild_org).schematic): score=74, rooms=kitchen/living/storage/study/corridor_or_gallery, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/176, furniture=high/626, phase2=high
- Modern Apartment Building (Buildings/Modern Apartment Building - (mcbuild_org).schematic): score=73, rooms=entry_or_lobby/kitchen/living/study/bathroom, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/26, furniture=high/60, phase2=high
- Medieval Home (House/Medieval Home - (mcbuild_org).schematic): score=73, rooms=study/entry_or_lobby/corridor_or_gallery/living/storage, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/42, furniture=high/184, phase2=high
- Medieval Spruce Wood House (House/Medieval Spruce Wood House - (mcbuild_org).schematic): score=73, rooms=bedroom/corridor_or_gallery/entry_or_lobby/workshop/study, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/10, furniture=high/34, phase2=high
- LARGE 3 story Mansion (House/LARGE 3 story Mansion - (mcbuild_org).schematic): score=72, rooms=corridor_or_gallery/living/storage/study/bedroom, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/32, furniture=high/77, phase2=high
- Great Library (Buildings/Great Library  - (mcbuild_org).schematic): score=70, rooms=bedroom/entry_or_lobby/living/study/bathroom, roles=facade_detail/furniture_group_reference/interior_reference/library_study_reference, spatial=high/12, furniture=high/49, phase2=high
- Modern House #110 - (mcbuild_org) (House/Modern House #110 - (mcbuild_org).schematic): score=68, rooms=bedroom/entry_or_lobby/living/study/kitchen, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/6, furniture=high/34, flags=missing-source-url/weak-text-metadata, phase2=high
- Great Pyramid (Buildings/Great Pyramid - (mcbuild_org).schematic): score=67, rooms=entry_or_lobby/workshop/living/study/kitchen, roles=furniture_group_reference/interior_reference/library_study_reference/room_layout_reference, spatial=high/10, furniture=high/29, phase2=high
- Colonial Mansion 1 (House/Colonial Mansion 1 - (mcbuild_org).schematic): score=65, rooms=entry_or_lobby/workshop/living/study/kitchen, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/17, furniture=high/52, phase2=high
- Big minecraft modern house (House/Big minecraft modern house - (mcbuild_org).schematic): score=62, rooms=chapel_or_ceremonial_hall/entry_or_lobby/living/storage/bedroom, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/9, furniture=high/32, phase2=high
- Dream Survival House (House/Dream Survival House - (mcbuild_org).schematic): score=62, rooms=study/kitchen/living/bedroom/storage, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=medium/4, furniture=high/28, phase2=medium
- Modern House 10 (House/Modern House 10 - (mcbuild_org).schematic): score=62, rooms=kitchen/study/living/corridor_or_gallery/bedroom, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/17, furniture=high/51, phase2=high

## Best Site And Landscape References

- Japanese temple - (mcbuild_org) (Temples/Japanese temple - (mcbuild_org).schematic): score=91, rooms=entry_or_lobby/chapel_or_ceremonial_hall/workshop/storage, roles=furniture_group_reference/garden_scene/interior_reference/room_layout_reference, spatial=high/46, furniture=high/114, flags=missing-source-url/weak-text-metadata
- Tavern (House/Tavern - (mcbuild_org).schematic): score=84, rooms=bedroom/entry_or_lobby/study/kitchen/living, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/10, furniture=high/55
- Beach Hotel (Buildings/Beach Hotel - (mcbuild_org).schematic): score=78, rooms=study/storage/entry_or_lobby/living/bedroom, roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference, spatial=high/185, furniture=high/590
- Wood Modern House (House/Wood Modern House - (mcbuild_org).schematic): score=77, rooms=entry_or_lobby/bedroom/study/kitchen/living, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=medium/3, furniture=high/16
- Gotic castle (Castles/Gotic castle - (mcbuild_org).schematic): score=76, rooms=entry_or_lobby/living/tower_room/workshop, roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base, spatial=high/34, furniture=high/67
- A Small Modern House (House/A Small Modern House - (mcbuild_org).schematic): score=76, rooms=bedroom/entry_or_lobby/study/kitchen/living, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/5, furniture=high/26
- Grand Hotel (Buildings/Grand Hotel - (mcbuild_org).schematic): score=74, rooms=kitchen/living/storage/study/corridor_or_gallery, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/176, furniture=high/626
- Modern Apartment Building (Buildings/Modern Apartment Building - (mcbuild_org).schematic): score=73, rooms=entry_or_lobby/kitchen/living/study/bathroom, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/26, furniture=high/60
- Medieval Home (House/Medieval Home - (mcbuild_org).schematic): score=73, rooms=study/entry_or_lobby/corridor_or_gallery/living/storage, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/42, furniture=high/184
- Medieval Spruce Wood House (House/Medieval Spruce Wood House - (mcbuild_org).schematic): score=73, rooms=bedroom/corridor_or_gallery/entry_or_lobby/workshop/study, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/10, furniture=high/34
- Watermill (House/Watermill - (mcbuild_org).schematic): score=73, rooms=bathroom/corridor_or_gallery/entry_or_lobby/living/bedroom, roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base, spatial=high/6, furniture=high/21
- Eiffel Tower (Tower/Eiffel Tower - (mcbuild_org).schematic): score=73, rooms=living/kitchen/tower_room, roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference, spatial=high/48, furniture=high/66

## Best Facade / Detail References

- Great Library (Buildings/Great Library  - (mcbuild_org).schematic): score=70, rooms=bedroom/entry_or_lobby/living/study/bathroom, roles=facade_detail/furniture_group_reference/interior_reference/library_study_reference, spatial=high/12, furniture=high/49
- Japanese temple - (mcbuild_org) (Temples/Japanese temple - (mcbuild_org).schematic): score=91, rooms=entry_or_lobby/chapel_or_ceremonial_hall/workshop/storage, roles=furniture_group_reference/garden_scene/interior_reference/room_layout_reference, spatial=high/46, furniture=high/114, flags=missing-source-url/weak-text-metadata
- Wood Modern House (House/Wood Modern House - (mcbuild_org).schematic): score=77, rooms=entry_or_lobby/bedroom/study/kitchen/living, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=medium/3, furniture=high/16
- Tavern (House/Tavern - (mcbuild_org).schematic): score=84, rooms=bedroom/entry_or_lobby/study/kitchen/living, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/10, furniture=high/55
- A Small Modern House (House/A Small Modern House - (mcbuild_org).schematic): score=76, rooms=bedroom/entry_or_lobby/study/kitchen/living, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/5, furniture=high/26
- Market with the villagers (House/Market with the villagers - (mcbuild_org).schematic): score=72, rooms=entry_or_lobby/living/bedroom, roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base, spatial=high/7, furniture=high/22
- Watermill (House/Watermill - (mcbuild_org).schematic): score=73, rooms=bathroom/corridor_or_gallery/entry_or_lobby/living/bedroom, roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base, spatial=high/6, furniture=high/21
- Small_Medium Castle (Castles/Small_Medium Castle - (mcbuild_org).schematic): score=58, rooms=entry_or_lobby/kitchen/storage/tower_room/workshop, roles=furniture_group_reference/interior_reference/room_layout_reference/vertical_circulation_reference, spatial=medium/10, furniture=high/32, flags=exterior-edge-room-noise
- Medieval Spruce Wood House (House/Medieval Spruce Wood House - (mcbuild_org).schematic): score=73, rooms=bedroom/corridor_or_gallery/entry_or_lobby/workshop/study, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/10, furniture=high/34
- The Sky City of Athalux - (mcbuild_org) (Temples/The Sky City of Athalux - (mcbuild_org).schematic): score=46, roles=garden_scene/terrain_base/facade_detail/landmark_presence, spatial=skip/0, furniture=skip/0, flags=exterior-only-reference/missing-source-url/monumental-scale-normalize-before-use/weak-text-metadata
- Modern House #110 - (mcbuild_org) (House/Modern House #110 - (mcbuild_org).schematic): score=68, rooms=bedroom/entry_or_lobby/living/study/kitchen, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, spatial=high/6, furniture=high/34, flags=missing-source-url/weak-text-metadata
- Dark Mansion (House/Dark Mansion - (mcbuild_org).schematic): score=67, rooms=entry_or_lobby/living/bedroom, roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base, spatial=high/10, furniture=high/25

## Cases Needing Care

- Japanese temple - (mcbuild_org) (Temples/Japanese temple - (mcbuild_org).schematic): score=91, rooms=entry_or_lobby/chapel_or_ceremonial_hall/workshop/storage, roles=furniture_group_reference/garden_scene/interior_reference/room_layout_reference, flags=missing-source-url/weak-text-metadata
- Tower of Gods - (mcbuild_org) (Temples/Tower of Gods - (mcbuild_org).schematic): score=72, rooms=entry_or_lobby/chapel_or_ceremonial_hall/tower_room, roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference, flags=missing-source-url/weak-text-metadata
- Parthenon Spawn - (mcbuild_org) (Temples/Parthenon Spawn - (mcbuild_org).schematic): score=71, rooms=entry_or_lobby/living/corridor_or_gallery/chapel_or_ceremonial_hall/bathroom, roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base, flags=missing-source-url/weak-text-metadata
- Big Ben - (mcbuild_org) (Tower/Big Ben - (mcbuild_org).schematic): score=71, rooms=entry_or_lobby/living/corridor_or_gallery/tower_room, roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference, flags=missing-source-url/weak-text-metadata
- Modern House #110 - (mcbuild_org) (House/Modern House #110 - (mcbuild_org).schematic): score=68, rooms=bedroom/entry_or_lobby/living/study/kitchen, roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference, flags=missing-source-url/weak-text-metadata
- Ninja House (House/Ninja House - (mcbuild_org).schematic): score=63, rooms=corridor_or_gallery/living/storage/study/bedroom, roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference, flags=monumental-scale-normalize-before-use
- Luxurious Cove House (House/Luxurious Cove House - (mcbuild_org).schematic): score=62, rooms=living/storage/study/corridor_or_gallery/bathroom, roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base, flags=monumental-scale-normalize-before-use
- Mega Mansion (House/Mega Mansion - (mcbuild_org).schematic): score=59, rooms=entry_or_lobby/living/corridor_or_gallery/study/bedroom, roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base, flags=monumental-scale-normalize-before-use
- Disney Fort (Castles/Disney Fort - (mcbuild_org).schematic): score=58, rooms=study/tower_room, roles=garden_scene/terrain_base/water_edge/landmark_presence, flags=monumental-scale-normalize-before-use/spatial-analysis-skipped
- Small_Medium Castle (Castles/Small_Medium Castle - (mcbuild_org).schematic): score=58, rooms=entry_or_lobby/kitchen/storage/tower_room/workshop, roles=furniture_group_reference/interior_reference/room_layout_reference/vertical_circulation_reference, flags=exterior-edge-room-noise
- Medieval Castle 3 (Castles/Medieval Castle 3 - (mcbuild_org).schematic): score=56, rooms=study/kitchen/tower_room/bathroom/workshop, roles=garden_scene/terrain_base/water_edge/interior_reference, flags=monumental-scale-normalize-before-use/spatial-analysis-skipped
- Medieval Castle_1 (Castles/Medieval Castle_1 - (mcbuild_org).schematic): score=56, rooms=study/kitchen/tower_room/bathroom/workshop, roles=garden_scene/terrain_base/water_edge/interior_reference, flags=monumental-scale-normalize-before-use/spatial-analysis-skipped
- Modern Hospital (Tower/Modern Hospital - (mcbuild_org).schematic): score=56, rooms=entry_or_lobby/living/corridor_or_gallery/tower_room/bathroom, roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base, flags=monumental-scale-normalize-before-use
- Hogwarts Castle (Castles/Hogwarts Castle - (mcbuild_org).schematic): score=53, rooms=kitchen/tower_room, roles=terrain_base/water_edge/landmark_presence/massing_silhouette, flags=spatial-analysis-skipped
- Sandstone Mansion (House/Sandstone Mansion - (mcbuild_org).schematic): score=51, rooms=entry_or_lobby/living/corridor_or_gallery/bedroom, roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference, flags=monumental-scale-normalize-before-use
- Medieval Castle (Castles/Medieval Castle - (mcbuild_org).schematic): score=50, rooms=entry_or_lobby/living/corridor_or_gallery/tower_room, roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference, flags=exterior-only-reference

## Next Actions

1. use phase 3 furniture groups as decorator guidance for high/medium readiness templates
2. prefer pattern clauses with high-confidence anchors before adding generic decorative clutter
3. treat arena and unfinished-shell cases as exterior/site references unless manually approved
4. use learnable_areas to decide whether a template teaches interior, facade, terrain, garden, or silhouette
5. use phase 5 composition grammar to bias massing, approach sequence, facade rhythm, roof profile, and site layout
