import React from 'react';

export default function MiniSparkline({ data = [], isPositive = true, width = 90, height = 28 }) {
  if (!data || data.length < 2) {
    return <div className="h-6 w-20 flex items-center justify-center text-[10px] text-slate-600 italic">--</div>;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  const padding = 2;

  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  const strokeColor = isPositive ? '#10B981' : '#F43F5E';
  const fillColor = isPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';

  // Closed path for fill area
  const firstX = padding;
  const lastX = width - padding;
  const areaPath = `M ${firstX},${height} L ${points} L ${lastX},${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible inline-block">
      <path d={areaPath} fill={fillColor} />
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

