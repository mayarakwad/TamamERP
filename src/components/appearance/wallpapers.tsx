// Built-in dashboard wallpapers, drawn as SVG that takes its colours from the
// active theme (CSS variables), so every wallpaper works in every theme and in
// dark mode. No image files, no licensing questions.

import type { WallpaperId } from "@/lib/prefs";

const mix = (color: string, pct: number, base = "var(--bg)") => `color-mix(in oklch, ${color} ${pct}%, ${base})`;

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function Mashrabiya() {
  // Eight-pointed stars (two squares at 45°) linked by a lattice, the motif of
  // carved wooden window screens across the Gulf. No viewBox: the 60px tile
  // keeps its size on any screen shape.
  const star = "M30 9 L36 24 L51 30 L36 36 L30 51 L24 36 L9 30 L24 24 Z";
  return (
    <svg width="100%" height="100%" aria-hidden>
      <defs>
        <linearGradient id="wp-m-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: mix("var(--accent)", 6) }} />
          <stop offset="1" style={{ stopColor: mix("var(--accent)", 18) }} />
        </linearGradient>
        <pattern id="wp-m" width="60" height="60" patternUnits="userSpaceOnUse">
          <g fill="none" style={{ stroke: mix("var(--accent)", 38) }} strokeWidth="1.1">
            <path d={star} />
            <rect x="17" y="17" width="26" height="26" transform="rotate(45 30 30)" />
            <rect x="17" y="17" width="26" height="26" />
            <path d="M0 30 H9 M51 30 H60 M30 0 V9 M30 51 V60" />
            <circle cx="0" cy="0" r="4" />
            <circle cx="60" cy="0" r="4" />
            <circle cx="0" cy="60" r="4" />
            <circle cx="60" cy="60" r="4" />
          </g>
        </pattern>
        <radialGradient id="wp-m-fade" cx="0.75" cy="0.2" r="0.9">
          <stop offset="0" stopColor="white" stopOpacity="1" />
          <stop offset="1" stopColor="white" stopOpacity="0.15" />
        </radialGradient>
        <mask id="wp-m-mask">
          <rect width="100%" height="100%" fill="url(#wp-m-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#wp-m-bg)" />
      <rect width="100%" height="100%" fill="url(#wp-m)" mask="url(#wp-m-mask)" />
    </svg>
  );
}

function Dunes() {
  const layers = [
    { d: "M0 560 C 260 470 420 520 640 470 S 1080 380 1300 430 S 1520 470 1600 440 V1000 H0 Z", c: mix("var(--accent)", 14) },
    { d: "M0 650 C 220 600 470 640 720 580 S 1150 520 1400 590 S 1560 610 1600 600 V1000 H0 Z", c: mix("var(--accent)", 22) },
    { d: "M0 760 C 300 700 520 760 820 700 S 1260 660 1600 720 V1000 H0 Z", c: mix("var(--accent)", 32) },
    { d: "M0 870 C 260 820 600 880 900 830 S 1350 800 1600 850 V1000 H0 Z", c: mix("var(--accent)", 44) },
  ];
  return (
    <svg width="100%" height="100%" preserveAspectRatio="xMidYMax slice" viewBox="0 0 1600 1000" aria-hidden>
      <defs>
        <linearGradient id="wp-d-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: mix("var(--accent)", 4) }} />
          <stop offset="1" style={{ stopColor: mix("#f2c060", 20) }} />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#wp-d-sky)" />
      <circle cx="1220" cy="300" r="90" style={{ fill: mix("#f2c060", 45) }} />
      {layers.map((l, i) => (
        <path key={i} d={l.d} style={{ fill: l.c }} />
      ))}
    </svg>
  );
}

function Corniche() {
  // A generic Gulf waterfront at dusk: towers, a dhow, reflections.
  const r = lcg(7);
  const towers: { x: number; w: number; h: number; top: "flat" | "spire" | "round" }[] = [];
  let x = 40;
  while (x < 1560) {
    const w = 34 + r() * 56;
    const h = 90 + r() * 300;
    towers.push({ x, w, h, top: r() < 0.25 ? "spire" : r() < 0.45 ? "round" : "flat" });
    x += w + 6 + r() * 18;
  }
  const horizon = 690;
  return (
    <svg width="100%" height="100%" preserveAspectRatio="xMidYMax slice" viewBox="0 0 1600 1000" aria-hidden>
      <defs>
        <linearGradient id="wp-c-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: mix("var(--accent)", 10) }} />
          <stop offset="0.7" style={{ stopColor: mix("#f08b73", 24) }} />
        </linearGradient>
        <linearGradient id="wp-c-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: mix("var(--accent)", 30) }} />
          <stop offset="1" style={{ stopColor: mix("var(--accent)", 12) }} />
        </linearGradient>
      </defs>
      <rect width="1600" height={horizon} fill="url(#wp-c-sky)" />
      <circle cx="1180" cy={horizon - 120} r="70" style={{ fill: mix("#f2c060", 55) }} />
      <g style={{ fill: mix("var(--accent)", 45) }}>
        {towers.map((t, i) => (
          <g key={i}>
            <rect x={t.x} y={horizon - t.h} width={t.w} height={t.h} rx={t.top === "round" ? t.w / 2 : 2} />
            {t.top === "spire" && <path d={`M${t.x + t.w / 2 - 3} ${horizon - t.h} L${t.x + t.w / 2} ${horizon - t.h - 60} L${t.x + t.w / 2 + 3} ${horizon - t.h} Z`} />}
          </g>
        ))}
      </g>
      <rect y={horizon} width="1600" height={1000 - horizon} fill="url(#wp-c-sea)" />
      <g style={{ fill: mix("var(--accent)", 30, "var(--surface)") }} opacity="0.6">
        {Array.from({ length: 26 }, (_, i) => (
          <rect key={i} x={(i * 137) % 1600} y={horizon + 20 + ((i * 53) % 260)} width={60 + ((i * 31) % 120)} height="3" rx="1.5" />
        ))}
      </g>
      {/* dhow */}
      <g transform={`translate(380 ${horizon + 70})`} style={{ fill: mix("var(--fg)", 55) }}>
        <path d="M0 40 Q 60 60 130 40 L120 52 Q 60 66 10 52 Z" />
        <path d="M60 40 L60 -40 L118 34 Z" opacity="0.85" />
      </g>
    </svg>
  );
}

function Sadu() {
  // Bands inspired by Sadu weaving: triangles, diamonds and stripes.
  const bands = [80, 260, 440, 620, 800];
  return (
    <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 1000" aria-hidden>
      <defs>
        <pattern id="wp-s-tri" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M0 40 L20 8 L40 40 Z" style={{ fill: mix("var(--accent)", 40) }} />
        </pattern>
        <pattern id="wp-s-dia" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M24 4 L44 24 L24 44 L4 24 Z" fill="none" style={{ stroke: mix("var(--accent)", 45) }} strokeWidth="3" />
          <path d="M24 16 L32 24 L24 32 L16 24 Z" style={{ fill: mix("#e0a030", 50) }} />
        </pattern>
      </defs>
      <rect width="1600" height="1000" style={{ fill: mix("var(--accent)", 5) }} />
      {bands.map((y, i) => (
        <g key={y}>
          <rect y={y} width="1600" height="8" style={{ fill: mix("var(--accent)", 28) }} />
          <rect y={y + 16} width="1600" height={i % 2 ? 48 : 40} fill={i % 2 ? "url(#wp-s-dia)" : "url(#wp-s-tri)"} opacity="0.9" />
          <rect y={y + (i % 2 ? 72 : 64)} width="1600" height="4" style={{ fill: mix("#e0a030", 40) }} />
        </g>
      ))}
    </svg>
  );
}

function Pearls() {
  const r = lcg(42);
  const pearls = Array.from({ length: 34 }, () => ({ x: r() * 1600, y: r() * 1000, s: 18 + r() * 110 }));
  return (
    <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 1000" aria-hidden>
      <defs>
        <radialGradient id="wp-p" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="white" stopOpacity="0.95" />
          <stop offset="0.45" style={{ stopColor: mix("var(--accent)", 10, "#fff") }} stopOpacity="0.7" />
          <stop offset="0.85" style={{ stopColor: mix("#6aaee6", 25, "var(--bg)") }} stopOpacity="0.5" />
          <stop offset="1" style={{ stopColor: mix("var(--accent)", 30) }} stopOpacity="0.35" />
        </radialGradient>
        <linearGradient id="wp-p-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: mix("var(--accent)", 8) }} />
          <stop offset="1" style={{ stopColor: mix("#6aaee6", 14) }} />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#wp-p-bg)" />
      {pearls.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.s / 2} fill="url(#wp-p)" opacity={0.55 + (i % 3) * 0.15} />
      ))}
    </svg>
  );
}

function Contours() {
  const r = lcg(11);
  const centers = [
    { x: 1150, y: 260 },
    { x: 300, y: 760 },
  ];
  const paths: string[] = [];
  for (const c of centers) {
    const phase = r() * Math.PI * 2;
    for (let ring = 1; ring <= 16; ring++) {
      const base = ring * 34;
      const pts: string[] = [];
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        const wobble = 1 + 0.12 * Math.sin(3 * t + phase + ring * 0.3) + 0.06 * Math.sin(5 * t - ring * 0.5);
        pts.push(`${(c.x + Math.cos(t) * base * 1.35 * wobble).toFixed(1)},${(c.y + Math.sin(t) * base * wobble).toFixed(1)}`);
      }
      paths.push(`M${pts.join(" L")} Z`);
    }
  }
  return (
    <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 1000" aria-hidden>
      <rect width="1600" height="1000" style={{ fill: mix("var(--accent)", 6) }} />
      <g fill="none" style={{ stroke: mix("var(--accent)", 40) }} strokeWidth="1.2">
        {paths.map((d, i) => (
          <path key={i} d={d} opacity={0.35 + (i % 16) / 30} />
        ))}
      </g>
    </svg>
  );
}

function Night() {
  const r = lcg(99);
  const stars = Array.from({ length: 140 }, () => ({ x: r() * 1600, y: r() * 640, s: r() * 1.8 + 0.4, o: 0.3 + r() * 0.7 }));
  return (
    <svg width="100%" height="100%" preserveAspectRatio="xMidYMax slice" viewBox="0 0 1600 1000" aria-hidden>
      <defs>
        <linearGradient id="wp-n-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1026" />
          <stop offset="0.7" style={{ stopColor: "color-mix(in oklch, var(--accent) 35%, #141a3a)" }} />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#wp-n-sky)" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff" opacity={s.o} />
      ))}
      <g transform="translate(1250 190)">
        <circle r="46" fill="#f7f0de" />
        <circle cx="18" cy="-10" r="42" fill="#0e1430" />
      </g>
      <path d="M0 800 C 280 730 520 780 820 720 S 1300 690 1600 750 V1000 H0 Z" fill="#0a0d1c" />
      <path d="M0 880 C 340 840 640 890 980 850 S 1400 830 1600 860 V1000 H0 Z" fill="#06080f" />
    </svg>
  );
}

export const WALLPAPERS: Record<Exclude<WallpaperId, "none" | "upload">, () => React.JSX.Element> = {
  mashrabiya: Mashrabiya,
  dunes: Dunes,
  corniche: Corniche,
  sadu: Sadu,
  pearls: Pearls,
  contours: Contours,
  night: Night,
};

export function WallpaperArt({ id }: { id: WallpaperId }) {
  if (id === "none" || id === "upload") return null;
  const Art = WALLPAPERS[id];
  return <Art />;
}

/** Full-bleed wallpaper with the person's dim and blur settings. */
export function WallpaperLayer({
  id,
  uploadUrl,
  dim,
  blur,
}: {
  id: WallpaperId;
  uploadUrl?: string | null;
  dim: number;
  blur: number;
}) {
  if (id === "none" || (id === "upload" && !uploadUrl)) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden no-print">
      <div
        className="absolute -inset-8"
        style={{
          filter: blur ? `blur(${blur}px)` : undefined,
          backgroundImage: id === "upload" && uploadUrl ? `url("${uploadUrl}")` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {id !== "upload" && <WallpaperArt id={id} />}
      </div>
      <div className="wallpaper-dim absolute inset-0" style={{ ["--wp-dim" as string]: dim }} />
    </div>
  );
}
