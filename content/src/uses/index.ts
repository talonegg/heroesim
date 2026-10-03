// The register of a Trait's uses (v1.1.4-S12, DL-150 item 14), and `docs/agents/traits.md`'s part
// written from it, as `@heroesim/content/uses`: the content editor (`tools/editor`) and its tests
// read it, and the game never does, since no front end may import a subpath (eslint.config.js).

export { docBegins, docEnds, generatedPart, registerDoc, withGeneratedPart } from './doc.js';
export { UseRefusal, type ContentChange, type ContentJson, type JsonPath } from './json.js';
export {
  contentEntries,
  engineEntriesOf,
  register,
  rulesFor,
  traitFiles,
  traitHelpers,
  usesOf,
  type AddedUse,
  type ContentEntry,
  type EngineEntry,
  type RegisterEntry,
  type SourcePlace,
  type TraitList,
  type TraitUse,
  type UseTarget,
} from './register.js';
