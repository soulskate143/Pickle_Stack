interface VPCLogoProps {
  variant?: 'full' | 'compact';
  className?: string;
}

export default function VPCLogo({ variant = 'full', className = '' }: VPCLogoProps) {
  if (variant === 'compact') {
    return (
      <svg
        viewBox="0 0 168 50"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="Valencia Pickle Club"
      >
        <defs>
          <filter id="glow-c" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="grad-c" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ccff55" />
            <stop offset="55%" stopColor="#84e100" />
            <stop offset="100%" stopColor="#2a5000" />
          </linearGradient>
        </defs>
        {/* Motion lines */}
        <line x1="14" y1="40" x2="122" y2="10" stroke="#84e100" strokeWidth="1.5" opacity="0.8" />
        <line x1="14" y1="44" x2="122" y2="14" stroke="#84e100" strokeWidth="1"   opacity="0.45" />
        {/* VPC letters — Impact italic at 48px ≈ ~95px wide, ending ~x=103 */}
        <text
          x="8"
          y="46"
          fontFamily="Impact, 'Arial Black', sans-serif"
          fontSize="48"
          fontStyle="italic"
          fill="url(#grad-c)"
          stroke="#4a8000"
          strokeWidth="0.8"
          filter="url(#glow-c)"
        >
          VPC
        </text>
        {/* Ball — positioned right at the end of the C */}
        <circle cx="130" cy="16" r="17" fill="#84e100" />
        <circle cx="123" cy="8"  r="3"  fill="#1a4000" />
        <circle cx="133" cy="6"  r="3"  fill="#1a4000" />
        <circle cx="141" cy="13" r="3"  fill="#1a4000" />
        <circle cx="140" cy="23" r="3"  fill="#1a4000" />
        <circle cx="130" cy="28" r="3"  fill="#1a4000" />
        <circle cx="120" cy="23" r="3"  fill="#1a4000" />
        <circle cx="119" cy="13" r="3"  fill="#1a4000" />
      </svg>
    );
  }

  // Full logo — viewBox tightened so ball sits right at the C
  return (
    <svg
      viewBox="0 0 500 250"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Valencia Pickle Club"
    >
      <rect width="500" height="250" fill="#000" />
      <defs>
        <filter id="glow-f" x="-12%" y="-12%" width="124%" height="124%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="grad-f" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ccff55" />
          <stop offset="50%" stopColor="#84e100" />
          <stop offset="100%" stopColor="#1e4000" />
        </linearGradient>
      </defs>

      {/* Motion lines — diagonal racing stripes from lower-left up to ball */}
      <line x1="50"  y1="155" x2="345" y2="47" stroke="#84e100" strokeWidth="3"   opacity="0.80" />
      <line x1="50"  y1="165" x2="345" y2="57" stroke="#84e100" strokeWidth="2"   opacity="0.50" />
      <line x1="50"  y1="173" x2="345" y2="65" stroke="#84e100" strokeWidth="1.2" opacity="0.28" />

      {/* VPC text — Impact italic ~155px → text spans ~x=12 to ~x=298 */}
      <text
        x="12"
        y="172"
        fontFamily="Impact, 'Arial Black', sans-serif"
        fontSize="155"
        fontStyle="italic"
        fill="url(#grad-f)"
        stroke="#4a8000"
        strokeWidth="1.5"
        filter="url(#glow-f)"
      >
        VPC
      </text>

      {/* Pickleball — cx≈360 puts left edge ~308, right next to the C */}
      <circle cx="360" cy="55" r="52" fill="#84e100" />
      <circle cx="341" cy="34" r="7.5" fill="#1a4000" />
      <circle cx="362" cy="27" r="7.5" fill="#1a4000" />
      <circle cx="381" cy="40" r="7.5" fill="#1a4000" />
      <circle cx="383" cy="63" r="7.5" fill="#1a4000" />
      <circle cx="365" cy="76" r="7.5" fill="#1a4000" />
      <circle cx="343" cy="69" r="7.5" fill="#1a4000" />
      <circle cx="332" cy="52" r="7.5" fill="#1a4000" />

      {/* Gold banner lines */}
      <line x1="0" y1="192" x2="500" y2="192" stroke="#c9a227" strokeWidth="2.5" />
      <line x1="0" y1="222" x2="500" y2="222" stroke="#c9a227" strokeWidth="2.5" />

      {/* Banner background */}
      <rect x="0" y="194" width="500" height="28" fill="#111" />

      {/* Center ball icon in banner — like reference */}
      <circle cx="250" cy="208" r="14" fill="#1a1a1a" stroke="#c9a227" strokeWidth="1.5" />
      <circle cx="250" cy="208" r="11"  fill="#84e100" />
      <circle cx="245" cy="203" r="2.5" fill="#1a4000" />
      <circle cx="253" cy="201" r="2.5" fill="#1a4000" />
      <circle cx="258" cy="207" r="2.5" fill="#1a4000" />
      <circle cx="256" cy="214" r="2.5" fill="#1a4000" />
      <circle cx="249" cy="217" r="2.5" fill="#1a4000" />
      <circle cx="243" cy="213" r="2.5" fill="#1a4000" />

      {/* "VALENCIA" left, "PICKLE CLUB" right of center ball */}
      <text
        x="228"
        y="213"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="15"
        fontWeight="bold"
        fill="white"
        textAnchor="end"
        letterSpacing="3"
      >
        VALENCIA
      </text>
      <text
        x="272"
        y="213"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="15"
        fontWeight="bold"
        fill="white"
        textAnchor="start"
        letterSpacing="3"
      >
        PICKLE CLUB
      </text>
    </svg>
  );
}
