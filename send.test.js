/**
 * Minimal reproduction: `BexBridge.send()` resolves `undefined`.
 *
 * Runs Quasar's own `BexBridge`, unmodified, from
 * `@quasar/app-vite/bex/private/bex-bridge`.
 *
 * Vitest is used only because it is Vite-powered, so `import.meta.env` exists — the bridge
 * module reads `import.meta.env.QUASAR_TARGET` at load time, which plain Node does not provide.
 * Nothing about the test depends on Vitest otherwise.
 *
 * The only thing faked is the browser: a pair of in-process ports standing in for
 * `chrome.runtime`, which is the whole API surface the bridge needs to connect an `app` bridge
 * to a `background` bridge.
 */
import {beforeAll, expect, test} from 'vitest';

/** Two ends of one channel: what `chrome.runtime.connect()` hands back on each side. */
function makePortPair(name) {
  const make = () => {
    const port = {
      name,
      _msg: [],
      _dc: [],
      postMessage(packet) {
        queueMicrotask(() => port._peer._msg.forEach(fn => fn(packet, port._peer)));
      },
      disconnect() {
        queueMicrotask(() => port._peer._dc.forEach(fn => fn(port._peer)));
      },
    };
    port.onMessage = {
      addListener: fn => port._msg.push(fn),
      removeListener: fn => (port._msg = port._msg.filter(x => x !== fn)),
    };
    port.onDisconnect = {
      addListener: fn => port._dc.push(fn),
      removeListener: fn => (port._dc = port._dc.filter(x => x !== fn)),
    };
    return port;
  };

  const a = make();
  const b = make();
  a._peer = b;
  b._peer = a;
  return [a, b];
}

beforeAll(() => {
  const onConnect = [];
  globalThis.chrome = {
    runtime: {
      lastError: undefined,
      onConnect: {addListener: fn => onConnect.push(fn)},
      connect: ({name}) => {
        const [clientPort, backgroundPort] = makePortPair(name);
        queueMicrotask(() => onConnect.forEach(fn => fn(backgroundPort)));
        return clientPort;
      },
    },
  };
});

test('send() resolves the responder return value, as types/bex/bridge.d.ts declares', async () => {
  const {BexBridge} = await import('@quasar/app-vite/bex/private/bex-bridge');

  const background = new BexBridge({type: 'background'});
  background.on('sum', ({payload}) => payload.a + payload.b);

  const app = new BexBridge({type: 'app'});
  await app.connectToBackground();

  const result = await app.send({event: 'sum', to: 'background', payload: {a: 1, b: 2}});

  // Declared: send(): Promise<BexEventResponse<T>>
  // JSDoc example: console.log(result); // 3
  // Actual: undefined — `send()` ends with `await promise`, discarding the value.
  expect(result).toBe(3);
});
