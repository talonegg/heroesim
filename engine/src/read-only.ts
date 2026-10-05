// The World State as a module's hook sees it (M8-S2, ADR-0005, DL-77): read-only, all the way down,
// in the types and at run time. A module changes a core table only through its `effects`, which
// run the core's own rules, so the core stays the only writer of its rows; a module that assigns
// to the World State directly, `world.heroes[id].morale = 0`, throws, and the Turn fails naming it
// (the frozen-world test, module-hooks.test.ts).
//
// The view is a Proxy over the Turn's copy, not a frozen copy of it: a module reads the world as
// it stands, an effect it applied a moment ago included, and nothing is copied. Each object is
// viewed through one Proxy, so a view reads equal to itself. With no module installed no view is
// ever made.

/** `T` read-only all the way down: every property `readonly`, every list a `ReadonlyArray`. */
export type ReadonlyDeep<T> = T extends string | number | boolean | bigint | symbol | null | undefined
  ? T
  : T extends readonly (infer Item)[]
    ? readonly ReadonlyDeep<Item>[]
    : { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> };

/**
 * `value` seen read-only: reading it, and every object reached from it, reads the value itself;
 * setting, defining or deleting a property of any of them, or changing its prototype or
 * extensibility, throws a TypeError naming `what` and the property. A method reached through it
 * (an array's `map`, `push`) runs on the view, so it reads and refuses as the view does. A property
 * read through its descriptor (`Object.getOwnPropertyDescriptor`, `Reflect`'s, or
 * `Object.getOwnPropertyDescriptors`) holds the view of its value too, so no route of reading hands
 * back the object behind a view (M8 verification, DL-80).
 *
 * A property its object has frozen is read as it is, since a Proxy may not hand back anything
 * else for it. What is frozen is frozen all the way down, so nothing reached that way can be
 * written either: in the rules, `defaultConfig`; in the World State, the write-once rows the
 * per-Turn copy shares, frozen by it (ADR-0011, DL-203).
 */
export function readOnlyView<T extends object>(value: T, what: string): ReadonlyDeep<T> {
  const views = new WeakMap<object, object>();
  const refuse = (key: string | symbol): never => {
    throw new TypeError(`${what} is read-only to a module: it cannot change ${String(key)}`);
  };
  /** Whether a property holding an object must be handed back as it is: a Proxy's invariant. */
  const frozen = (own: PropertyDescriptor | undefined): boolean =>
    own !== undefined && own.configurable === false && own.writable === false;
  const handler: ProxyHandler<object> = {
    get(target, key) {
      const inner: unknown = Reflect.get(target, key);
      if (typeof inner !== 'object' || inner === null) return inner;
      if (frozen(Reflect.getOwnPropertyDescriptor(target, key))) return inner;
      return viewOf(inner);
    },
    getOwnPropertyDescriptor(target, key) {
      const own = Reflect.getOwnPropertyDescriptor(target, key);
      if (own === undefined || !('value' in own) || frozen(own)) return own;
      const inner: unknown = own.value;
      if (typeof inner !== 'object' || inner === null) return own;
      return { ...own, value: viewOf(inner) };
    },
    set: (_target, key) => refuse(key),
    defineProperty: (_target, key) => refuse(key),
    deleteProperty: (_target, key) => refuse(key),
    setPrototypeOf: () => refuse('its prototype'),
    preventExtensions: () => refuse('its extensibility'),
  };
  const viewOf = (target: object): object => {
    let view = views.get(target);
    if (view === undefined) {
      view = new Proxy(target, handler);
      views.set(target, view);
    }
    return view;
  };
  return viewOf(value) as ReadonlyDeep<T>;
}
