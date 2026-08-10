'use strict';

// Phase 14C1B — regression coverage for the database startup gate: the
// server must never begin accepting HTTP requests before its initial
// MongoDB connection has succeeded (the Phase 14C1 root cause was exactly
// this race — see the Phase 14C1 report and server/lib/start-server.js's
// own doc comment). lib/start-server.js is fully dependency-injected and
// has no side effects of its own, so it's tested directly here with fake
// connect/listen/onConnectionError functions — no real network, database,
// or HTTP server involved. server.js itself still can't be required
// directly in a test process (same reason as always — see
// test/admin-route-auth.test.js and test/my-orders-session-resilience.
// test.js) so the final test below checks its actual onConnectionError
// wiring by reading the source, the same established pattern used
// elsewhere in this suite for page/route logic that can't be imported.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { startServer } = require('../lib/start-server');

test('listen() is not called until connect() resolves', async () => {
  let listenCalled = false;
  let resolveConnect;
  const connectPromise = new Promise((resolve) => {
    resolveConnect = resolve;
  });

  const startPromise = startServer({
    connect: () => connectPromise,
    listen: () => {
      listenCalled = true;
    },
    onConnectionError: () => {},
  });

  // Give any stray microtasks a chance to run — listen() must still not
  // have been called, since connect() has not resolved yet.
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(listenCalled, false, 'listen() must not run before connect() resolves');

  resolveConnect();
  const result = await startPromise;

  assert.equal(listenCalled, true);
  assert.deepEqual(result, { started: true });
});

test('a successful connection allows startup — listen() runs, onConnectionError does not', async () => {
  let listenCalled = false;
  const result = await startServer({
    connect: async () => {},
    listen: () => {
      listenCalled = true;
    },
    onConnectionError: () => {
      throw new Error('onConnectionError should not be called on success');
    },
  });

  assert.equal(listenCalled, true);
  assert.deepEqual(result, { started: true });
});

test('a failed initial connection prevents listen() from ever being called', async () => {
  let listenCalled = false;
  let errorHandlerCalled = false;
  const connectError = new Error('mongodb+srv://user:realpassword@cluster0.example.mongodb.net/db unreachable');

  const result = await startServer({
    connect: async () => {
      throw connectError;
    },
    listen: () => {
      listenCalled = true;
    },
    onConnectionError: (err) => {
      errorHandlerCalled = true;
      assert.equal(err, connectError);
    },
  });

  assert.equal(listenCalled, false, 'listen() must never run after a failed connection');
  assert.equal(errorHandlerCalled, true);
  assert.deepEqual(result, { started: false });
});

test('a synchronous throw from connect() takes the same failure path as a rejected promise', async () => {
  let listenCalled = false;
  const result = await startServer({
    connect: () => {
      throw new Error('sync failure');
    },
    listen: () => {
      listenCalled = true;
    },
    onConnectionError: () => {},
  });

  assert.equal(listenCalled, false);
  assert.deepEqual(result, { started: false });
});

test('connect() is attempted exactly once — no retry loop on failure', async () => {
  let connectCallCount = 0;
  await startServer({
    connect: async () => {
      connectCallCount += 1;
      throw new Error('fails');
    },
    listen: () => {},
    onConnectionError: () => {},
  });

  assert.equal(connectCallCount, 1);
});

test('listen() is attempted exactly once on success — never called twice', async () => {
  let listenCallCount = 0;
  await startServer({
    connect: async () => {},
    listen: () => {
      listenCallCount += 1;
    },
    onConnectionError: () => {},
  });

  assert.equal(listenCallCount, 1);
});

test('server.js: the real startup wiring gates app.listen() on the initial Mongo connection, never listens unconditionally', () => {
  const serverSource = readFileSync(path.join(__dirname, '../server.js'), 'utf8');

  assert.doesNotMatch(
    serverSource,
    /\n\s*app\.listen\(PORT,[\s\S]*?\}\);\s*\n\s*\}\);?\s*$/m,
  );
  assert.match(serverSource, /startServer\(\{/);
  assert.match(serverSource, /connect: \(\) => initialMongoConnection,/);
  assert.match(serverSource, /listen: \(\) => \{\s*\n\s*app\.listen\(PORT,/);
});

test('server.js: the real onConnectionError wiring never logs the raw error, its message, or MONGO_URI', () => {
  const serverSource = readFileSync(path.join(__dirname, '../server.js'), 'utf8');

  const wiringMatch = serverSource.match(/onConnectionError: \(\) => \{[\s\S]*?\n {2}\},\n\}\);/);
  assert.ok(wiringMatch, 'expected to find the onConnectionError wiring in server.js');
  const wiring = wiringMatch[0];

  // The callback deliberately takes no parameter at all — there is no way
  // for it to reference the underlying connection error even by mistake.
  assert.match(wiring, /onConnectionError: \(\) => \{/);
  assert.doesNotMatch(wiring, /err\.message/);
  assert.doesNotMatch(wiring, /MONGO_URI/);
  assert.doesNotMatch(wiring, /process\.env/);
  assert.match(wiring, /process\.exitCode = 1;/);
});
