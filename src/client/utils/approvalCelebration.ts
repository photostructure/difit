import type { ApprovalAnimation } from '../components/SettingsModal';

// Units are CSS pixels and seconds.
const GRAVITY = 800;
const FADE = 0.8;
const STEP = 1 / 120;
const MAX_FRAME = 0.1;
/** Longer than any screen's diagonal, so laser beams always reach the edge. */
const BEAM_LENGTH = 4000;
const PALETTE = [
  '#f43f5e',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
];
const LASER_COLORS = ['#39ff14', '#ff3131', '#00e5ff', '#ff2bd6', '#3d5afe'];

type PieceKind = 'paper' | 'ribbon' | 'sparkle' | 'rocket' | 'ember' | 'spiral' | 'laser' | 'disco';

/** Ribbons and spirals drift down slower than paper; lasers and the disco ball ignore gravity. */
const GRAVITY_SCALE: Record<PieceKind, number> = {
  paper: 1,
  ribbon: 0.7,
  sparkle: 0.15,
  rocket: 1,
  ember: 0.35,
  spiral: 0.3,
  laser: 0,
  disco: 0,
};

interface Piece {
  kind: PieceKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Linear air drag per second; paper scales it by how face-on it is to the fall. */
  drag: number;
  color: string;
  /** Paper and ribbon width, sparkle and ember size, or spiral and disco ball radius. */
  width: number;
  /** Paper height, or the angle between a laser's beams. */
  height: number;
  /** In-plane rotation: tumble, spin, a laser's sweep phase, or the disco ball's turn. */
  spin: number;
  spinRate: number;
  /**
   * Out-of-plane rotation: paper's visible face width, a ribbon's twist along
   * its length, or a laser's brightness pulse.
   */
  flip: number;
  flipRate: number;
  /** Phase and strength of the sideways lift that makes pieces sway as they move. */
  sway: number;
  swayRate: number;
  swayForce: number;
  /** A ribbon's curl: loop radius, advance per radian along its length, and number of loops. */
  coilRadius: number;
  coilPitch: number;
  coilTurns: number;
  /** Laser beams, spiral arms, or disco ball light specks. */
  parts: number;
  /** Where a laser points first (the Approve button), or where the disco ball comes to rest. */
  targetX: number;
  targetY: number;
  /** How far the disco ball throws its light specks. */
  reach: number;
  /** Seconds since launch; negative while a firework waits its turn. */
  age: number;
  /** Seconds left to live; most pieces last until they leave the screen. */
  life: number;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)] as T;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

interface Launch {
  origin: DOMRect;
  cx: number;
  cy: number;
  /** Direction toward the middle of the viewport, so the pieces stay on screen. */
  aim: number;
  viewport: { width: number; height: number };
}

const still = {
  vx: 0,
  vy: 0,
  drag: 0,
  width: 0,
  height: 0,
  spin: 0,
  spinRate: 0,
  flip: 0,
  flipRate: 0,
  sway: 0,
  swayRate: 0,
  swayForce: 0,
  coilRadius: 0,
  coilPitch: 0,
  coilTurns: 0,
  parts: 0,
  targetX: 0,
  targetY: 0,
  reach: 0,
  age: 0,
  life: Infinity,
};

const BURSTS: Record<
  ApprovalAnimation,
  { count: number; duration: number; make: (at: Launch) => Piece }
> = {
  confetti: {
    count: 140,
    duration: 4.2,
    make: ({ origin, cy, aim }) => {
      const angle = aim + random(-1, 1) * random(0.3, 1.1);
      const speed = random(600, 1800);
      const width = random(5, 9);
      return {
        ...still,
        kind: 'paper',
        x: random(origin.left, origin.right),
        y: cy + random(-4, 4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - random(150, 450),
        drag: random(2.4, 3.6),
        color: pick(PALETTE),
        width,
        height: width * random(0.45, 1.6),
        spin: random(0, Math.PI * 2),
        spinRate: random(-9, 9),
        flip: random(0, Math.PI * 2),
        flipRate: random(6, 16),
        sway: random(0, Math.PI * 2),
        swayRate: random(2.5, 5),
        swayForce: random(120, 320),
      };
    },
  },
  streamers: {
    count: 36,
    duration: 5.5,
    make: ({ origin, cy, aim }) => {
      const angle = aim + random(-1, 1);
      const speed = random(600, 1400);
      return {
        ...still,
        kind: 'ribbon',
        x: random(origin.left, origin.right),
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - random(200, 450),
        drag: random(2.6, 3.2),
        color: pick(PALETTE),
        width: random(4, 6),
        spin: random(0, Math.PI * 2),
        spinRate: random(-2.5, 2.5),
        flip: random(0, Math.PI * 2),
        flipRate: random(4, 9),
        sway: random(0, Math.PI * 2),
        swayRate: random(1.5, 3),
        swayForce: random(60, 160),
        // A pitch below the radius makes the curl cross over itself into loops.
        coilRadius: random(5, 9),
        coilPitch: random(1.6, 2.6),
        coilTurns: random(2, 3.5),
      };
    },
  },
  sparkles: {
    count: 90,
    duration: 4.2,
    make: ({ cx, cy }) => {
      const angle = random(0, Math.PI * 2);
      const speed = random(150, 900);
      return {
        ...still,
        kind: 'sparkle',
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: random(3, 6),
        color: pick(['#fde047', '#fef9c3', '#fbbf24', '#ffffff']),
        width: random(4, 9),
        spin: random(0, Math.PI),
        spinRate: random(-6, 6),
        life: random(0.7, 1.6),
      };
    },
  },
  // Rockets launch from the bottom edge, one after another, and burst at the top of their arc.
  fireworks: {
    count: 5,
    duration: 4.5,
    make: ({ viewport }) => {
      const rise = random(0.45, 0.75) * viewport.height;
      return {
        ...still,
        kind: 'rocket',
        x: random(0.15, 0.85) * viewport.width,
        y: viewport.height + 10,
        vx: random(-60, 60),
        // Without drag, this speed peaks exactly `rise` above the launch point.
        vy: -Math.sqrt(2 * GRAVITY * rise),
        color: pick(PALETTE),
        width: 2.5,
        age: -random(0, 1.2),
      };
    },
  },
  spirals: {
    count: 14,
    duration: 4.5,
    make: ({ origin, cy, aim }) => {
      const angle = aim + random(-1.1, 1.1);
      const speed = random(300, 900);
      return {
        ...still,
        kind: 'spiral',
        x: random(origin.left, origin.right),
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - random(100, 300),
        drag: random(2.2, 3),
        color: pick(PALETTE),
        width: random(14, 24),
        spin: random(0, Math.PI * 2),
        spinRate: random(4, 8) * (Math.random() < 0.5 ? -1 : 1),
        sway: random(0, Math.PI * 2),
        swayRate: random(1.5, 3),
        swayForce: random(40, 100),
        parts: pick([3, 4, 5]),
      };
    },
  },
  // Emitters along the bottom edge aim their beams at the Approve button, then sweep.
  lasers: {
    count: 6,
    duration: 4,
    make: ({ cx, cy, viewport }) => ({
      ...still,
      kind: 'laser',
      x: random(0.06, 0.94) * viewport.width,
      y: viewport.height + 2,
      color: pick(LASER_COLORS),
      height: random(0.07, 0.14),
      spin: random(0, Math.PI * 2),
      spinRate: random(1.4, 2.4) * (Math.random() < 0.5 ? -1 : 1),
      flip: random(0, Math.PI * 2),
      flipRate: random(7, 12),
      parts: pick([3, 4, 5]),
      targetX: cx,
      targetY: cy,
    }),
  },
  // One mirror ball drops in on a line, bobs to rest, spins, and rises back out.
  disco: {
    count: 1,
    duration: 5,
    make: ({ viewport }) => ({
      ...still,
      kind: 'disco',
      x: viewport.width / 2,
      y: -60,
      drag: 6,
      color: '#cbd5e1',
      width: 40,
      spinRate: 1.6,
      parts: 90,
      targetY: viewport.height * 0.24,
      reach: viewport.width * 0.6,
    }),
  },
};

/** The disco ball rests on its line this long before it is pulled back up. */
const DISCO_REST = 3.6;

function burstRocket(rocket: Piece, spawn: (piece: Piece) => void) {
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2 + random(-0.05, 0.05);
    // Most embers fly at one speed so the burst reads as a ring; the rest fill it in.
    const speed = Math.random() < 0.7 ? random(230, 260) : random(40, 220);
    spawn({
      ...still,
      kind: 'ember',
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(angle) * speed + rocket.vx,
      vy: Math.sin(angle) * speed,
      drag: random(1.1, 1.5),
      color: Math.random() < 0.15 ? '#ffffff' : rocket.color,
      width: random(1.5, 2.5),
      life: random(1.1, 1.7),
    });
  }
}

function step(piece: Piece, dt: number, spawn: (piece: Piece) => void) {
  piece.age += dt;
  if (piece.age < 0) return;
  piece.spin += piece.spinRate * dt;
  piece.flip += piece.flipRate * dt;
  piece.sway += piece.swayRate * dt;
  if (piece.kind === 'disco') {
    // A spring on the line pulls the ball to its resting height, then back up out of sight.
    const target = piece.age < DISCO_REST ? piece.targetY : -piece.width * 4;
    piece.vy += (target - piece.y) * 30 * dt;
  }
  // A piece edge-on to the air falls fastest; face-on, it catches the air and slows.
  const drag =
    piece.kind === 'paper'
      ? piece.drag * (0.35 + 0.65 * Math.abs(Math.cos(piece.flip)))
      : piece.drag;
  const damping = Math.exp(-drag * dt);
  piece.vx = (piece.vx + Math.sin(piece.sway) * piece.swayForce * dt) * damping;
  piece.vy = (piece.vy + GRAVITY * GRAVITY_SCALE[piece.kind] * dt) * damping;
  piece.x += piece.vx * dt;
  piece.y += piece.vy * dt;
  piece.life -= dt;

  if (piece.kind === 'rocket') {
    if (Math.random() < 0.5) {
      spawn({
        ...still,
        kind: 'ember',
        x: piece.x,
        y: piece.y,
        vx: random(-20, 20),
        vy: random(0, 40),
        drag: 3,
        color: '#fde68a',
        width: 1.2,
        life: random(0.25, 0.45),
      });
    }
    if (piece.vy >= 0) {
      piece.life = 0;
      burstRocket(piece, spawn);
    }
  }
}

function drawPaper(ctx: CanvasRenderingContext2D, piece: Piece) {
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.spin);
  const face = Math.cos(piece.flip);
  ctx.scale(1, face);
  ctx.fillStyle = piece.color;
  ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
  // Shade the back of the paper as it turns over.
  if (face < 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
  }
  ctx.restore();
}

function drawRibbon(ctx: CanvasRenderingContext2D, piece: Piece) {
  const span = piece.coilTurns * Math.PI * 2;
  const segments = Math.ceil(piece.coilTurns * 16);
  // A curled ribbon seen from the side: a helix flattened into loops, centered on the piece.
  const offset = (piece.coilPitch * span) / 2;
  const edges = Array.from({ length: segments + 1 }, (_, i) => {
    const t = (span * i) / segments;
    const x = piece.coilPitch * t - offset + piece.coilRadius * Math.cos(t);
    const y = piece.coilRadius * Math.sin(t);
    const dx = piece.coilPitch - piece.coilRadius * Math.sin(t);
    const dy = piece.coilRadius * Math.cos(t);
    const length = Math.hypot(dx, dy);
    // The twist turns the flat ribbon edge-on and back, so its width and face change along it.
    const half = (piece.width / 2) * Math.cos(t * 0.5 + piece.flip);
    const nx = (-dy / length) * half;
    const ny = (dx / length) * half;
    return { half, left: [x + nx, y + ny], right: [x - nx, y - ny] } as const;
  });

  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.spin);
  for (const [i, a] of edges.entries()) {
    const b = edges[i + 1];
    if (!b) break;
    ctx.beginPath();
    ctx.moveTo(...a.left);
    ctx.lineTo(...b.left);
    ctx.lineTo(...b.right);
    ctx.lineTo(...a.right);
    ctx.fillStyle = piece.color;
    ctx.fill();
    // Shade the back of the ribbon where the twist shows it.
    if (a.half + b.half < 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, piece: Piece) {
  // A four-point twinkle that shrinks as it burns out.
  const radius = piece.width * clamp01(piece.life / 0.4);
  const inner = radius * 0.28;
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.spin);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? radius : inner;
    const a = (i * Math.PI) / 4;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = piece.color;
  ctx.shadowColor = piece.color;
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.restore();
}

/** Rockets and embers draw as short streaks behind their direction of travel. */
function drawStreak(ctx: CanvasRenderingContext2D, piece: Piece, length: number) {
  ctx.save();
  if (piece.kind === 'ember') ctx.globalAlpha *= clamp01(piece.life / 0.5);
  ctx.strokeStyle = piece.kind === 'rocket' ? '#fde68a' : piece.color;
  ctx.lineWidth = piece.width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(piece.x, piece.y);
  ctx.lineTo(piece.x - piece.vx * length, piece.y - piece.vy * length);
  ctx.stroke();
  ctx.restore();
}

function drawSpiral(ctx: CanvasRenderingContext2D, piece: Piece) {
  // The arms unwind from the center as the spiral blooms.
  const bloom = 1 - Math.exp(-piece.age * 2.5);
  const sweep = Math.PI * 2.4;
  const colorIndex = PALETTE.indexOf(piece.color);
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.spin);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let arm = 0; arm < piece.parts; arm++) {
    const turn = (arm * Math.PI * 2) / piece.parts;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const theta = (sweep * bloom * i) / 24;
      const r = (piece.width * theta) / sweep;
      if (i === 0) ctx.moveTo(0, 0);
      else ctx.lineTo(Math.cos(theta + turn) * r, Math.sin(theta + turn) * r);
    }
    ctx.strokeStyle = PALETTE[(colorIndex + arm) % PALETTE.length] ?? piece.color;
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLaser(ctx: CanvasRenderingContext2D, piece: Piece) {
  const toButton = Math.atan2(piece.targetY - piece.y, piece.targetX - piece.x);
  const sweep = -Math.PI / 2 + Math.sin(piece.spin) * 0.8;
  // The beams lock onto the Approve button together, then break away into sweeps.
  const t = clamp01((piece.age - 0.6) / 0.6);
  const release = t * t * (3 - 2 * t);
  const center = toButton + (sweep - toButton) * release;
  const spread = piece.height * release;
  const alpha = ctx.globalAlpha * clamp01(piece.age / 0.12) * (0.7 + 0.3 * Math.sin(piece.flip));

  ctx.save();
  // Additive light: crossing beams flare brighter, like stage haze.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = piece.color;
  ctx.fillStyle = piece.color;
  ctx.lineCap = 'round';
  for (let beam = 0; beam < piece.parts; beam++) {
    const angle = center + (beam - (piece.parts - 1) / 2) * spread;
    ctx.beginPath();
    ctx.moveTo(piece.x, piece.y);
    ctx.lineTo(piece.x + Math.cos(angle) * BEAM_LENGTH, piece.y + Math.sin(angle) * BEAM_LENGTH);
    ctx.globalAlpha = alpha * 0.16;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.9;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(piece.x, piece.y - 1, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDisco(ctx: CanvasRenderingContext2D, piece: Piece) {
  const { x, y, width: r } = piece;
  const fade = ctx.globalAlpha;
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, y - r);
  ctx.stroke();

  const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  shine.addColorStop(0, '#f8fafc');
  shine.addColorStop(0.6, '#94a3b8');
  shine.addColorStop(1, '#334155');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Mirror tiles on the near side slide across the ball as it turns.
  for (let row = -4; row <= 4; row++) {
    const lat = (row / 5) * (Math.PI / 2);
    for (let col = 0; col < 12; col++) {
      const lon = (col * Math.PI * 2) / 12 + piece.spin;
      const facing = Math.cos(lon) * Math.cos(lat);
      if (facing <= 0) continue;
      const glint = (row + col) % 3 === 0 ? 0.85 : 0.3;
      ctx.fillStyle = `rgba(255, 255, 255, ${glint * facing})`;
      ctx.fillRect(
        x + r * Math.cos(lat) * Math.sin(lon) - 1.5 * facing,
        y + r * Math.sin(lat) - 1.5,
        3 * facing,
        3,
      );
    }
  }
  ctx.restore();

  // The specks go out as soon as the ball starts to rise.
  if (piece.age >= DISCO_REST) return;

  // Each speck is light off one facet, so it sweeps across the page as the ball turns.
  const show = clamp01((piece.age - 0.7) / 0.4);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < piece.parts; i++) {
    // Spread the facets evenly over the sphere (a Fibonacci lattice).
    const lat = Math.asin(-1 + (2 * (i + 0.5)) / piece.parts);
    const lon = i * 2.39996 + piece.spin;
    const facing = Math.cos(lon);
    if (facing <= 0) continue;
    ctx.globalAlpha = fade * show * (0.45 + 0.5 * facing);
    ctx.fillStyle = i % 3 === 0 ? (PALETTE[i % PALETTE.length] ?? '#ffffff') : '#ffffff';
    ctx.beginPath();
    ctx.ellipse(
      x + Math.sin(lon) * Math.cos(lat) * piece.reach,
      y + r + (0.55 + 0.5 * Math.sin(lat)) * piece.reach * 0.9,
      3 + 6 * facing,
      2.5 + 3.5 * facing,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, piece: Piece) {
  if (piece.age < 0) return;
  switch (piece.kind) {
    case 'paper':
      return drawPaper(ctx, piece);
    case 'ribbon':
      return drawRibbon(ctx, piece);
    case 'sparkle':
      return drawSparkle(ctx, piece);
    case 'rocket':
      return drawStreak(ctx, piece, 0.025);
    case 'ember':
      return drawStreak(ctx, piece, 0.03);
    case 'spiral':
      return drawSpiral(ctx, piece);
    case 'laser':
      return drawLaser(ctx, piece);
    case 'disco':
      return drawDisco(ctx, piece);
  }
}

/** Picks one enabled animation at random, or null when all of them are off. */
export function pickApprovalAnimation(
  animations: Record<ApprovalAnimation, boolean>,
): ApprovalAnimation | null {
  // Read only the animations this build knows; saved settings are shared with other difit versions.
  const enabled = (Object.keys(BURSTS) as ApprovalAnimation[]).filter(
    (animation) => animations[animation],
  );
  return enabled.length > 0 ? pick(enabled) : null;
}

/**
 * Fires one burst over the whole page from `source`, picked at random from the
 * enabled animations. The burst is not tied to a component, so re-rendering or
 * remounting the page cannot replay it; its canvas removes itself when it ends.
 */
export function celebrateApproval(
  source: Element,
  animations: Record<ApprovalAnimation, boolean>,
): void {
  const animation = pickApprovalAnimation(animations);
  if (!animation || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = window.devicePixelRatio;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'pointer-events-none fixed inset-0 z-50';
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  // getContext returns null where canvas is unsupported, such as in happy-dom.
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.appendChild(canvas);

  const origin = source.getBoundingClientRect();
  const cx = origin.left + origin.width / 2;
  const cy = origin.top + origin.height / 2;
  const viewport = { width, height };
  const at = { origin, cx, cy, aim: Math.atan2(height / 2 - cy, width / 2 - cx), viewport };
  const { count, duration, make } = BURSTS[animation];
  const isAlive = (piece: Piece) => piece.life > 0 && piece.y < height + 40;
  let pieces = Array.from({ length: count }, () => make(at));
  const spawned: Piece[] = [];
  const spawn = (piece: Piece) => {
    spawned.push(piece);
  };
  let elapsed = 0;
  let pending = 0;
  let last = performance.now();
  requestAnimationFrame(function tick(now) {
    // Fixed physics steps keep the flight real-time and stable when frames are dropped.
    pending += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    for (; pending >= STEP; pending -= STEP) {
      elapsed += STEP;
      for (const piece of pieces) if (isAlive(piece)) step(piece, STEP, spawn);
      pieces.push(...spawned.splice(0));
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.min(1, (duration - elapsed) / FADE);

    pieces = pieces.filter(isAlive);
    for (const piece of pieces) draw(ctx, piece);

    if (pieces.length > 0 && elapsed < duration) requestAnimationFrame(tick);
    else canvas.remove();
  });
}
