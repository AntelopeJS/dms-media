# Changelog

## v0.4.0

[compare changes](https://github.com/AntelopeJS/dms-media/compare/interface-v0.3.3...v0.4.0)

### 🔥 Performance

- **dms-media:** Read only the counted fields of each asset for the library tree ([#164](https://github.com/AntelopeJS/dms-media/pull/164))

### 🩹 Fixes

- **dms-media:** Key declared folders by a fixed id so two processes write one row ([#170](https://github.com/AntelopeJS/dms-media/pull/170))
- **dms-media:** Check the shape of stored JSON columns when reading them ([#171](https://github.com/AntelopeJS/dms-media/pull/171))
- **dms-media:** Key imported assets by a fixed id so two processes write one row ([#173](https://github.com/AntelopeJS/dms-media/pull/173))
- **dms-media:** Key binding folders by a fixed id so two processes write one row ([#174](https://github.com/AntelopeJS/dms-media/pull/174))
- **dms-media:** Name the dms 0.20 components the layer renders ([#177](https://github.com/AntelopeJS/dms-media/pull/177))

### 💅 Refactors

- **dms-media:** Name the Explorer block by the name the DMS serves it under ([#169](https://github.com/AntelopeJS/dms-media/pull/169))
- **dms-media:** Derive declared ids with the shared fixedId ([#175](https://github.com/AntelopeJS/dms-media/pull/175))

### 📦 Build

- **deps:** Move to @antelopejs/tooling-configs 0.5.0 ([#163](https://github.com/AntelopeJS/dms-media/pull/163))
- **deps:** Bump @antelopejs/tooling-configs to 0.5.1 ([#166](https://github.com/AntelopeJS/dms-media/pull/166))
- **playground:** Mark the playground package private ([#167](https://github.com/AntelopeJS/dms-media/pull/167))
- **dms-media:** ⚠️  Move to interface-dms 0.14, dms 0.20 and the rest of the released line ([#176](https://github.com/AntelopeJS/dms-media/pull/176))

### 🏡 Chore

- **release:** @antelopejs/dms-media v0.7.2 ([b606035](https://github.com/AntelopeJS/dms-media/commit/b606035))
- **release:** @antelopejs/dms-media v0.7.3 ([4ea8504](https://github.com/AntelopeJS/dms-media/commit/4ea8504))

### ✅ Tests

- **dms-media:** Split test callbacks over the function length limit ([#168](https://github.com/AntelopeJS/dms-media/pull/168))

### 🤖 CI

- Run the CI on Windows through ci-node.yml ([#172](https://github.com/AntelopeJS/dms-media/pull/172))

#### ⚠️ Breaking Changes

- **dms-media:** ⚠️  Move to interface-dms 0.14, dms 0.20 and the rest of the released line ([#176](https://github.com/AntelopeJS/dms-media/pull/176))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.3.3

[compare changes](https://github.com/AntelopeJS/dms-media/compare/interface-v0.3.2...v0.3.3)

### 🚀 Enhancements

- **skills:** Add the verify-dms-media verification skill ([#113](https://github.com/AntelopeJS/dms-media/pull/113))

### 🔥 Performance

- **verify:** Detect the dashboard's hydration under its wrapper div ([#145](https://github.com/AntelopeJS/dms-media/pull/145))

### 🩹 Fixes

- **test:** Pin the test stacks' modules and install them from committed lock records ([#146](https://github.com/AntelopeJS/dms-media/pull/146))
- **verify:** Wait for the Activity page to hydrate before checking Live ([#159](https://github.com/AntelopeJS/dms-media/pull/159))
- **playground:** Build against one interface-dms copy ([#149](https://github.com/AntelopeJS/dms-media/pull/149))
- **docs:** Document GET /api/media/previews?ids= and check the HTTP surface against the routes ([#150](https://github.com/AntelopeJS/dms-media/pull/150))
- **history:** List every event of a file, not the latest 50 ([#156](https://github.com/AntelopeJS/dms-media/pull/156))
- **media:** Refuse moving a file onto a name the target folder holds ([#158](https://github.com/AntelopeJS/dms-media/pull/158))
- **upload:** Store an image over 32 MiB without its size instead of refusing it ([#148](https://github.com/AntelopeJS/dms-media/pull/148))
- **dms-media:** Refuse moving a file into a linked folder whose field does not take its type ([#157](https://github.com/AntelopeJS/dms-media/pull/157))
- **picker:** Send a linked field's picker uploads and drops to its linked folder ([#152](https://github.com/AntelopeJS/dms-media/pull/152))
- **dms-media:** Name the real publicBaseUrl default in its TSDoc ([#147](https://github.com/AntelopeJS/dms-media/pull/147))
- **uploads:** Show a batch finished elsewhere in Recent batches while Live ([#151](https://github.com/AntelopeJS/dms-media/pull/151))

### 📖 Documentation

- Sync the README with the released interface version ([#137](https://github.com/AntelopeJS/dms-media/pull/137))
- **extending:** Say the size example falls back to a private photo ([#155](https://github.com/AntelopeJS/dms-media/pull/155))
- **verify:** Drop the details drawer known finding now that dms 0.19.0 fixes it ([#160](https://github.com/AntelopeJS/dms-media/pull/160))
- **dms-media:** Name PHP among the types allowedMimetypes never admits ([#154](https://github.com/AntelopeJS/dms-media/pull/154))
- **readme:** Open with the AntelopeJS DMS module kit ([#162](https://github.com/AntelopeJS/dms-media/pull/162))

### 📦 Build

- **deps:** Bump @antelopejs packages to the 2026-11-06 releases ([#142](https://github.com/AntelopeJS/dms-media/pull/142))
- **deps:** Bump @antelopejs/dms to 0.18.2 and drop verify publish ([#161](https://github.com/AntelopeJS/dms-media/pull/161))

### 🏡 Chore

- Remove the .amp directory ([#138](https://github.com/AntelopeJS/dms-media/pull/138))
- **verify:** Remove seeded runs from the verification skill ([#139](https://github.com/AntelopeJS/dms-media/pull/139))
- **ci:** Remove the weekly mutation caller ([#140](https://github.com/AntelopeJS/dms-media/pull/140))

### 🤖 CI

- Call ci-node.yml@v1 ([#141](https://github.com/AntelopeJS/dms-media/pull/141))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.3.2

[compare changes](https://github.com/AntelopeJS/dms-media/compare/interface-v0.3.1...v0.3.2)

### 🚀 Enhancements

- **frontend:** Enforce the backend boundary in production builds ([#81](https://github.com/AntelopeJS/dms-media/pull/81))

### 🩹 Fixes

- Read media previews with GET in bounded batches ([#95](https://github.com/AntelopeJS/dms-media/pull/95))
- **playground:** Declare the frontend, and build against one file-storage interface ([#75](https://github.com/AntelopeJS/dms-media/pull/75))
- **media:** Use the core API error presenter ([#104](https://github.com/AntelopeJS/dms-media/pull/104))

### 💅 Refactors

- Clean up the tests, comments, types and oversize files ([#79](https://github.com/AntelopeJS/dms-media/pull/79))
- **amp:** Narrow the forwarded location header with a JSDoc type guard ([#82](https://github.com/AntelopeJS/dms-media/pull/82))
- Clear the residual ratchet findings ([#84](https://github.com/AntelopeJS/dms-media/pull/84))

### 📖 Documentation

- **changelog:** Breaking changes of interface-dms-media 0.3.1 and dms-media 0.6.1 ([#74](https://github.com/AntelopeJS/dms-media/pull/74))
- **readme:** Link the DMS in the opening line ([#98](https://github.com/AntelopeJS/dms-media/pull/98))
- **readme:** Use one Discord invite ([#96](https://github.com/AntelopeJS/dms-media/pull/96))
- **github:** Send questions and ideas to Discord ([#108](https://github.com/AntelopeJS/dms-media/pull/108))

### 📦 Build

- **deps:** Bump @antelopejs/tooling-configs to 0.2.17 ([#83](https://github.com/AntelopeJS/dms-media/pull/83))

### 🏡 Chore

- **release:** @antelopejs/dms-media v0.6.1 ([f6d2140](https://github.com/AntelopeJS/dms-media/commit/f6d2140))
- Adopt the guardrail pack from tooling-configs 0.2.0 ([#76](https://github.com/AntelopeJS/dms-media/pull/76))
- Configure Renovate with the shared preset ([#77](https://github.com/AntelopeJS/dms-media/pull/77))
- **release:** @antelopejs/dms-media v0.6.2 ([977a1c3](https://github.com/AntelopeJS/dms-media/commit/977a1c3))
- **release:** @antelopejs/dms-media v0.7.0 ([86890be](https://github.com/AntelopeJS/dms-media/commit/86890be))
- Land the cleanup campaign on main ([#133](https://github.com/AntelopeJS/dms-media/pull/133))
- **release:** @antelopejs/dms-media v0.7.1 ([82636ac](https://github.com/AntelopeJS/dms-media/commit/82636ac))
- Land the cleanup campaign on main ([#136](https://github.com/AntelopeJS/dms-media/pull/136))

### ✅ Tests

- **skills:** Add eval cases for the dms-media skills ([#78](https://github.com/AntelopeJS/dms-media/pull/78))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.3.1

[compare changes](https://github.com/AntelopeJS/dms-media/compare/interface-v0.3.0...interface-v0.3.1)

### ⚠️ Breaking changes

This patch release contains breaking changes. Ranges such as `>=0.3.0 <0.4.0` or `^0.3.0` resolve to it.

- `RetireMediaDeclaration` and `PruneMediaDeclarations` are removed, together with `MediaDeclarationRetirement`, `MediaDeclarationPrune`, `MediaRetirementResult`, `MediaRetirementStatus` and `MediaContentKind`. Declared content is written once and then belongs to the members: nothing takes it back ([#72](https://github.com/AntelopeJS/dms-media/pull/72)).
- `MediaAssetDeclaration.version` is removed: a file declared before is never rewritten.
- `MediaDeclarationStatus` is now `"created" | "kept"`, and `MediaDeclarationResult.id` is always set.
- Call `EnsureMediaFolder` and `ImportMediaAsset` from a `Hook.TENANT_BEING_PROVISIONED` handler, which the DMS fires once per tenant when it is created.

### Requirements

- Implemented by `@antelopejs/dms-media` 0.6.1, which requires `@antelopejs/dms` 0.11 (`>=0.11.0 <1.0.0`) and the renderer `@antelopejs/dms-frontend` 0.9 (`>=0.9.0 <0.10.0`).
- Peer `@antelopejs/interface-dms` `>=0.9.0 <1.0.0`.

### 🚀 Enhancements

- **frontend:** The frontend registration as a pure function, declared as dmsFrontend ([#66](https://github.com/AntelopeJS/dms-media/pull/66))
- **media:** Open the live pages on the DMS page toolbar ([#59](https://github.com/AntelopeJS/dms-media/pull/59))
- **frontend:** Open the narrow explorer's details in the DMS drawer ([#63](https://github.com/AntelopeJS/dms-media/pull/63))

### 🩹 Fixes

- **frontend:** Run on @antelopejs/dms-frontend 0.7 ([#62](https://github.com/AntelopeJS/dms-media/pull/62))
- **media:** Load image size previews through the dashboard origin ([#58](https://github.com/AntelopeJS/dms-media/pull/58))
- **media:** Render the media blocks with the page, no layout shift ([#60](https://github.com/AntelopeJS/dms-media/pull/60))
- Read and write stored files through the storage, not its public URL ([#68](https://github.com/AntelopeJS/dms-media/pull/68))

### 💅 Refactors

- **declared:** Write declared content once, at tenant provisioning ([#72](https://github.com/AntelopeJS/dms-media/pull/72))

### 📖 Documentation

- **media:** Align compatibility guidance for the 0.5 release ([d35b1c2](https://github.com/AntelopeJS/dms-media/commit/d35b1c2))
- Clarify learning paths and illustrate real outcomes ([#57](https://github.com/AntelopeJS/dms-media/pull/57))
- **faq:** Upload through the dashboard when the backend is private ([#65](https://github.com/AntelopeJS/dms-media/pull/65))

### 📦 Build

- **media:** Align implemented interface with the 0.3 release ([96d4a6f](https://github.com/AntelopeJS/dms-media/commit/96d4a6f))
- Run on @antelopejs/dms 0.10 and @antelopejs/dms-frontend 0.8 ([#71](https://github.com/AntelopeJS/dms-media/pull/71))
- Run on @antelopejs/dms 0.11, interface-dms 0.9 and dms-frontend 0.9 ([#73](https://github.com/AntelopeJS/dms-media/pull/73))

### 🏡 Chore

- **release:** @antelopejs/dms-media v0.5.0 ([65194cf](https://github.com/AntelopeJS/dms-media/commit/65194cf))
- **release:** @antelopejs/dms-media v0.5.1 ([4bbbc36](https://github.com/AntelopeJS/dms-media/commit/4bbbc36))
- **release:** @antelopejs/dms-media v0.6.0 ([40bbfce](https://github.com/AntelopeJS/dms-media/commit/40bbfce))

### ✅ Tests

- Render secret for dms 0.10, api 1.4.0 and core 1.17.0 in the test stack ([#70](https://github.com/AntelopeJS/dms-media/pull/70))

### 🤖 CI

- Add the ubuntu job required by the branch rulesets ([#61](https://github.com/AntelopeJS/dms-media/pull/61))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Maxime Westhoven ([@mwesto](http://github.com/mwesto))

## v0.3.0

[compare changes](https://github.com/AntelopeJS/dms-media/compare/interface-v0.2.2...v0.3.0)

### 🚀 Enhancements

- Declare media folders and files from backend code ([#56](https://github.com/AntelopeJS/dms-media/pull/56))

### 📦 Build

- Include shipped frontend in contributor workspace ([#53](https://github.com/AntelopeJS/dms-media/pull/53))

### 🏡 Chore

- **release:** @antelopejs/dms-media v0.4.1 ([8cfa0df](https://github.com/AntelopeJS/dms-media/commit/8cfa0df))

### ❤️ Contributors

- Maxime Westhoven <maxime@altab.be>
- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.2

[compare changes](https://github.com/AntelopeJS/dms-media/compare/interface-v0.2.1...v0.2.2)

### 🚀 Enhancements

- ⚠️  Migrate to DMS 0.9 and renderer 0.6 ([#48](https://github.com/AntelopeJS/dms-media/pull/48))

### 💅 Refactors

- **frontend:** Leave the editor's image sizes to the browser with server: false ([#49](https://github.com/AntelopeJS/dms-media/pull/49))

### 📖 Documentation

- Add user guide, screenshots and dms-media skill ([#45](https://github.com/AntelopeJS/dms-media/pull/45))
- Streamline agent guidance ([#50](https://github.com/AntelopeJS/dms-media/pull/50))
- Establish the media consumer reference ([#51](https://github.com/AntelopeJS/dms-media/pull/51))
- Make dense guide sections easier to scan ([#52](https://github.com/AntelopeJS/dms-media/pull/52))

### 📦 Build

- **deps:** Require @antelopejs/interface-dms-media 0.2.1 ([#44](https://github.com/AntelopeJS/dms-media/pull/44))

### 🏡 Chore

- **release:** @antelopejs/dms-media v0.3.1 ([320ac3b](https://github.com/AntelopeJS/dms-media/commit/320ac3b))
- **release:** @antelopejs/dms-media v0.4.0 ([aea0224](https://github.com/AntelopeJS/dms-media/commit/aea0224))
- Prepare media interface 0.2.2 release ([#54](https://github.com/AntelopeJS/dms-media/pull/54))

#### ⚠️ Breaking Changes

- ⚠️  Migrate to DMS 0.9 and renderer 0.6 ([#48](https://github.com/AntelopeJS/dms-media/pull/48))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.2.1

[compare changes](https://github.com/AntelopeJS/dms-media/compare/interface-v0.2.0...v0.2.1)

### 📦 Build

- **deps:** Require @antelopejs/interface-dms-media 0.2.0 ([#41](https://github.com/AntelopeJS/dms-media/pull/41))
- **deps:** Bump DMS to 0.8.0 and interface-dms to 0.6.0 ([#43](https://github.com/AntelopeJS/dms-media/pull/43))

### 🏡 Chore

- **release:** @antelopejs/dms-media v0.3.0 ([9d670ea](https://github.com/AntelopeJS/dms-media/commit/9d670ea))

### 🤖 CI

- Speed up pipeline ([#42](https://github.com/AntelopeJS/dms-media/pull/42))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms-media/compare/interface-v0.1.0...v0.2.0)

### 🚀 Enhancements

- **media:** ⚠️  Redesign the media library as a DMS module on DMS 0.7 ([#38](https://github.com/AntelopeJS/dms-media/pull/38))

### 🏡 Chore

- **release:** @antelopejs/dms-media v0.2.0 ([67d7f83](https://github.com/AntelopeJS/dms-media/commit/67d7f83))

#### ⚠️ Breaking Changes

- **media:** ⚠️  Redesign the media library as a DMS module on DMS 0.7 ([#38](https://github.com/AntelopeJS/dms-media/pull/38))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

