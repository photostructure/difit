import type { ApprovalAnimation } from '../components/SettingsModal';

// Units are CSS pixels and seconds.
const GRAVITY = 800;
const DURATION = 4.2;
const FADE = 0.8;
const STEP = 1 / 120;
const MAX_FRAME = 0.1;
/** Trail points, one per physics step. */
const STREAMER_LENGTH = 22;
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

interface Piece {
  kind: 'paper' | 'streamer' | 'sparkle';
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Linear air drag per second; paper scales it by how face-on it is to the fall. */
  drag: number;
  color: string;
  width: number;
  height: number;
  /** In-plane rotation. */
  spin: number;
  spinRate: number;
  /** Out-of-plane rotation; its cosine is the visible face width. */
  flip: number;
  flipRate: number;
  /** Phase and strength of the sideways lift that makes paper sway as it falls. */
  sway: number;
  swayRate: number;
  swayForce: number;
  trail: { x: number; y: number }[];
  /** Seconds a sparkle lives; paper and streamers last until they leave the screen. */
  life: number;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)] as T;

interface Launch {
  origin: DOMRect;
  cx: number;
  cy: number;
  /** Direction toward the middle of the viewport, so the pieces stay on screen. */
  aim: number;
}

const still = {
  spin: 0,
  spinRate: 0,
  flip: 0,
  flipRate: 0,
  sway: 0,
  swayRate: 0,
  swayForce: 0,
  trail: [],
  life: Infinity,
};

const BURSTS: Record<ApprovalAnimation, { count: number; make: (at: Launch) => Piece }> = {
  confetti: {
    count: 140,
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
    count: 40,
    make: ({ origin, cy, aim }) => {
      const angle = aim + random(-1, 1);
      const speed = random(700, 1500);
      const x = random(origin.left, origin.right);
      return {
        ...still,
        kind: 'streamer',
        x,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - random(250, 500),
        drag: random(2.4, 3),
        color: pick(PALETTE),
        width: random(2, 3),
        height: random(5, 9),
        spin: random(0, Math.PI * 2),
        spinRate: random(10, 18) * (Math.random() < 0.5 ? -1 : 1),
        trail: [{ x, y: cy }],
      };
    },
  },
  sparkles: {
    count: 90,
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
        height: 0,
        spin: random(0, Math.PI),
        spinRate: random(-6, 6),
        life: random(0.7, 1.6),
      };
    },
  },
};
function launch(
  animation: ApprovalAnimation,
  origin: DOMRect,
  viewport: { width: number; height: number },
): Piece[] {
  const cx = origin.left + origin.width / 2;
  const cy = origin.top + origin.height / 2;
  const at = { origin, cx, cy, aim: Math.atan2(viewport.height / 2 - cy, viewport.width / 2 - cx) };
  const { count, make } = BURSTS[animation];
  return Array.from({ length: count }, () => make(at));
}

function step(piece: Piece, dt: number) {
  piece.spin += piece.spinRate * dt;
  piece.flip += piece.flipRate * dt;
  piece.sway += piece.swayRate * dt;
  // A piece edge-on to the air falls fastest; face-on, it catches the air and slows.
  const drag =
    piece.kind === 'paper'
      ? piece.drag * (0.35 + 0.65 * Math.abs(Math.cos(piece.flip)))
      : piece.drag;
  const damping = Math.exp(-drag * dt);
  const gravity = piece.kind === 'sparkle' ? GRAVITY * 0.15 : GRAVITY;
  piece.vx = (piece.vx + Math.sin(piece.sway) * piece.swayForce * dt) * damping;
  piece.vy = (piece.vy + gravity * dt) * damping;
  piece.x += piece.vx * dt;
  piece.y += piece.vy * dt;
  piece.life -= dt;
  if (piece.kind === 'streamer') {
    piece.trail.unshift({ x: piece.x, y: piece.y });
    if (piece.trail.length > STREAMER_LENGTH) piece.trail.pop();
  }
}

function draw(ctx: CanvasRenderingContext2D, piece: Piece) {
  if (piece.kind === 'paper') {
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
    return;
  }

  if (piece.kind === 'streamer') {
    // Curl the ribbon around its own path, with the curl widening toward the tail.
    const { trail } = piece;
    ctx.beginPath();
    for (const [i, point] of trail.entries()) {
      const next = trail[i + 1] ?? point;
      const dx = point.x - next.x;
      const dy = point.y - next.y;
      const length = Math.hypot(dx, dy) || 1;
      const curl = Math.sin(piece.spin + i * 0.8) * piece.height * Math.min(1, i / 4);
      const x = point.x + (-dy / length) * curl;
      const y = point.y + (dx / length) * curl;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = piece.color;
    ctx.lineWidth = piece.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    return;
  }

  // A four-point twinkle that shrinks as it burns out.
  const radius = piece.width * Math.max(0, Math.min(1, piece.life / 0.4));
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

/**
 * Fires one burst over the whole page from `source`, picked at random from the
 * enabled animations. The burst is not tied to a component, so re-rendering or
 * remounting the page cannot replay it; its canvas removes itself when it ends.
 */
export function celebrateApproval(
  source: Element,
  animations: Record<ApprovalAnimation, boolean>,
): void {
  // Read only the animations this build knows; saved settings are shared with other difit versions.
  const enabled = (Object.keys(BURSTS) as ApprovalAnimation[]).filter(
    (animation) => animations[animation],
  );
  if (enabled.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

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

  const pieces = launch(pick(enabled), source.getBoundingClientRect(), { width, height });
  const isAlive = (piece: Piece) => piece.life > 0 && piece.y < height + 40;
  let elapsed = 0;
  let pending = 0;
  let last = performance.now();
  requestAnimationFrame(function tick(now) {
    // Fixed physics steps keep the flight real-time and stable when frames are dropped.
    pending += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    for (; pending >= STEP; pending -= STEP) {
      elapsed += STEP;
      for (const piece of pieces) if (isAlive(piece)) step(piece, STEP);
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.min(1, (DURATION - elapsed) / FADE);

    const alive = pieces.filter(isAlive);
    for (const piece of alive) draw(ctx, piece);

    if (alive.length > 0 && elapsed < DURATION) requestAnimationFrame(tick);
    else canvas.remove();
  });
}
