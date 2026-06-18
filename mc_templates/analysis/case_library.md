# Stage 7A/7B Template Case Library

Generated: 2026-06-18T15:40:03.744Z

## What This Stage Adds

Stage 7A/7B turns raw .schematic/.schem files into reusable case cards. Each card states what the reference may teach: site terrain, garden/water scenes, massing, facade depth, roof profile, spatial layout, interior furniture groups, and risk controls. It is meant to be read by later generation and review stages, not to copy a building block-for-block.

## Summary

- Cases: 64
- Source coverage: 56 with metadata / 56 with URL
- Semantic clauses: 1539
- Retrieval tokens: 367
- Import errors: 0
- Learning roles: terrain_base=58, furniture_group_reference=56, room_layout_reference=56, interior_reference=54, vertical_circulation_reference=54, garden_scene=47, landmark_presence=34, massing_silhouette=33, water_edge=32, library_study_reference=28, facade_detail=16, roof_eaves=3
- Feature counts: terrain_integrated=58, garden_scene=47, water_edge=32, furnished_interior=54, high_furniture_patterns=55, high_composition=64, high_detail=12
- Review flags: monumental-scale-normalize-before-use=13, missing-source-url=8, weak-text-metadata=8, arena-not-for-room-mining=6, non-residential-interior-noise=5, spatial-analysis-skipped=5, exterior-only-reference=2, exterior-edge-room-noise=1

## Best Overall References

- Japanese temple - (mcbuild_org) (Temples/Japanese temple - (mcbuild_org).schematic): score=91, feature=91. roles=furniture_group_reference/garden_scene/interior_reference/room_layout_reference/terrain_base flags=missing-source-url/weak-text-metadata
- Tavern (House/Tavern - (mcbuild_org).schematic): score=84, feature=84. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Beach Hotel (Buildings/Beach Hotel - (mcbuild_org).schematic): score=78, feature=78. roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference/water_edge
- Wood Modern House (House/Wood Modern House - (mcbuild_org).schematic): score=77, feature=77. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/terrain_base
- A Small Modern House (House/A Small Modern House - (mcbuild_org).schematic): score=76, feature=76. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Gotic castle (Castles/Gotic castle - (mcbuild_org).schematic): score=76, feature=76. roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base/vertical_circulation_reference
- Grand Hotel (Buildings/Grand Hotel - (mcbuild_org).schematic): score=74, feature=74. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Eiffel Tower (Tower/Eiffel Tower - (mcbuild_org).schematic): score=73, feature=73. roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference/water_edge
- Medieval Home (House/Medieval Home - (mcbuild_org).schematic): score=73, feature=73. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Medieval Spruce Wood House (House/Medieval Spruce Wood House - (mcbuild_org).schematic): score=73, feature=73. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Modern Apartment Building (Buildings/Modern Apartment Building - (mcbuild_org).schematic): score=73, feature=73. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Watermill (House/Watermill - (mcbuild_org).schematic): score=73, feature=73. roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base/vertical_circulation_reference

## Best Interior References

- Japanese temple - (mcbuild_org) (Temples/Japanese temple - (mcbuild_org).schematic): score=91, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/room_layout_reference/terrain_base flags=missing-source-url/weak-text-metadata
- Tavern (House/Tavern - (mcbuild_org).schematic): score=84, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Wood Modern House (House/Wood Modern House - (mcbuild_org).schematic): score=77, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/terrain_base
- A Small Modern House (House/A Small Modern House - (mcbuild_org).schematic): score=76, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Grand Hotel (Buildings/Grand Hotel - (mcbuild_org).schematic): score=74, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Medieval Home (House/Medieval Home - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Medieval Spruce Wood House (House/Medieval Spruce Wood House - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Modern Apartment Building (Buildings/Modern Apartment Building - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- LARGE 3 story Mansion (House/LARGE 3 story Mansion - (mcbuild_org).schematic): score=72, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Great Library (Buildings/Great Library  - (mcbuild_org).schematic): score=70, feature=100. roles=facade_detail/furniture_group_reference/interior_reference/library_study_reference/room_layout_reference
- Modern House #110 - (mcbuild_org) (House/Modern House #110 - (mcbuild_org).schematic): score=68, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference flags=missing-source-url/weak-text-metadata
- Great Pyramid (Buildings/Great Pyramid - (mcbuild_org).schematic): score=67, feature=100. roles=furniture_group_reference/interior_reference/library_study_reference/room_layout_reference/vertical_circulation_reference

## Best Site / Landscape References

- Japanese temple - (mcbuild_org) (Temples/Japanese temple - (mcbuild_org).schematic): score=91, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/room_layout_reference/terrain_base flags=missing-source-url/weak-text-metadata
- Tavern (House/Tavern - (mcbuild_org).schematic): score=84, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Beach Hotel (Buildings/Beach Hotel - (mcbuild_org).schematic): score=78, feature=100. roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference/water_edge
- Wood Modern House (House/Wood Modern House - (mcbuild_org).schematic): score=77, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/terrain_base
- A Small Modern House (House/A Small Modern House - (mcbuild_org).schematic): score=76, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Gotic castle (Castles/Gotic castle - (mcbuild_org).schematic): score=76, feature=100. roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base/vertical_circulation_reference
- Grand Hotel (Buildings/Grand Hotel - (mcbuild_org).schematic): score=74, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Eiffel Tower (Tower/Eiffel Tower - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference/water_edge
- Medieval Home (House/Medieval Home - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Medieval Spruce Wood House (House/Medieval Spruce Wood House - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Modern Apartment Building (Buildings/Modern Apartment Building - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Watermill (House/Watermill - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base/vertical_circulation_reference

## Best Whole-Composition References

- Japanese temple - (mcbuild_org) (Temples/Japanese temple - (mcbuild_org).schematic): score=91, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/room_layout_reference/terrain_base flags=missing-source-url/weak-text-metadata
- Tavern (House/Tavern - (mcbuild_org).schematic): score=84, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Beach Hotel (Buildings/Beach Hotel - (mcbuild_org).schematic): score=78, feature=100. roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference/water_edge
- Wood Modern House (House/Wood Modern House - (mcbuild_org).schematic): score=77, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/terrain_base
- A Small Modern House (House/A Small Modern House - (mcbuild_org).schematic): score=76, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Gotic castle (Castles/Gotic castle - (mcbuild_org).schematic): score=76, feature=100. roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base/vertical_circulation_reference
- Grand Hotel (Buildings/Grand Hotel - (mcbuild_org).schematic): score=74, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Eiffel Tower (Tower/Eiffel Tower - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/room_layout_reference/terrain_base/vertical_circulation_reference/water_edge
- Medieval Home (House/Medieval Home - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Medieval Spruce Wood House (House/Medieval Spruce Wood House - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Modern Apartment Building (Buildings/Modern Apartment Building - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/interior_reference/library_study_reference/room_layout_reference
- Watermill (House/Watermill - (mcbuild_org).schematic): score=73, feature=100. roles=furniture_group_reference/garden_scene/room_layout_reference/terrain_base/vertical_circulation_reference

## Import Errors

- 无

## How To Use

1. Keep adding curated files under mc_templates/<category>/.
2. Put optional source notes in data.txt, sidecar .txt files, or labels.jsonl when convenient.
3. Run npm run analyze:templates -- --offline to refresh this library.
4. Use case_library.json for retrieval and semantic_clauses.jsonl for prompt/runtime injection in later stages.
