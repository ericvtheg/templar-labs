function star(cx: number, cy: number, radius: number, rotation = -90) {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = ((rotation + index * 36) * Math.PI) / 180;
    const distance = index % 2 === 0 ? radius : radius * 0.382;
    return `${cx + Math.cos(angle) * distance},${cy + Math.sin(angle) * distance}`;
  }).join(" ");
}
export function ChinaFlag({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`china-flag ${className}`}
      viewBox="0 0 30 20"
      role="img"
      aria-label="Flag of China"
    >
      <title>Flag of China</title>
      <path fill="#de2910" d="M0 0h30v20H0z" />
      <polygon fill="#ffde00" points={star(5, 5, 3)} />
      {[
        [10, 2],
        [12, 4],
        [12, 7],
        [10, 9],
      ].map(([x = 0, y = 0]) => (
        <polygon
          key={`${x}-${y}`}
          fill="#ffde00"
          points={star(x, y, 1, (Math.atan2(5 - y, 5 - x) * 180) / Math.PI)}
        />
      ))}
    </svg>
  );
}
