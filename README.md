# `bridge.send()` resolves `undefined` — minimal reproduction

`@quasar/app-vite@3.7.0` (and 3.5.0). One command:

```bash
npm install
npm test
```

Output:

```
AssertionError: expected undefined to be 3 // Object.is equality
 ❯ send.test.js:78:18
```

The test passes once the bug is fixed.

## What this runs

Quasar's own `BexBridge`, unmodified, imported straight from
`@quasar/app-vite/bex/private/bex-bridge`.

Vitest is used only because it is Vite-powered, so the module's build-time environment object
exists — the bridge reads `QUASAR_TARGET` off it at load time, which plain Node does not provide.
`vitest.config.js` inlines `@quasar/app-vite` for the same reason: Vitest externalises
`node_modules` by default, which would bypass the transform a real BEX build applies. Nothing else
about the reproduction depends on Vitest.

The only thing faked is the browser: a pair of in-process ports standing in for `chrome.runtime`
(`connect`, `onConnect`, `postMessage`, `onMessage`, `onDisconnect`, `lastError`) — the entire API
surface the bridge needs to join an `app` bridge to a `background` bridge. No extension to load, no
Chrome, no host app to build.

## The defect

`exports/bex/private/bex-bridge.js`, final statement of `async send()`:

```js
const { promise, resolve, reject } = Promise.withResolvers()
this.messageMap[id] = {
  portName: to,
  resolve: responsePayload => {
    delete this.messageMap[id]
    resolve(responsePayload)   // the responder's value arrives here…
  },
  reject: err => { /* … */ }
}

await promise                  // …and is discarded here
```

`await promise` is the last statement of an `async` function, so `send()` resolves `undefined`.

This contradicts the package's own contract. `types/bex/bridge.d.ts`:

```ts
send<T extends BexEventName>(
  options: { event: T; to: PortName } & BexPayload<T>
): Promise<BexEventResponse<T>>;
```

with the JSDoc example immediately above it:

```js
const result = await bridge.send({ event: 'sum', to: 'app', payload: { a: 1, b: 2 } });
console.log(result); // 3
```

Because the declared type is `Promise<BexEventResponse<T>>`, TypeScript reports nothing at the call
site — you get a correctly-typed value that is `undefined` at runtime, so it surfaces later as a
`TypeError` when a field is read off the response.

## The fix

Change that final statement to `return promise`. To confirm against this reproduction:

```bash
sed -i 's/    await promise/    return promise/' \
  node_modules/@quasar/app-vite/exports/bex/private/bex-bridge.js
npm test   # → 1 passed
```

Verified in a production BEX extension that carries this as a `patch-package` patch: with it, a
full end-to-end suite covering app ↔ background ↔ content-script messaging passes.
