# Changelog

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

