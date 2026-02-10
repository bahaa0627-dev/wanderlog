import React from 'react';

const Illustration: React.FC = () => {
  return (
    <svg
      viewBox="0 0 600 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full drop-shadow-xl"
    >
      <defs>
        {/* "Wiggle" filter to simulate hand-drawn lines */}
        <filter id="hand-drawn" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" />
        </filter>
        
        {/* Dot pattern for map texture */}
        <pattern id="dotPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill="#000000" opacity="0.1" />
        </pattern>
      </defs>

      <g filter="url(#hand-drawn)">
        
        {/* --- 1. THE GLOBE / MAP BASE --- */}
        <g transform="translate(300, 320)">
          {/* Main Sphere */}
          <circle cx="0" cy="0" r="180" fill="#FFFFFF" stroke="#000000" strokeWidth="3" />
          <circle cx="0" cy="0" r="180" fill="url(#dotPattern)" opacity="0.5" />
          
          {/* Longitude / Latitude Lines */}
          <path d="M-180 0 H 180" stroke="#000000" strokeWidth="1" strokeOpacity="0.1" fill="none" />
          <path d="M-155 -90 H 155" stroke="#000000" strokeWidth="1" strokeOpacity="0.1" fill="none" />
          <path d="M-155 90 H 155" stroke="#000000" strokeWidth="1" strokeOpacity="0.1" fill="none" />
          <ellipse cx="0" cy="0" rx="90" ry="180" stroke="#000000" strokeWidth="1" strokeOpacity="0.1" fill="none" />
          <line x1="0" y1="-180" x2="0" y2="180" stroke="#000000" strokeWidth="1" strokeOpacity="0.1" />

          {/* Stylized Continents Outline */}
          <path 
            d="M-120 -40 Q -80 -80, -40 -30 T 20 -20 T 80 -60 T 130 -10 Q 150 40, 90 60 Q 40 80, 0 50 Q -50 40, -90 90 Q -130 60, -120 -40" 
            stroke="#000000" 
            strokeWidth="2" 
            fill="none" 
            opacity="0.3"
          />
        </g>

        {/* --- 2. THE PATH / JOURNEY --- */}
        {/* A dashed line winding around the globe */}
        <path 
          d="M 120 450 Q 180 550, 300 500 T 450 400 T 350 250 T 150 200" 
          stroke="#000000" 
          strokeWidth="3" 
          strokeDasharray="8 8" 
          fill="none" 
          opacity="0.6"
        />

        {/* --- 3. LANDMARKS --- */}
        {/* Stylized Tower (Left) */}
        <g transform="translate(140, 200) scale(0.8)">
           <path d="M0 60 L 15 0 L 30 60 H 0 Z" fill="#FFFFFF" stroke="#000000" strokeWidth="3" />
           <line x1="5" y1="15" x2="25" y2="15" stroke="#000000" strokeWidth="2" />
           <line x1="3" y1="35" x2="27" y2="35" stroke="#000000" strokeWidth="2" />
        </g>
        
        {/* Stylized Mountain/Pyramid (Right) */}
        <g transform="translate(440, 380) scale(0.8)">
           <path d="M0 50 L 25 0 L 50 50 H 0 Z" fill="#FFFFFF" stroke="#000000" strokeWidth="3" />
           <path d="M25 0 L 25 50" stroke="#000000" strokeWidth="1" />
           <path d="M30 50 L 45 20 L 60 50 H 30 Z" fill="#FFFFFF" stroke="#000000" strokeWidth="3" />
        </g>

        {/* --- 4. THE FLÂNEUR (Character) --- */}
        {/* Walking centrally, slightly large to be the focus */}
        <g transform="translate(280, 240) scale(1.3)">
          {/* Legs walking */}
          <path d="M30 80 L 10 120" stroke="#000000" strokeWidth="8" strokeLinecap="round" />
          <path d="M30 80 L 55 120" stroke="#000000" strokeWidth="8" strokeLinecap="round" />
          
          {/* Torso */}
          <path d="M30 80 L 25 30" stroke="#000000" strokeWidth="12" strokeLinecap="round" />
          
          {/* Coat / Cape effect */}
          <path d="M22 35 Q 5 60, 10 100" stroke="#000000" strokeWidth="4" fill="none" />

          {/* Head */}
          <circle cx="28" cy="20" r="12" fill="#FFFFFF" stroke="#000000" strokeWidth="3" />
          
          {/* Hat (Fedora style) */}
          <path d="M10 18 H 46 L 40 8 H 16 L 10 18 Z" fill="#000000" />
          
          {/* Arms */}
          <path d="M25 35 L 50 60" stroke="#000000" strokeWidth="6" strokeLinecap="round" />
          <circle cx="50" cy="60" r="4" fill="#000000" /> {/* Hand */}
          
          {/* Walking Stick or Bag */}
          <line x1="50" y1="60" x2="55" y2="120" stroke="#000000" strokeWidth="2" />
        </g>

        {/* --- 5. DECORATIONS --- */}
        {/* Sun / Compass top right */}
        <g transform="translate(480, 100)">
           <circle cx="0" cy="0" r="30" fill="#FFFFFF" stroke="#000000" strokeWidth="3" />
           <path d="M0 -40 L 10 -10 L 40 0 L 10 10 L 0 40 L -10 10 L -40 0 L -10 -10 Z" fill="#000000" />
        </g>

        {/* Clouds */}
        <g transform="translate(100, 100)" opacity="0.8">
           <path d="M0 0 Q 15 -20, 30 0 T 60 0 T 90 0 V 10 H 0 V 0 Z" fill="#FFFFFF" stroke="#000000" strokeWidth="2" />
        </g>
        <g transform="translate(400, 180)" opacity="0.6" scale="0.8">
           <path d="M0 0 Q 15 -20, 30 0 T 60 0 T 90 0 V 10 H 0 V 0 Z" fill="none" stroke="#000000" strokeWidth="2" />
        </g>

        {/* Plane with trail */}
        <g transform="translate(100, 150) rotate(15)">
           <path d="M0 0 L 20 -5 L 18 5 Z" fill="#000000" />
           <path d="M-50 0 L 0 0" stroke="#000000" strokeWidth="1" strokeDasharray="2 2" />
        </g>
      </g>
    </svg>
  );
};

export default Illustration;