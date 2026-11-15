# 3D body model

`male_base_mesh.glb` is the "3D Male Base Mesh" from
https://github.com/BoQsc/Godot-3D-Male-Base-Mesh (file `Original/male_base_mesh.glb`), a reupload of
https://orange-juice-games.itch.io/male-base-mesh.

- **Licence:** CC0 1.0 Universal (public domain dedication). No attribution is required; it is credited anyway on the Citations page.
- **Downloaded:** 2026-11-14, unmodified. SHA-256 `206cb651484baf9aaa29a030a38feecbe29575c3e1cbd820a58fa343c2ae14c4`.
- **Contents:** one low-poly mesh (1,226 vertices) with a skeleton, no textures and no animations.

The app uses the skeleton only to decide which body region each vertex belongs to
(see `src/components/bodyRegions.ts`).

## Anatomy models

`anatomy-male.glb` and `anatomy-female.glb` are from the npm package `open-anatomy-3d` v0.1.0
(https://github.com/MervinR07/open-anatomy-3d), copied unmodified on 2026-11-14.

- **Licence:** CC BY 4.0 (models and structure catalogue). Credit is required and is on the Citations page:
  Anatomy: BodyParts3D © The Database Center for Life Science (CC BY 4.0); female organs: Human Reference
  Atlas 3D Reference Organs, HuBMAP (CC BY 4.0); female body: MakeHuman (CC0). Modified by open-anatomy-3d, CC BY 4.0.
- **SHA-256:** male `25248bef02f0ca43eedbd25231f8b6f9681865a57016f9d5e352d407407336c7`,
  female `2eee011f8cb7a189af0757f5e287754e84276dd084faeb2daca45572942f4ce2`.
- **Contents:** one mesh per named structure (skin, skeleton, muscles, organs, vessels, nerves), compressed
  with meshopt. `src/components/anatomyStructures.ts` is generated from the package's `catalog.json`.
- The models are for education and visualisation, not diagnosis.
