import { ARENA, TUNING, type NeonGame, type GameEvent } from './game';
export const THEMES = [
  { name: 'ION DISTRICT', accent: '#59edda', second: '#aa88ff', background: '#0b1426' },
  { name: 'ULTRAVIOLET', accent: '#b797ff', second: '#ff8bd6', background: '#18102c' },
  { name: 'SOLAR CIRCUIT', accent: '#ffc17a', second: '#ff729c', background: '#221522' },
];
export const PLAYER_COLORS = ['#59edda', '#ff8bd6'];
const BUBBLE_COLORS = ['#ffe39a', '#ff8acb', '#ae97ff', '#67e4ed'];
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
export class NeonView {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private sequence = 0;
  private background = document.createElement('canvas');
  private backgroundKey = '';
  private bubbleSprites = new Map<number, HTMLCanvasElement>();
  low = false;
  reduced = false;
  constructor(public canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.ctx = context;
    this.resize();
  }
  resize() {
    const scale = Math.min(this.low ? 1 : 1.7, devicePixelRatio || 1);
    this.canvas.width = Math.round(ARENA.width * scale);
    this.canvas.height = Math.round(ARENA.height * scale);
    this.background.width = this.canvas.width;
    this.background.height = this.canvas.height;
    this.backgroundKey = '';
    this.bubbleSprites.clear();
  }
  clear() {
    this.particles = [];
  }
  event(event: GameEvent) {
    if (this.reduced || event.type === 'fire') return;
    const count = this.low ? 5 : event.type === 'clear' ? 40 : 16;
    const color =
      event.type === 'hit'
        ? '#ff8bd6'
        : event.type === 'pickup'
          ? '#ffe39a'
          : BUBBLE_COLORS[event.size ?? 3];
    for (let i = 0; i < count; i++) {
      const angle = ((i + this.sequence++) * 2.39996) % (Math.PI * 2);
      this.particles.push({
        x: event.x,
        y: event.y,
        vx: Math.cos(angle) * (60 + i * 4),
        vy: Math.sin(angle) * (60 + i * 4),
        life: 0.65,
        color,
      });
    }
    this.particles = this.particles.slice(-TUNING.maxParticles);
  }
  private drawBackground(game: NeonGame) {
    const c = this.background.getContext('2d')!,
      theme = THEMES[game.stage.theme];
    c.setTransform(this.canvas.width / 960, 0, 0, this.canvas.height / 540, 0, 0);
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.fillStyle = theme.background;
    c.fillRect(0, 0, 960, 540);
    const glow = c.createRadialGradient(480, 210, 20, 480, 210, 530);
    glow.addColorStop(0, theme.accent + '16');
    glow.addColorStop(1, theme.background);
    c.fillStyle = glow;
    c.fillRect(0, 0, 960, 540);
    c.strokeStyle = theme.accent + '0c';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= 960; x += 48) {
      c.moveTo(x, 48);
      c.lineTo(x, 500);
    }
    for (let y = 68; y <= 500; y += 48) {
      c.moveTo(0, y);
      c.lineTo(960, y);
    }
    c.stroke();
    c.strokeStyle = theme.accent + '18';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(480, 260, 170, Math.PI, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(480, 260, 190, Math.PI, Math.PI * 2);
    c.stroke();
    c.font = '500 10px "DM Sans"';
    c.fillStyle = theme.accent + '99';
    c.textAlign = 'left';
    c.fillText(theme.name, 25, 29);
    c.textAlign = 'left';
    c.fillStyle = '#090e19';
    c.fillRect(0, 500, 960, 40);
    c.shadowColor = theme.accent;
    c.shadowBlur = this.low ? 0 : 12;
    c.strokeStyle = theme.accent;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 501);
    c.lineTo(960, 501);
    c.stroke();
    c.shadowBlur = 0;
    for (const p of game.stage.platforms) {
      c.fillStyle = theme.accent + '22';
      c.fillRect(p.x, p.y, p.w, p.h);
      c.strokeStyle = theme.accent;
      c.lineWidth = 2;
      c.strokeRect(p.x, p.y, p.w, p.h);
      c.fillStyle = theme.accent + '55';
      for (let x = p.x + 8; x < p.x + p.w - 6; x += 16) c.fillRect(x, p.y + 5, 6, 4);
    }
  }
  private bubbleSprite(size: number) {
    const cached = this.bubbleSprites.get(size);
    if (cached) return cached;
    const sprite = document.createElement('canvas');
    const radius = TUNING.radius[size],
      center = radius + 24;
    const scale = this.canvas.width / 960;
    sprite.width = sprite.height = Math.ceil(center * 2 * scale);
    const c = sprite.getContext('2d')!,
      color = BUBBLE_COLORS[size];
    c.scale(scale, scale);
    c.shadowBlur = this.low ? 0 : 18;
    c.shadowColor = color;
    const fill = c.createRadialGradient(
      center - radius * 0.35,
      center - radius * 0.4,
      0,
      center,
      center,
      radius,
    );
    fill.addColorStop(0, color + '48');
    fill.addColorStop(0.7, color + '0b');
    fill.addColorStop(1, color + '55');
    c.fillStyle = fill;
    c.strokeStyle = color;
    c.lineWidth = 1.8;
    c.beginPath();
    c.arc(center, center, radius, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = '#ffffffa8';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(center, center, radius * 0.72, Math.PI * 1.1, Math.PI * 1.55);
    c.stroke();
    this.bubbleSprites.set(size, sprite);
    return sprite;
  }
  draw(game: NeonGame, dt: number) {
    const c = this.ctx,
      theme = THEMES[game.stage.theme];
    const key = `${game.stageIndex}:${this.low}`;
    if (this.backgroundKey !== key) {
      this.drawBackground(game);
      this.backgroundKey = key;
      this.bubbleSprites.clear();
    }
    c.setTransform(this.canvas.width / 960, 0, 0, this.canvas.height / 540, 0, 0);
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.drawImage(this.background, 0, 0, 960, 540);
    c.font = '500 10px "DM Sans"';
    c.fillStyle = theme.accent + '99';
    c.textAlign = 'right';
    c.fillText(
      `${game.bubbles.length} SIGNAL${game.bubbles.length === 1 ? '' : 'S'} REMAINING`,
      935,
      29,
    );
    for (const h of game.harpoons) {
      const color = PLAYER_COLORS[h.owner];
      c.shadowColor = color;
      c.shadowBlur = this.low ? 0 : 12;
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(h.x, 493);
      c.lineTo(h.x, h.tip);
      c.stroke();
      c.beginPath();
      c.moveTo(h.x - 5, h.tip + 8);
      c.lineTo(h.x, h.tip);
      c.lineTo(h.x + 5, h.tip + 8);
      c.stroke();
      c.shadowBlur = 0;
    }
    for (const b of game.bubbles) {
      const radius = TUNING.radius[b.size] + 24;
      const sprite = this.bubbleSprite(b.size),
        scale = this.canvas.width / 960;
      c.drawImage(sprite, b.x - radius, b.y - radius, sprite.width / scale, sprite.height / scale);
    }
    for (const pickup of game.pickups) {
      c.globalAlpha = pickup.life < 2 ? 0.55 + Math.sin(pickup.life * 12) * 0.25 : 1;
      c.fillStyle = '#172534';
      c.strokeStyle = '#ffe39a';
      c.lineWidth = 1.5;
      c.beginPath();
      c.roundRect(pickup.x - 12, pickup.y - 12, 24, 24, 5);
      c.fill();
      c.stroke();
      c.textAlign = 'center';
      c.font = 'bold 14px "DM Sans"';
      c.fillStyle = '#ffe39a';
      c.fillText({ double: 'Ⅱ', slow: '◷', shield: '◇' }[pickup.power], pickup.x, pickup.y + 5);
      c.globalAlpha = 1;
    }
    for (const p of game.players) {
      const color = PLAYER_COLORS[p.id],
        y = 500;
      c.globalAlpha =
        p.invincible > 0 && !this.reduced ? 0.6 + 0.4 * Math.sin(p.invincible * 22) : 1;
      c.shadowBlur = this.low ? 0 : 10;
      c.shadowColor = color;
      c.fillStyle = color;
      c.beginPath();
      c.roundRect(p.x - 11, y - 35, 22, 25, 7);
      c.fill();
      c.fillRect(p.x - 11, y - 13, 7, 12);
      c.fillRect(p.x + 4, y - 13, 7, 12);
      c.fillStyle = '#112131';
      c.beginPath();
      c.roundRect(p.x - 8, y - 30, 16, 8, 3);
      c.fill();
      c.fillStyle = '#f1ffff';
      c.fillRect(p.x + 2, y - 28, 3, 3);
      c.fillStyle = '#cfebf4';
      c.fillRect(p.x - 3, y - 42, 6, 10);
      c.shadowBlur = 0;
      if (p.shield) {
        c.strokeStyle = '#ffe39a';
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(p.x, y - 23, 24, 31, 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalAlpha = 1;
      c.font = '500 10px "DM Sans"';
      c.textAlign = 'center';
      c.fillStyle = color;
      c.fillText(`P${p.id + 1}`, p.x, 522);
    }
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      c.globalAlpha = Math.max(0, p.life / 0.65);
      c.fillStyle = p.color;
      c.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    c.globalAlpha = 1;
    if (game.phase === 'ready') {
      c.fillStyle = '#09132166';
      c.fillRect(0, 48, 960, 452);
      c.textAlign = 'center';
      c.fillStyle = '#edfcf6';
      c.font = '800 76px "Barlow Condensed"';
      c.fillText(`${Math.max(1, Math.ceil(game.countdown))}`, 480, 268);
      c.font = '500 11px "DM Sans"';
      c.fillStyle = theme.accent;
      c.fillText('GET READY', 480, 297);
    }
  }
}
