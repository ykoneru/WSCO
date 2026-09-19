(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WSOGame = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const CONST = {
    VIEW_W: 960,
    VIEW_H: 480,
    GROUND: 392,
    PLAYER_X: 150,
    MAX_BOARD: 10,
    STORAGE_KEY: 'wso-pack-run-scores',
    BEST_KEY: 'wso-pack-run-best',
    GRAVITY: 1650,
    FAST_FALL: 2800,
    JUMP_VY: -560,
    SPEED_START: 230,
    SPEED_MAX: 820,
    SPEED_STEP: 58,
    SPEED_INTERVAL: 12,
    SPEED_RAMP: 2.4,
    POLLUTION_RATE: 1.45,
    INVULN_TIME: 0.52,
    MISS_PENALTY: 5,
    COLLECT_CLEAN: 10,
    RECYCLE_POINTS: 20,
    NAME_RE: /^[\w \-'.]{2,16}$/
  };

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function playerBox(player) {
    if (player.duck && player.onGround) {
      return { x: CONST.PLAYER_X - 22, y: player.y - 28, w: 52, h: 28 };
    }
    return { x: CONST.PLAYER_X - 16, y: player.y - 54, w: 36, h: 54 };
  }

  function entityBox(entity) {
    return {
      x: entity.x - entity.w / 2,
      y: entity.y - entity.h,
      w: entity.w,
      h: entity.h
    };
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function sanitizeName(value) {
    const name = String(value || '')
      .replace(/[^\w \-'.]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 16);
    return CONST.NAME_RE.test(name) ? name : '';
  }

  function parseScores(raw) {
    let data = raw;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch (err) {
        return [];
      }
    }
    if (!Array.isArray(data)) return [];
    return data
      .map(function (entry) {
        if (!entry || typeof entry !== 'object') return null;
        const name = sanitizeName(entry.name);
        const score = Math.floor(Number(entry.score));
        if (!name || !Number.isFinite(score) || score < 0) return null;
        return { name: name, score: score };
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, CONST.MAX_BOARD);
  }

  function qualifies(entries, score) {
    const board = parseScores(entries);
    const value = Math.floor(Number(score));
    if (!Number.isFinite(value) || value < 1) return false;
    if (board.length < CONST.MAX_BOARD) return true;
    return value >= board[board.length - 1].score;
  }

  function mergeScores(entries, name, score) {
    const clean = sanitizeName(name);
    const value = Math.floor(Number(score));
    if (!clean || !Number.isFinite(value) || value < 1) {
      return parseScores(entries);
    }
    return parseScores(parseScores(entries).concat([{ name: clean, score: value }]));
  }

  function createMemoryStorage() {
    const data = {};
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem: function (key, value) {
        data[key] = String(value);
      }
    };
  }

  function createStorage(provided) {
    if (provided) return provided;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.getItem(CONST.STORAGE_KEY);
        return localStorage;
      }
    } catch (err) {
      /* private mode / blocked storage */
    }
    return createMemoryStorage();
  }

  function makePlayer() {
    return {
      y: CONST.GROUND,
      vy: 0,
      duck: false,
      onGround: true,
      walk: 0,
      invuln: 0
    };
  }

  function createGame(options) {
    const opts = options || {};
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const storage = createStorage(opts.storage);
    const events = [];

    let mode = 'title';
    let score = 0;
    let recycled = 0;
    let pollution = 0;
    let distance = 0;
    let speed = CONST.SPEED_START;
    let speedLevel = 0;
    let speedPulse = 0;
    let runTime = 0;
    let nextSpeedAt = CONST.SPEED_INTERVAL;
    let spawnAt = 780;
    let hitFlash = 0;
    let combo = 0;
    let comboFlash = 0;
    let bonus = 0;
    let duckHeld = false;
    let jumpHeld = false;
    let entities = [];
    let particles = [];
    let groundBits = [];
    let clouds = [];
    let player = makePlayer();
    let ended = false;

    function emit(type, extra) {
      const event = extra || {};
      event.type = type;
      events.push(event);
    }

    function rand(min, max) {
      return min + rng() * (max - min);
    }

    function readBest() {
      const value = Math.floor(Number(storage.getItem(CONST.BEST_KEY) || 0));
      return Number.isFinite(value) && value > 0 ? value : 0;
    }

    function writeBest(value) {
      try {
        storage.setItem(CONST.BEST_KEY, String(Math.max(readBest(), Math.floor(value))));
      } catch (err) {
        /* ignore quota */
      }
    }

    function loadLocalBoard() {
      try {
        return parseScores(storage.getItem(CONST.STORAGE_KEY) || '[]');
      } catch (err) {
        return [];
      }
    }

    function saveLocalBoard(entries) {
      try {
        storage.setItem(CONST.STORAGE_KEY, JSON.stringify(entries));
      } catch (err) {
        /* ignore quota */
      }
      return entries;
    }

    function resetWorld() {
      score = 0;
      recycled = 0;
      pollution = 0;
      distance = 0;
      speed = CONST.SPEED_START;
      speedLevel = 0;
      speedPulse = 0;
      runTime = 0;
      nextSpeedAt = CONST.SPEED_INTERVAL;
      spawnAt = 780;
      hitFlash = 0;
      combo = 0;
      comboFlash = 0;
      bonus = 0;
      duckHeld = false;
      jumpHeld = false;
      ended = false;
      entities = [];
      particles = [];
      player = makePlayer();
      groundBits = [];
      for (let i = 0; i < 28; i += 1) {
        groundBits.push({ x: i * 50, w: rand(10, 28) });
      }
      clouds = [];
      for (let i = 0; i < 6; i += 1) {
        clouds.push({ x: i * 180 + rand(0, 40), y: rand(36, 100), s: rand(0.8, 1.3) });
      }
    }

    function spawnEntity(entity) {
      entities.push(entity);
      return entity;
    }

    function spawn() {
      const roll = rng();
      const x = CONST.VIEW_W + 40;
      if (roll < 0.36) {
        const kind = rng() < 0.55 ? 'trash' : 'oil';
        spawnEntity({
          type: 'hazard',
          kind: kind,
          x: x,
          y: CONST.GROUND,
          w: kind === 'oil' ? 56 : 42,
          h: kind === 'oil' ? 18 : 46,
          dirty: kind === 'oil' ? 22 : 26
        });
      } else if (roll < 0.58) {
        spawnEntity({
          type: 'hazard',
          kind: 'smog',
          x: x,
          y: CONST.GROUND - 42,
          w: 72,
          h: 50,
          dirty: 22
        });
      } else {
        const high = rng() > 0.42;
        spawnEntity({
          type: 'recycle',
          kind: rng() > 0.5 ? 'bottle' : 'can',
          x: x,
          y: high ? CONST.GROUND - 78 : CONST.GROUND - 18,
          w: 22,
          h: 28,
          value: CONST.RECYCLE_POINTS
        });
      }
      const gap = lerp(430, 280, Math.min(speed / CONST.SPEED_MAX, 1));
      spawnAt = distance + gap + rand(0, 70);
    }

    function burst(x, y, color, count) {
      if (opts.reduceMotion) return;
      const n = count || 8;
      for (let i = 0; i < n; i += 1) {
        particles.push({
          x: x,
          y: y,
          vx: rand(-70, 70),
          vy: rand(-120, -20),
          life: 1,
          color: color
        });
      }
    }

    function speedBurst(level) {
      if (opts.reduceMotion) return;
      const count = 10 + Math.min(level, 8) * 6;
      for (let i = 0; i < count; i += 1) {
        particles.push({
          x: rand(40, CONST.VIEW_W),
          y: rand(40, CONST.GROUND - 20),
          vx: rand(-520, -180) - level * 40,
          vy: rand(-40, 40),
          life: 0.7 + Math.min(level, 6) * 0.08,
          color: level >= 4 ? '#fff8e8' : (level >= 2 ? '#c5e1a5' : '#fff5e9'),
          streak: true
        });
      }
      burst(CONST.PLAYER_X + 20, player.y - 24, '#ffe082', 6 + level * 2);
    }

    function triggerSpeedUp() {
      if (speed >= CONST.SPEED_MAX) {
        nextSpeedAt = runTime + 30;
        return;
      }
      speedLevel += 1;
      speed = Math.min(CONST.SPEED_MAX, CONST.SPEED_START + speedLevel * CONST.SPEED_STEP);
      speedPulse = 1;
      const wait = Math.max(10, CONST.SPEED_INTERVAL + 1.4 - speedLevel * 0.45);
      nextSpeedAt = runTime + wait;
      speedBurst(speedLevel);
      emit('speedup', { level: speedLevel, speed: speed });
    }

    function start() {
      resetWorld();
      mode = 'play';
      emit('start');
    }

    function pause() {
      if (mode !== 'play') return false;
      mode = 'pause';
      emit('pause');
      return true;
    }

    function resume() {
      if (mode !== 'pause') return false;
      mode = 'play';
      emit('resume');
      return true;
    }

    function togglePause() {
      if (mode === 'play') return pause();
      if (mode === 'pause') return resume();
      return false;
    }

    function confirm() {
      if (mode === 'title' || mode === 'over') {
        start();
        return 'start';
      }
      if (mode === 'pause') {
        resume();
        return 'resume';
      }
      return null;
    }

    function jump() {
      if (mode !== 'play') return false;
      if (player.onGround && !player.duck) {
        player.vy = CONST.JUMP_VY;
        player.onGround = false;
        emit('jump');
        return true;
      }
      return false;
    }

    function setDuck(value) {
      duckHeld = !!value;
    }

    function setJumpHeld(value) {
      jumpHeld = !!value;
    }

    function finish() {
      if (ended) return;
      ended = true;
      mode = 'over';
      writeBest(score);
      emit('over', { score: score, pollution: pollution });
    }

    function update(dtRaw) {
      const dt = Math.max(0, Math.min(0.033, Number(dtRaw) || 0));
      hitFlash = Math.max(0, hitFlash - dt * 2.2);
      comboFlash = Math.max(0, comboFlash - dt);
      speedPulse = Math.max(0, speedPulse - dt / (0.78 + Math.min(speedLevel, 6) * 0.08));
      player.invuln = Math.max(0, player.invuln - dt);

      clouds.forEach(function (cloud) {
        cloud.x -= (mode === 'play' ? speed * 0.25 : 18) * dt;
        if (cloud.x < -80) cloud.x = CONST.VIEW_W + rand(20, 120);
      });

      particles = particles.filter(function (particle) {
        particle.life -= dt * 1.8;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 180 * dt;
        return particle.life > 0;
      });

      if (mode !== 'play') {
        player.walk += dt * 8;
        return drain();
      }

      runTime += dt;
      speed = Math.min(CONST.SPEED_MAX, speed + dt * CONST.SPEED_RAMP);
      if (runTime >= nextSpeedAt) triggerSpeedUp();
      distance += speed * dt;
      score = Math.floor(distance / 8) + recycled * CONST.RECYCLE_POINTS + bonus;
      pollution = Math.min(100, pollution + dt * CONST.POLLUTION_RATE);

      player.duck = duckHeld && player.onGround;
      if (jumpHeld) jump();

      const gravity = (!player.onGround && duckHeld) ? CONST.FAST_FALL : CONST.GRAVITY;
      player.vy += gravity * dt;
      player.y += player.vy * dt;
      if (player.y >= CONST.GROUND) {
        player.y = CONST.GROUND;
        player.vy = 0;
        player.onGround = true;
      }
      player.walk += dt * (12 + speed / 120);

      groundBits.forEach(function (bit) {
        bit.x -= speed * dt;
        if (bit.x < -40) bit.x += 50 * 28;
      });

      if (distance > spawnAt) spawn();

      const box = playerBox(player);
      entities = entities.filter(function (entity) {
        entity.x -= speed * dt;
        if (entity.x < -80) {
          if (entity.type === 'recycle') {
            pollution = Math.min(100, pollution + CONST.MISS_PENALTY);
            combo = 0;
            emit('miss');
          }
          return false;
        }
        if (!overlaps(box, entityBox(entity))) return true;
        if (entity.type === 'recycle') {
          recycled += 1;
          combo += 1;
          if (combo > 1) {
            bonus += combo * 5;
            comboFlash = 1;
          }
          pollution = Math.max(0, pollution - CONST.COLLECT_CLEAN);
          burst(entity.x, entity.y - 10, '#66bb6a');
          emit('collect', { combo: combo });
          return false;
        }
        if (player.invuln > 0) return true;
        pollution = Math.min(100, pollution + entity.dirty);
        hitFlash = 1;
        combo = 0;
        player.invuln = CONST.INVULN_TIME;
        burst(CONST.PLAYER_X, player.y - 20, '#b71c1c');
        emit('hit', { kind: entity.kind });
        return true;
      });

      score = Math.floor(distance / 8) + recycled * CONST.RECYCLE_POINTS + bonus;
      if (pollution >= 100) finish();
      return drain();
    }

    function drain() {
      const copy = events.slice();
      events.length = 0;
      return copy;
    }

    function snapshot() {
      return {
        mode: mode,
        score: score,
        recycled: recycled,
        pollution: pollution,
        combo: combo,
        comboFlash: comboFlash,
        bonus: bonus,
        best: Math.max(readBest(), score),
        speed: speed,
        speedLevel: speedLevel,
        speedPulse: speedPulse,
        runTime: runTime,
        distance: distance,
        hitFlash: hitFlash,
        player: {
          y: player.y,
          vy: player.vy,
          duck: player.duck,
          onGround: player.onGround,
          walk: player.walk,
          invuln: player.invuln
        },
        entities: entities.map(function (entity) {
          return Object.assign({}, entity);
        }),
        particles: particles,
        groundBits: groundBits,
        clouds: clouds
      };
    }

    resetWorld();

    return {
      start: start,
      pause: pause,
      resume: resume,
      togglePause: togglePause,
      confirm: confirm,
      jump: jump,
      setDuck: setDuck,
      setJumpHeld: setJumpHeld,
      update: update,
      snapshot: snapshot,
      spawnEntity: spawnEntity,
      playerBox: function () { return playerBox(player); },
      entityBox: entityBox,
      loadLocalBoard: loadLocalBoard,
      saveLocal: function (name, playerScore) {
        const board = mergeScores(loadLocalBoard(), name, playerScore);
        return saveLocalBoard(board);
      },
      qualifies: function (entries, playerScore) {
        return qualifies(entries, playerScore == null ? score : playerScore);
      },
      readBest: readBest
    };
  }

  return {
    CONST: CONST,
    overlaps: overlaps,
    playerBox: playerBox,
    entityBox: entityBox,
    sanitizeName: sanitizeName,
    parseScores: parseScores,
    qualifies: qualifies,
    mergeScores: mergeScores,
    createGame: createGame,
    createMemoryStorage: createMemoryStorage
  };
});
