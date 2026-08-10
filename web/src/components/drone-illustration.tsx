export type DroneVariant = "quad" | "fpv" | "hex" | "fold" | "camera";

const ARM_LAYOUTS: Record<DroneVariant, number> = {
  quad: 4,
  fpv: 4,
  hex: 6,
  fold: 4,
  camera: 4,
};

function Propeller({
  x,
  y,
  accent,
  spin = 0,
}: {
  x: number;
  y: number;
  accent: string;
  spin?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${spin})`}>
      <ellipse cx="0" cy="0" rx="26" ry="6" fill={accent} opacity="0.22" />
      <ellipse
        cx="0"
        cy="0"
        rx="26"
        ry="6"
        transform="rotate(90)"
        fill={accent}
        opacity="0.22"
      />
      <circle cx="0" cy="0" r="9" fill="#0f172a" />
      <circle cx="0" cy="0" r="4" fill={accent} />
    </g>
  );
}

/**
 * Flat-illustration drone graphic used in place of stock product photography.
 * Deterministic per (variant, accent) so the same product always renders identically.
 */
export function DroneIllustration({
  variant = "quad",
  accent = "#0ea5e9",
  className,
}: {
  variant?: DroneVariant;
  accent?: string;
  className?: string;
}) {
  const arms = ARM_LAYOUTS[variant];
  const armPositions =
    arms === 6
      ? [
          [-96, -46],
          [96, -46],
          [-118, 8],
          [118, 8],
          [-96, 62],
          [96, 62],
        ]
      : [
          [-100, -58],
          [100, -58],
          [-100, 58],
          [100, 58],
        ];

  const bodyWidth = variant === "hex" ? 92 : variant === "fpv" ? 70 : 86;
  const bodyHeight = variant === "fpv" ? 46 : 58;
  const legs = variant !== "fpv";

  return (
    <svg
      viewBox="0 0 320 260"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`glow-${variant}`} cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`body-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>

      <circle cx="160" cy="130" r="118" fill={`url(#glow-${variant})`} />

      {/* arms */}
      {armPositions.map(([dx, dy], i) => (
        <g key={i}>
          <line
            x1="160"
            y1="130"
            x2={160 + dx}
            y2={130 + dy}
            stroke="#334155"
            strokeWidth={variant === "fpv" ? 10 : 14}
            strokeLinecap="round"
          />
          <line
            x1="160"
            y1="130"
            x2={160 + dx}
            y2={130 + dy}
            stroke={accent}
            strokeWidth="2"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
          <Propeller x={160 + dx} y={130 + dy} accent={accent} spin={i * 17} />
        </g>
      ))}

      {/* landing legs */}
      {legs && (
        <g stroke="#334155" strokeWidth="6" strokeLinecap="round">
          <line x1="132" y1="150" x2="122" y2="188" />
          <line x1="188" y1="150" x2="198" y2="188" />
        </g>
      )}

      {/* body */}
      <rect
        x={160 - bodyWidth / 2}
        y={130 - bodyHeight / 2}
        width={bodyWidth}
        height={bodyHeight}
        rx="18"
        fill={`url(#body-${variant})`}
        stroke={accent}
        strokeOpacity="0.35"
      />

      {/* status LED */}
      <circle cx={160 - bodyWidth / 2 + 14} cy={130 - bodyHeight / 2 + 12} r="4" fill={accent} />

      {/* camera gimbal */}
      {(variant === "camera" || variant === "hex" || variant === "quad" || variant === "fold") && (
        <g>
          <rect x="145" y={130 + bodyHeight / 2 - 4} width="30" height="20" rx="6" fill="#1e293b" />
          <circle cx="160" cy={130 + bodyHeight / 2 + 14} r="9" fill="#0f172a" stroke={accent} strokeWidth="2" />
          <circle cx="160" cy={130 + bodyHeight / 2 + 14} r="3.5" fill={accent} />
        </g>
      )}

      {/* fpv camera nose */}
      {variant === "fpv" && (
        <g>
          <rect x="150" y="96" width="20" height="14" rx="4" fill="#1e293b" stroke={accent} strokeWidth="1.5" />
          <circle cx="160" cy="103" r="3" fill={accent} />
        </g>
      )}

      {/* fold arms hinge marks */}
      {variant === "fold" && (
        <g fill={accent} opacity="0.6">
          <circle cx="128" cy="112" r="2.5" />
          <circle cx="192" cy="112" r="2.5" />
          <circle cx="128" cy="148" r="2.5" />
          <circle cx="192" cy="148" r="2.5" />
        </g>
      )}
    </svg>
  );
}
