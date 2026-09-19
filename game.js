(function () {
  const BOARD_KEY = "eco-catch-board";
  const BEST_KEY = "eco-catch-best";
  const NAME_KEY = "eco-catch-name";
  const FACT_KEY = "eco-catch-fact";

  const canvas = document.getElementById("eco-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let gfx = ctx;
  const overlay = document.getElementById("eco-overlay");
  const hud = document.getElementById("eco-hud");
  const liveScore = document.getElementById("eco-live-score");
  const livesEl = document.getElementById("eco-lives");
  const comboLabel = document.getElementById("eco-combo");
  const viewReady = document.getElementById("eco-view-ready");
  const viewOver = document.getElementById("eco-view-over");
  const viewBoard = document.getElementById("eco-view-board");
  const playBtn = document.getElementById("eco-play");
  const boardBtn = document.getElementById("eco-board");
  const againBtn = document.getElementById("eco-again");
  const overBoardBtn = document.getElementById("eco-over-board");
  const boardPlayBtn = document.getElementById("eco-board-play");
  const boardBackBtn = document.getElementById("eco-board-back");
  const finalScore = document.getElementById("eco-final-score");
  const bestScore = document.getElementById("eco-best-score");
  const ecoFact = document.getElementById("eco-fact");
  const saveForm = document.getElementById("eco-save-form");
  const playerName = document.getElementById("eco-player-name");
  const savedNote = document.getElementById("eco-saved-note");
  const boardList = document.getElementById("eco-board-list");
  const boardEmpty = document.getElementById("eco-board-empty");
  const stage = canvas.closest(".eco-catch");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const GROUND_H = 92;
  const CATCH_Y = HEIGHT - GROUND_H - 18;
  const PLAYER_W = 78;
  const MAX_LIVES = 3;

  const ITEM_TYPES = {
    bottle: { good: true, points: 15 },
    can: { good: true, points: 20 },
    paper: { good: true, points: 10 },
    apple: { good: true, points: 12 },
    carrot: { good: true, points: 12 },
    banana: { good: true, points: 12 },
    battery: { good: false, points: 0 },
    cig: { good: false, points: 0 },
    bag: { good: false, points: 0 },
    foam: { good: false, points: 0 }
  };

  const GOOD_ITEMS = ["bottle", "can", "paper", "apple", "carrot", "banana"];
  const BAD_ITEMS = ["battery", "cig", "bag", "foam"];
  const BOARD_SIZE = 10;

  const FACTS = [
    "Recycling one aluminum can saves enough energy to power a TV for 3 hours.",
    "Food scraps in a landfill create methane. Composting turns them into soil.",
    "A plastic bottle can take 450 years to break down in nature.",
    "One tree can absorb about 48 pounds of CO₂ a year.",
    "Paper can be recycled 5 to 7 times before the fibers wear out.",
    "Keeping oil out of drains protects rivers, fish, and drinking water."
  ];

  const audio = createAudio();
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let gameInView = true;
  bestScore.textContent = String(best);
  playerName.value = localStorage.getItem(NAME_KEY) || "";

  const keys = new Set();
  const state = {
    mode: "ready",
    screen: "ready",
    playerX: WIDTH / 2,
    items: [],
    popups: [],
    particles: [],
    spawn: 0,
    score: 0,
    lives: MAX_LIVES,
    combo: 0,
    bestCombo: 0,
    flash: 0,
    ground: 0,
    last: 0,
    acc: 0,
    idle: 0,
    lastSavedName: ""
  };

  function loadBoard() {
    try {
      const data = JSON.parse(localStorage.getItem(BOARD_KEY) || "[]");
      if (!Array.isArray(data)) return [];
      const bestByName = new Map();
      for (const row of data) {
        if (!row || typeof row.score !== "number") continue;
        const name = String(row.name || "Player");
        const key = name.toLowerCase();
        const prev = bestByName.get(key);
        if (!prev || row.score > prev.score) bestByName.set(key, Object.assign({}, row, { name: name }));
      }
      return Array.from(bestByName.values())
        .sort(function (a, b) {
          return b.score - a.score || (a.at || 0) - (b.at || 0);
        })
        .slice(0, BOARD_SIZE);
    } catch (err) {
      return [];
    }
  }

  function saveBoard(board) {
    localStorage.setItem(BOARD_KEY, JSON.stringify(board.slice(0, BOARD_SIZE)));
  }

  function wouldPlace(score, name) {
    if (score <= 0) return false;
    const board = loadBoard();
    const key = (name || "").trim().toLowerCase();
    const existing = key ? board.find(function (row) { return row.name.toLowerCase() === key; }) : null;
    if (existing) return score > existing.score;
    return board.length < BOARD_SIZE || score > board[board.length - 1].score;
  }

  function renderBoard(highlightName, highlightScore) {
    const board = loadBoard();
    boardList.innerHTML = "";
    boardEmpty.hidden = board.length > 0;
    board.forEach(function (row, i) {
      const li = document.createElement("li");
      if (row.name === highlightName && row.score === highlightScore) li.classList.add("me");
      li.innerHTML = '<span class="place">' + (i + 1) + "</span><span>" + escapeHtml(row.name) + '</span><span class="pts">' + row.score + "</span>";
      boardList.appendChild(li);
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function showScreen(name) {
    state.screen = name;
    viewReady.hidden = name !== "ready";
    viewOver.hidden = name !== "over";
    viewBoard.hidden = name !== "board";
    overlay.hidden = false;
    hud.hidden = true;
    if (name === "board") renderBoard(state.lastSavedName, state.score);
  }

  function resetPlay() {
    state.playerX = WIDTH / 2;
    state.items = [];
    state.popups = [];
    state.particles = [];
    state.spawn = 20;
    state.score = 0;
    state.lives = MAX_LIVES;
    state.combo = 0;
    state.bestCombo = 0;
    state.flash = 0;
    state.lastSavedName = "";
    liveScore.textContent = "0";
    comboLabel.textContent = "";
    updateLives();
  }

  function startGame() {
    resetPlay();
    state.mode = "playing";
    overlay.hidden = true;
    hud.hidden = false;
    audio.resume();
  }

  function updateLives() {
    livesEl.querySelectorAll("i").forEach(function (pip, i) {
      pip.classList.toggle("on", i < state.lives);
    });
  }

  function nextFact() {
    let i = Number(localStorage.getItem(FACT_KEY));
    if (!Number.isInteger(i) || i < 0) i = -1;
    i = (i + 1) % FACTS.length;
    localStorage.setItem(FACT_KEY, String(i));
    return FACTS[i];
  }

  function gameOver() {
    if (state.mode !== "playing") return;
    state.mode = "dead";
    audio.hit();
    best = Math.max(best, state.score);
    localStorage.setItem(BEST_KEY, String(best));
    finalScore.textContent = String(state.score);
    bestScore.textContent = String(best);
    ecoFact.textContent = nextFact();
    savedNote.hidden = true;
    saveForm.hidden = !wouldPlace(state.score, playerName.value);
    showScreen("over");
  }

  function pickType() {
    if (Math.random() < 0.3) return BAD_ITEMS[Math.floor(Math.random() * BAD_ITEMS.length)];
    return GOOD_ITEMS[Math.floor(Math.random() * GOOD_ITEMS.length)];
  }

  function spawnItem() {
    const type = pickType();
    state.items.push({
      type: type,
      x: 28 + Math.random() * (WIDTH - 56),
      y: -24,
      r: 20,
      vy: 2.1 + Math.min(2.4, state.score / 90) + Math.random() * 0.7,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.08
    });
  }

  function burst(x, y, color, count) {
    const n = count == null ? 8 : count;
    for (let i = 0; i < n; i += 1) {
      state.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 3.2,
        vy: -Math.random() * 3 - 0.6,
        life: 22 + Math.random() * 10,
        color: color
      });
    }
  }

  function popup(x, y, text, color) {
    state.popups.push({ x: x, y: y, text: text, color: color, life: 40 });
  }

  function multiplier() {
    return 1 + Math.min(4, Math.floor(state.combo / 3));
  }

  function catchGood(item) {
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const gain = ITEM_TYPES[item.type].points * multiplier();
    state.score += gain;
    liveScore.textContent = String(state.score);
    comboLabel.textContent = state.combo >= 2 ? "x" + multiplier() : "";
    popup(item.x, item.y, "+" + gain, "#edffbf");
    burst(item.x, item.y, "#8ee15a");
    audio.score(state.combo);
  }

  function takeHit(item, reason) {
    state.combo = 0;
    comboLabel.textContent = "";
    state.lives -= 1;
    state.flash = 10;
    updateLives();
    popup(item.x, item.y, reason, "#ffd0c4");
    burst(item.x, item.y, "#e25a3a", 10);
    audio.hit();
    if (state.lives <= 0) gameOver();
  }

  function updatePlayer() {
    const speed = 6.2;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) state.playerX -= speed;
    if (keys.has("ArrowRight") || keys.has("KeyD")) state.playerX += speed;
    state.playerX = Math.max(PLAYER_W / 2, Math.min(WIDTH - PLAYER_W / 2, state.playerX));
  }

  function update() {
    state.ground = (state.ground + 1.4) % 24;
    state.idle += 1;
    if (state.flash > 0) state.flash -= 1;

    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= 1;
    }
    state.particles = state.particles.filter(function (p) { return p.life > 0; });
    for (let i = 0; i < state.popups.length; i += 1) {
      const p = state.popups[i];
      p.y -= 0.7;
      p.life -= 1;
    }
    state.popups = state.popups.filter(function (p) { return p.life > 0; });

    if (state.mode !== "playing") {
      if (state.mode === "ready") {
        if (state.idle % 48 === 0 && state.items.length < 4) spawnItem();
        for (let i = 0; i < state.items.length; i += 1) {
          const item = state.items[i];
          item.y += 1.1;
          item.rot += item.spin;
        }
        state.items = state.items.filter(function (item) { return item.y < HEIGHT + 30; });
      }
      return;
    }

    updatePlayer();
    state.spawn += 1;
    const spawnEvery = Math.max(26, 58 - Math.floor(state.score / 40));
    if (state.spawn >= spawnEvery) {
      state.spawn = 0;
      spawnItem();
    }

    for (let i = 0; i < state.items.length; i += 1) {
      const item = state.items[i];
      item.y += item.vy;
      item.rot += item.spin;
      if (item.caught) continue;
      const nearX = Math.abs(item.x - state.playerX) < PLAYER_W / 2 - 4;
      const nearY = item.y + item.r > CATCH_Y - 16 && item.y - item.r < CATCH_Y + 12;
      if (nearX && nearY) {
        item.caught = true;
        if (ITEM_TYPES[item.type].good) catchGood(item);
        else takeHit(item, "Pollution!");
      } else if (item.y - item.r > HEIGHT - GROUND_H + 8) {
        item.caught = true;
        if (ITEM_TYPES[item.type].good) takeHit(item, "Littered");
      }
      if (state.mode !== "playing") break;
    }
    state.items = state.items.filter(function (item) { return !item.caught && item.y < HEIGHT + 40; });
  }

  function greening() {
    if (state.mode !== "playing") return 0.62;
    return Math.min(1, 0.28 + state.score / 200);
  }

  function drawSky() {
    const g = greening();
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, mix("#8ec6e6", "#6ec8f0", g));
    grad.addColorStop(0.68, mix("#b7d9a6", "#a6e58c", g));
    grad.addColorStop(1, mix("#c9e39a", "#9ed86a", g));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawWorld() {
    const g = greening();
    ctx.fillStyle = mix("#6f8a58", "#5dae3d", g);
    for (let i = 0; i < 5; i += 1) {
      const x = 40 + i * 80;
      ctx.beginPath();
      ctx.ellipse(x, HEIGHT - GROUND_H - 8, 48, 26 + g * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const trees = 1 + Math.floor(g * 4);
    for (let i = 0; i < trees; i += 1) {
      const x = 50 + i * 85;
      const y = HEIGHT - GROUND_H - 18;
      ctx.fillStyle = "#7a4e2a";
      ctx.fillRect(x - 4, y - 18, 8, 22);
      ctx.fillStyle = mix("#6ea24a", "#3f9a2a", g);
      ctx.beginPath();
      ctx.arc(x, y - 28, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGround() {
    const y = HEIGHT - GROUND_H;
    ctx.fillStyle = mix("#b8a56a", "#d7c07a", greening());
    ctx.fillRect(0, y, WIDTH, GROUND_H);
    ctx.fillStyle = mix("#6a9a3a", "#73c43a", greening());
    ctx.fillRect(0, y, WIDTH, 16);
    ctx.fillStyle = "#4e8628";
    for (let i = -24; i < WIDTH + 24; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i - state.ground, y);
      ctx.lineTo(i + 12 - state.ground, y + 16);
      ctx.lineTo(i + 24 - state.ground, y);
      ctx.fill();
    }
  }

  function drawPlayer() {
    const x = state.playerX;
    const y = CATCH_Y;
    const bob = state.mode === "playing" ? Math.sin(state.idle / 8) * 1.5 : Math.sin(state.idle / 14) * 3;
    ctx.save();
    ctx.translate(x, y + bob);

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 22, 28, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3d8f4a";
    roundRect(-PLAYER_W / 2, -8, PLAYER_W, 22, 10);
    ctx.fill();
    ctx.fillStyle = "#2f6e3a";
    roundRect(-PLAYER_W / 2 + 6, -2, PLAYER_W - 12, 12, 6);
    ctx.fill();

    ctx.fillStyle = "#7ed957";
    ctx.beginPath();
    ctx.arc(0, -22, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-6, -24, 4.2, 0, Math.PI * 2);
    ctx.arc(6, -24, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#163428";
    ctx.beginPath();
    ctx.arc(-5, -24, 2, 0, Math.PI * 2);
    ctx.arc(7, -24, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2f6e3a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -18, 6, 0.15, Math.PI - 0.15);
    ctx.stroke();

    ctx.fillStyle = "#49a84a";
    ctx.beginPath();
    ctx.ellipse(-16, -34, 8, 12, -0.5, 0, Math.PI * 2);
    ctx.ellipse(14, -36, 7, 11, 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawRecycleMark(x, y, s) {
    gfx.save();
    gfx.translate(x, y);
    gfx.strokeStyle = "#2d8a3e";
    gfx.fillStyle = "#2d8a3e";
    gfx.lineWidth = 1.6;
    gfx.lineCap = "round";
    gfx.lineJoin = "round";
    for (let i = 0; i < 3; i += 1) {
      gfx.rotate((Math.PI * 2) / 3);
      gfx.beginPath();
      gfx.moveTo(-s * 0.15, -s * 0.15);
      gfx.lineTo(s * 0.05, -s * 0.85);
      gfx.lineTo(s * 0.42, -s * 0.45);
      gfx.stroke();
      gfx.beginPath();
      gfx.moveTo(s * 0.18, -s * 0.28);
      gfx.lineTo(s * 0.42, -s * 0.45);
      gfx.lineTo(s * 0.08, -s * 0.52);
      gfx.fill();
    }
    gfx.restore();
  }

  function drawItem(item) {
    gfx.save();
    gfx.translate(item.x, item.y);
    gfx.rotate(item.rot);
    if (item.type === "bottle") {
      gfx.fillStyle = "#8fd7ee";
      roundRect(-8, -18, 16, 34, 6);
      gfx.fill();
      gfx.fillStyle = "#3aaa4a";
      roundRect(-5, -24, 10, 8, 3);
      gfx.fill();
      gfx.fillStyle = "rgba(255,255,255,0.5)";
      gfx.fillRect(-5, -10, 4, 16);
      drawRecycleMark(0, 6, 6);
    } else if (item.type === "can") {
      gfx.fillStyle = "#d5dbe3";
      roundRect(-10, -16, 20, 32, 5);
      gfx.fill();
      gfx.fillStyle = "#3aaa4a";
      gfx.fillRect(-10, -5, 20, 10);
      gfx.fillStyle = "#fff";
      gfx.fillRect(-10, -16, 20, 4);
      gfx.fillRect(-10, 12, 20, 4);
      drawRecycleMark(0, 0, 5.5);
    } else if (item.type === "paper") {
      gfx.fillStyle = "#f4f1e6";
      roundRect(-12, -14, 24, 28, 2);
      gfx.fill();
      gfx.strokeStyle = "#3aaa4a";
      gfx.lineWidth = 1.5;
      gfx.strokeRect(-12, -14, 24, 28);
      gfx.beginPath();
      gfx.moveTo(-7, -6);
      gfx.lineTo(7, -6);
      gfx.moveTo(-7, 0);
      gfx.lineTo(5, 0);
      gfx.moveTo(-7, 6);
      gfx.lineTo(4, 6);
      gfx.stroke();
      drawRecycleMark(6, 10, 4);
    } else if (item.type === "apple") {
      gfx.fillStyle = "#e23b32";
      gfx.beginPath();
      gfx.arc(-4, 2, 11, 0, Math.PI * 2);
      gfx.arc(4, 2, 11, 0, Math.PI * 2);
      gfx.fill();
      gfx.fillStyle = "#7a4e2a";
      gfx.fillRect(-1, -14, 2, 8);
      gfx.fillStyle = "#3aaa4a";
      gfx.beginPath();
      gfx.ellipse(7, -12, 7, 3.5, 0.5, 0, Math.PI * 2);
      gfx.fill();
    } else if (item.type === "carrot") {
      gfx.fillStyle = "#f08a2a";
      gfx.beginPath();
      gfx.moveTo(0, 18);
      gfx.lineTo(8, -8);
      gfx.lineTo(-8, -8);
      gfx.closePath();
      gfx.fill();
      gfx.fillStyle = "#3aaa4a";
      gfx.beginPath();
      gfx.moveTo(-4, -8);
      gfx.quadraticCurveTo(-8, -20, -2, -8);
      gfx.moveTo(0, -8);
      gfx.quadraticCurveTo(2, -22, 3, -8);
      gfx.moveTo(4, -8);
      gfx.quadraticCurveTo(9, -18, 5, -8);
      gfx.fill();
      gfx.beginPath();
      gfx.ellipse(-3, -14, 3, 8, -0.4, 0, Math.PI * 2);
      gfx.ellipse(0, -16, 3, 9, 0.05, 0, Math.PI * 2);
      gfx.ellipse(4, -14, 3, 8, 0.45, 0, Math.PI * 2);
      gfx.fill();
    } else if (item.type === "banana") {
      gfx.fillStyle = "#f3d04a";
      gfx.beginPath();
      gfx.moveTo(-12, 8);
      gfx.quadraticCurveTo(-14, -10, 2, -16);
      gfx.quadraticCurveTo(14, -6, 10, 10);
      gfx.quadraticCurveTo(0, 4, -12, 8);
      gfx.fill();
      gfx.fillStyle = "#7a4e2a";
      gfx.beginPath();
      gfx.ellipse(3, -16, 3, 2, 0.2, 0, Math.PI * 2);
      gfx.fill();
    } else if (item.type === "battery") {
      gfx.fillStyle = "#7dff3a";
      gfx.beginPath();
      gfx.ellipse(-5, 20, 4, 5, 0.2, 0, Math.PI * 2);
      gfx.ellipse(4, 22, 3.5, 6, -0.15, 0, Math.PI * 2);
      gfx.fill();
      gfx.fillStyle = "#ffd400";
      roundRect(-10, -16, 20, 32, 4);
      gfx.fill();
      gfx.fillStyle = "#1a1a1a";
      gfx.fillRect(-10, -6, 20, 7);
      gfx.fillRect(-10, 8, 20, 7);
      gfx.fillStyle = "#c9a03a";
      gfx.fillRect(-4, -22, 8, 8);
      gfx.fillStyle = "#fff";
      gfx.fillRect(-1.5, -20, 3, 4);
    } else if (item.type === "cig") {
      gfx.fillStyle = "rgba(70,70,70,0.45)";
      gfx.beginPath();
      gfx.ellipse(-22, -12, 7, 9, -0.35, 0, Math.PI * 2);
      gfx.ellipse(-18, -18, 5, 7, 0.2, 0, Math.PI * 2);
      gfx.fill();
      gfx.fillStyle = "#efe6d4";
      roundRect(-18, -6, 28, 12, 3);
      gfx.fill();
      gfx.fillStyle = "#c56a22";
      gfx.fillRect(10, -6, 10, 12);
      gfx.fillStyle = "#5a3a22";
      gfx.fillRect(8, -6, 2, 12);
      gfx.fillStyle = "#ff4a1a";
      gfx.beginPath();
      gfx.arc(-18, 0, 5, 0, Math.PI * 2);
      gfx.fill();
      gfx.fillStyle = "#ffd54a";
      gfx.beginPath();
      gfx.arc(-18, 0, 2.2, 0, Math.PI * 2);
      gfx.fill();
    } else if (item.type === "bag") {
      gfx.fillStyle = "#2a2a2e";
      gfx.beginPath();
      gfx.moveTo(-14, -8);
      gfx.lineTo(-16, 16);
      gfx.quadraticCurveTo(0, 22, 16, 16);
      gfx.lineTo(14, -8);
      gfx.closePath();
      gfx.fill();
      gfx.beginPath();
      gfx.ellipse(-6, 4, 5, 4, 0, 0, Math.PI * 2);
      gfx.ellipse(5, 6, 6, 5, 0, 0, Math.PI * 2);
      gfx.fill();
      gfx.fillStyle = "#ffd400";
      gfx.beginPath();
      gfx.ellipse(0, -12, 5, 4, 0, 0, Math.PI * 2);
      gfx.fill();
      gfx.strokeStyle = "#ffd400";
      gfx.lineWidth = 3;
      gfx.beginPath();
      gfx.moveTo(-3, -12);
      gfx.lineTo(-8, -20);
      gfx.moveTo(3, -12);
      gfx.lineTo(8, -20);
      gfx.stroke();
    } else if (item.type === "foam") {
      gfx.fillStyle = "#7a5a32";
      gfx.beginPath();
      gfx.ellipse(0, 14, 12, 5, 0, 0, Math.PI * 2);
      gfx.fill();
      gfx.fillStyle = "#e8e2c8";
      roundRect(-13, -10, 26, 24, 3);
      gfx.fill();
      gfx.fillStyle = "#c4a06a";
      gfx.beginPath();
      gfx.ellipse(-4, 0, 8, 5, 0.3, 0, Math.PI * 2);
      gfx.ellipse(5, 4, 6, 4, -0.2, 0, Math.PI * 2);
      gfx.fill();
      gfx.fillStyle = "#2a2a2e";
      gfx.beginPath();
      gfx.arc(-8, -16, 2.2, 0, Math.PI * 2);
      gfx.arc(-4, -22, 1.6, 0, Math.PI * 2);
      gfx.fill();
      gfx.strokeStyle = "#2a2a2e";
      gfx.lineWidth = 1.4;
      gfx.beginPath();
      gfx.moveTo(-8, -16);
      gfx.lineTo(-4, -10);
      gfx.moveTo(-4, -22);
      gfx.lineTo(0, -10);
      gfx.stroke();
    }
    gfx.restore();
  }

  function drawFx() {
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      ctx.globalAlpha = Math.max(0, p.life / 24);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = "700 18px Outfit, Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#163428";
    for (let i = 0; i < state.popups.length; i += 1) {
      const p = state.popups[i];
      ctx.globalAlpha = Math.max(0, p.life / 40);
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  function mix(a, b, t) {
    const pa = hexToRgb(a);
    const pb = hexToRgb(b);
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return "rgb(" + r + "," + g + "," + bl + ")";
  }

  function hexToRgb(hex) {
    const n = hex.replace("#", "");
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }

  function roundRect(x, y, w, h, r) {
    gfx.beginPath();
    gfx.moveTo(x + r, y);
    gfx.arcTo(x + w, y, x + w, y + h, r);
    gfx.arcTo(x + w, y + h, x, y + h, r);
    gfx.arcTo(x, y + h, x, y, r);
    gfx.arcTo(x, y, x + w, y, r);
    gfx.closePath();
  }

  function draw() {
    gfx = ctx;
    drawSky();
    drawWorld();
    for (let i = 0; i < state.items.length; i += 1) drawItem(state.items[i]);
    drawGround();
    drawPlayer();
    drawFx();
    if (state.flash > 0) {
      ctx.fillStyle = "rgba(180,40,20," + (state.flash / 18) + ")";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  function loop(t) {
    try {
      if (!state.last) state.last = t;
      state.acc += Math.min(50, t - state.last);
      state.last = t;
      while (state.acc >= 1000 / 60) {
        update();
        state.acc -= 1000 / 60;
      }
      draw();
    } finally {
      requestAnimationFrame(loop);
    }
  }

  function createAudio() {
    let ctxAudio = null;
    function ensure() {
      if (!ctxAudio) ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
      return ctxAudio;
    }
    function beep(freq, dur, type, gain) {
      const a = ensure();
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(g);
      g.connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur);
    }
    return {
      resume: function () {
        const a = ensure();
        if (a.state === "suspended") a.resume();
      },
      score: function (combo) {
        beep(520 + Math.min(400, combo * 40), 0.1, "triangle", 0.05);
      },
      hit: function () {
        beep(150, 0.2, "sawtooth", 0.05);
      }
    };
  }

  function pointerToX(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    state.playerX = Math.max(PLAYER_W / 2, Math.min(WIDTH - PLAYER_W / 2, x));
  }

  function typing() {
    return document.activeElement === playerName;
  }

  playBtn.addEventListener("click", startGame);
  againBtn.addEventListener("click", startGame);
  boardPlayBtn.addEventListener("click", startGame);
  boardBtn.addEventListener("click", function () { showScreen("board"); });
  overBoardBtn.addEventListener("click", function () { showScreen("board"); });
  boardBackBtn.addEventListener("click", function () {
    showScreen(state.mode === "dead" ? "over" : "ready");
  });

  saveForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = playerName.value.trim().slice(0, 14) || "Player";
    localStorage.setItem(NAME_KEY, name);
    const board = loadBoard();
    const idx = board.findIndex(function (row) { return row.name.toLowerCase() === name.toLowerCase(); });
    if (idx >= 0) {
      if (state.score <= board[idx].score) {
        state.lastSavedName = name;
        saveForm.hidden = true;
        savedNote.hidden = false;
        return;
      }
      board[idx].score = state.score;
      board[idx].combo = state.bestCombo;
      board[idx].at = Date.now();
    } else {
      board.push({ name: name, score: state.score, combo: state.bestCombo, at: Date.now() });
    }
    board.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
    saveBoard(board);
    state.lastSavedName = name;
    saveForm.hidden = true;
    savedNote.hidden = false;
  });

  window.addEventListener("keydown", function (e) {
    if (typing()) return;
    const gameKey = ["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD"].indexOf(e.code) !== -1;
    const usingGame = gameInView || state.mode === "playing";
    if (gameKey && usingGame) e.preventDefault();
    if (!usingGame) return;
    keys.add(e.code);
    if (e.code === "Space" && overlay.hidden === false && state.screen !== "board") {
      startGame();
    }
  });
  window.addEventListener("keyup", function (e) { keys.delete(e.code); });

  canvas.addEventListener("pointerdown", function (e) {
    if (state.mode === "playing") pointerToX(e);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (state.mode === "playing") pointerToX(e);
  });

  if ("IntersectionObserver" in window && stage) {
    const observer = new IntersectionObserver(function (entries) {
      gameInView = entries.some(function (entry) {
        return entry.isIntersecting && entry.intersectionRatio >= 0.25;
      });
    }, { threshold: [0, 0.25, 0.6] });
    observer.observe(stage);
  }

  function paintRules() {
    fillRuleRow("eco-rules-good", GOOD_ITEMS);
    fillRuleRow("eco-rules-bad", BAD_ITEMS);
    gfx = ctx;
  }

  function fillRuleRow(id, types) {
    const row = document.getElementById(id);
    if (!row) return;
    for (let i = 0; i < types.length; i += 1) {
      const mini = document.createElement("canvas");
      mini.width = 80;
      mini.height = 80;
      gfx = mini.getContext("2d");
      drawItem({ type: types[i], x: 40, y: 42, rot: 0 });
      row.appendChild(mini);
    }
  }

  paintRules();
  requestAnimationFrame(loop);
})();
