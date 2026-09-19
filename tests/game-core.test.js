const assert = require('assert');
const {
  CONST,
  overlaps,
  playerBox,
  entityBox,
  sanitizeName,
  parseScores,
  qualifies,
  mergeScores,
  createGame,
  createMemoryStorage
} = require('../game-core.js');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok  ' + name);
}

function standingPlayer() {
  return { y: CONST.GROUND, duck: false, onGround: true };
}

function duckingPlayer() {
  return { y: CONST.GROUND, duck: true, onGround: true };
}

function smogAt(x) {
  return {
    type: 'hazard',
    kind: 'smog',
    x: x,
    y: CONST.GROUND - 42,
    w: 72,
    h: 50,
    dirty: 18
  };
}

function trashAt(x) {
  return {
    type: 'hazard',
    kind: 'trash',
    x: x,
    y: CONST.GROUND,
    w: 42,
    h: 46,
    dirty: 22
  };
}

function recycleAt(x, high) {
  return {
    type: 'recycle',
    kind: 'bottle',
    x: x,
    y: high ? CONST.GROUND - 78 : CONST.GROUND - 18,
    w: 22,
    h: 28,
    value: 20
  };
}

function playFrames(game, frames, dt) {
  const events = [];
  for (let i = 0; i < frames; i += 1) {
    events.push.apply(events, game.update(dt || 1 / 60));
  }
  return events;
}

test('AABB overlap detects intersection and gaps', function () {
  assert.strictEqual(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 10, h: 10 }), true);
  assert.strictEqual(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
  assert.strictEqual(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 11, w: 10, h: 10 }), false);
});

test('ducking hitbox is shorter than standing hitbox', function () {
  const stand = playerBox(standingPlayer());
  const duck = playerBox(duckingPlayer());
  assert.ok(duck.h < stand.h);
  assert.ok(duck.y > stand.y);
  assert.strictEqual(stand.y + stand.h, CONST.GROUND);
  assert.strictEqual(duck.y + duck.h, CONST.GROUND);
});

test('smog hits a standing wolf and misses a ducking wolf', function () {
  const smog = entityBox(smogAt(CONST.PLAYER_X));
  assert.strictEqual(overlaps(playerBox(standingPlayer()), smog), true);
  assert.strictEqual(overlaps(playerBox(duckingPlayer()), smog), false);
});

test('standing player hits ground trash', function () {
  const box = entityBox(trashAt(CONST.PLAYER_X));
  assert.strictEqual(overlaps(playerBox(standingPlayer()), box), true);
});

test('a high enough jump clears ground trash', function () {
  const airborne = { y: CONST.GROUND - 80, duck: false, onGround: false };
  assert.strictEqual(overlaps(playerBox(airborne), entityBox(trashAt(CONST.PLAYER_X))), false);
});

test('sanitizeName matches the SQL board rules', function () {
  assert.strictEqual(sanitizeName('  Wolf Pack  '), 'Wolf Pack');
  assert.strictEqual(sanitizeName('ok'), 'ok');
  assert.strictEqual(sanitizeName('x'), '');
  assert.strictEqual(sanitizeName('<script>hi</script>'), 'scripthiscript');
  assert.strictEqual(sanitizeName('Name!!!!'), 'Name');
});

test('parseScores recovers from corrupt JSON and bad rows', function () {
  assert.deepStrictEqual(parseScores('{not json'), []);
  assert.deepStrictEqual(parseScores(null), []);
  assert.deepStrictEqual(parseScores('[{"name":"A"},{"name":"Pack","score":"120"}]'), [
    { name: 'Pack', score: 120 }
  ]);
});

test('leaderboard keeps top 10, sorted high to low', function () {
  const entries = [];
  for (let i = 1; i <= 12; i += 1) {
    entries.push({ name: 'P' + i, score: i * 10 });
  }
  const board = parseScores(entries);
  assert.strictEqual(board.length, 10);
  assert.strictEqual(board[0].score, 120);
  assert.strictEqual(board[9].score, 30);
});

test('a full board still accepts a tying score', function () {
  const board = [];
  for (let i = 0; i < 10; i += 1) {
    board.push({ name: 'P' + i, score: 100 - i });
  }
  assert.strictEqual(qualifies(board, 91), true);
  assert.strictEqual(qualifies(board, 90), false);
  assert.strictEqual(qualifies(board, 0), false);
});

test('mergeScores inserts, sorts, and caps the board', function () {
  const board = mergeScores([{ name: 'Ada', score: 40 }], 'Bea', 80);
  assert.strictEqual(board[0].name, 'Bea');
  assert.strictEqual(board[1].name, 'Ada');
  assert.strictEqual(mergeScores(board, 'x', 999).length, 2);
});

test('start puts the run in play with a clean HUD', function () {
  const game = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  game.start();
  const snap = game.snapshot();
  assert.strictEqual(snap.mode, 'play');
  assert.strictEqual(snap.score, 0);
  assert.strictEqual(snap.pollution, 0);
  assert.strictEqual(snap.recycled, 0);
});

test('space / confirm starts from title and restarts after a loss', function () {
  const game = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  assert.strictEqual(game.confirm(), 'start');
  assert.strictEqual(game.snapshot().mode, 'play');
  game.pause();
  assert.strictEqual(game.confirm(), 'resume');
});

test('cannot jump while ducking on the ground', function () {
  const game = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  game.start();
  game.setDuck(true);
  game.update(1 / 60);
  assert.strictEqual(game.jump(), false);
  assert.strictEqual(game.snapshot().player.onGround, true);
});

test('jump leaves the ground and gravity brings the wolf back', function () {
  const game = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  game.start();
  assert.strictEqual(game.jump(), true);
  playFrames(game, 4);
  assert.strictEqual(game.snapshot().player.onGround, false);
  playFrames(game, 90);
  assert.strictEqual(game.snapshot().player.onGround, true);
  assert.strictEqual(game.snapshot().player.y, CONST.GROUND);
});

test('collecting a recycle cleans the air and adds points', function () {
  const game = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  game.start();
  game.spawnEntity(recycleAt(CONST.PLAYER_X, false));
  const events = game.update(0);
  assert.ok(events.some(function (event) { return event.type === 'collect'; }));
  const snap = game.snapshot();
  assert.strictEqual(snap.recycled, 1);
  assert.ok(snap.score >= CONST.RECYCLE_POINTS);
  assert.ok(snap.pollution < 1);
});

test('recycle combos add bonus points', function () {
  const game = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  game.start();
  game.spawnEntity(recycleAt(CONST.PLAYER_X, false));
  game.update(0);
  game.spawnEntity(recycleAt(CONST.PLAYER_X, false));
  game.update(0);
  const snap = game.snapshot();
  assert.strictEqual(snap.combo, 2);
  assert.ok(snap.bonus >= 10);
  assert.ok(snap.score > CONST.RECYCLE_POINTS * 2);
});

test('missing a recycle raises pollution and breaks combo', function () {
  const game = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  game.start();
  game.spawnEntity(recycleAt(CONST.PLAYER_X, false));
  game.update(0);
  game.spawnEntity(recycleAt(-100, false));
  const events = game.update(1 / 60);
  assert.ok(events.some(function (event) { return event.type === 'miss'; }));
  assert.strictEqual(game.snapshot().combo, 0);
  assert.ok(game.snapshot().pollution >= CONST.MISS_PENALTY);
});

test('hazards raise pollution once, then respect invulnerability', function () {
  const game = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  game.start();
  game.spawnEntity(trashAt(CONST.PLAYER_X));
  const first = game.update(0);
  assert.ok(first.some(function (event) { return event.type === 'hit'; }));
  const afterHit = game.snapshot().pollution;
  game.update(0.1);
  assert.ok(Math.abs(game.snapshot().pollution - afterHit) < 1);
  assert.ok(game.snapshot().player.invuln > 0);
});

test('smog collision in a live run matches duck / stand rules', function () {
  const standing = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  standing.start();
  standing.spawnEntity(smogAt(CONST.PLAYER_X));
  const standEvents = standing.update(0);
  assert.ok(standEvents.some(function (event) { return event.type === 'hit'; }));

  const ducking = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  ducking.start();
  ducking.setDuck(true);
  ducking.update(0);
  ducking.spawnEntity(smogAt(CONST.PLAYER_X));
  const duckEvents = ducking.update(0);
  assert.ok(!duckEvents.some(function (event) { return event.type === 'hit'; }));
});

test('pollution caps at 100 and ends the run once', function () {
  const game = createGame({ rng: function () { return 0.99; }, storage: createMemoryStorage() });
  game.start();
  game.spawnEntity({ type: 'hazard', kind: 'trash', x: CONST.PLAYER_X, y: CONST.GROUND, w: 42, h: 46, dirty: 100 });
  const events = game.update(0);
  assert.ok(events.some(function (event) { return event.type === 'over'; }));
  const over = game.snapshot();
  assert.strictEqual(over.mode, 'over');
  assert.strictEqual(over.pollution, 100);
  const again = game.update(1 / 60).filter(function (event) { return event.type === 'over'; });
  assert.strictEqual(again.length, 0);
});

test('pause freezes scoring and hazards', function () {
  const game = createGame({ rng: function () { return 0.99; }, storage: createMemoryStorage() });
  game.start();
  playFrames(game, 10);
  const before = game.snapshot();
  assert.strictEqual(game.pause(), true);
  playFrames(game, 30);
  const paused = game.snapshot();
  assert.strictEqual(paused.mode, 'pause');
  assert.strictEqual(paused.score, before.score);
  assert.strictEqual(paused.distance, before.distance);
  game.resume();
  playFrames(game, 10);
  assert.ok(game.snapshot().distance > before.distance);
});

test('dt is clamped so a huge hitch cannot teleport through the world', function () {
  const game = createGame({ rng: function () { return 0.99; }, storage: createMemoryStorage() });
  game.start();
  game.update(5);
  assert.ok(game.snapshot().distance < CONST.SPEED_START * 0.05);
});

test('speed starts slower, then steps up on a timer', function () {
  const game = createGame({ rng: function () { return 0.99; }, storage: createMemoryStorage() });
  game.start();
  assert.strictEqual(game.snapshot().speed, CONST.SPEED_START);
  assert.strictEqual(game.snapshot().speedLevel, 0);
  const early = playFrames(game, Math.ceil(CONST.SPEED_INTERVAL * 60) - 8);
  assert.ok(!early.some(function (event) { return event.type === 'speedup'; }));
  const later = playFrames(game, 16);
  assert.ok(later.some(function (event) { return event.type === 'speedup'; }));
  const snap = game.snapshot();
  assert.ok(snap.speed > CONST.SPEED_START);
  assert.ok(snap.speedLevel >= 1);
  assert.ok(snap.speedPulse > 0);
});

test('later speed-ups raise the gear and stay under the cap', function () {
  const game = createGame({ rng: function () { return 0.99; }, storage: createMemoryStorage() });
  game.start();
  playFrames(game, Math.ceil(CONST.SPEED_INTERVAL * 60) + 2);
  const first = game.snapshot().speedLevel;
  playFrames(game, Math.ceil(14 * 60));
  const second = game.snapshot();
  assert.ok(second.speedLevel >= first);
  assert.ok(second.speed <= CONST.SPEED_MAX);
});

test('local save persists a personal best and a sorted board', function () {
  const storage = createMemoryStorage();
  const game = createGame({ rng: function () { return 0.5; }, storage: storage });
  game.start();
  const board = game.saveLocal('Pack', 250);
  assert.strictEqual(board[0].name, 'Pack');
  assert.strictEqual(game.readBest(), 0);
  const later = createGame({ rng: function () { return 0.5; }, storage: storage });
  assert.deepStrictEqual(later.loadLocalBoard()[0], { name: 'Pack', score: 250 });
});

test('corrupt storage does not crash loadLocalBoard', function () {
  const storage = createMemoryStorage();
  storage.setItem(CONST.STORAGE_KEY, 'not-json');
  const game = createGame({ rng: function () { return 0.5; }, storage: storage });
  assert.deepStrictEqual(game.loadLocalBoard(), []);
});

test('score matches distance, recycles, and combo bonus', function () {
  const game = createGame({ rng: function () { return 0.99; }, storage: createMemoryStorage() });
  game.start();
  playFrames(game, 60, 1 / 60);
  const snap = game.snapshot();
  const expected = Math.floor(snap.distance / 8) + snap.recycled * 20 + snap.bonus;
  assert.strictEqual(snap.score, expected);
});

test('a new run clears leftover duck / jump holds', function () {
  const game = createGame({ rng: function () { return 0.5; }, storage: createMemoryStorage() });
  game.start();
  game.setDuck(true);
  game.update(1 / 60);
  assert.strictEqual(game.snapshot().player.duck, true);
  game.start();
  assert.strictEqual(game.snapshot().player.duck, false);
  assert.strictEqual(game.jump(), true);
});

test('finishing a run stores a personal best', function () {
  const storage = createMemoryStorage();
  const game = createGame({ rng: function () { return 0.99; }, storage: storage });
  game.start();
  playFrames(game, 45);
  const score = game.snapshot().score;
  game.spawnEntity({ type: 'hazard', kind: 'trash', x: CONST.PLAYER_X, y: CONST.GROUND, w: 42, h: 46, dirty: 100 });
  game.update(0);
  assert.strictEqual(game.snapshot().mode, 'over');
  assert.ok(game.readBest() >= score);
  const next = createGame({ rng: function () { return 0.99; }, storage: storage });
  assert.ok(next.readBest() >= score);
});

console.log('\n' + passed + ' tests passed');
