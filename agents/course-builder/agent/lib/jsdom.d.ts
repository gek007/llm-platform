// The one piece of jsdom that lib/mermaid-validate.ts uses; jsdom ships no types and the full
// @types/jsdom package is not worth a dependency for it.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    readonly window: Window & typeof globalThis;
  }
}
