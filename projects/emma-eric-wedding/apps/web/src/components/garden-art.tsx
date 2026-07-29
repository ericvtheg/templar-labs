import { useId } from "react";

type GardenArtworkProps = {
  readonly className?: string;
  readonly compact?: boolean;
};

export function GardenArtwork({ className = "", compact = false }: GardenArtworkProps) {
  const reactId = useId();
  const textureId = `garden-texture-${reactId.replaceAll(":", "")}`;

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-compact={compact ? "true" : "false"}
      viewBox="0 0 720 760"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id={textureId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence baseFrequency="0.8" numOctaves="3" seed="14" type="fractalNoise" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </defs>

      <g className="garden-stems" fill="none" strokeLinecap="round">
        <path className="plant-sway plant-small" d="M118 760C129 605 193 470 296 315" />
        <path className="plant-sway plant-tall" d="M250 760C271 555 327 364 387 180" />
        <path className="plant-sway plant-mid" d="M389 760C407 585 486 448 579 343" />
        <path className="plant-sway plant-right" d="M521 760C520 600 551 459 626 310" />
        <path className="plant-sway plant-left" d="M80 760C122 652 157 591 207 534" />
      </g>

      <g className="garden-leaves" filter={`url(#${textureId})`}>
        <path className="leaf leaf-dark" d="M127 687C38 573 41 457 55 379c76 92 104 191 72 308Z" />
        <path
          className="leaf leaf-mid"
          d="M172 601C131 449 168 331 221 246c31 119 22 235-49 355Z"
        />
        <path className="leaf leaf-light" d="M242 705c-34-151 9-282 91-389 9 152-18 274-91 389Z" />
        <path
          className="leaf leaf-dark"
          d="M381 711c26-154 97-258 212-334-37 143-103 254-212 334Z"
        />
        <path className="leaf leaf-mid" d="M488 749c15-169 79-294 185-373-17 166-78 293-185 373Z" />
        <path
          className="leaf leaf-light"
          d="M542 651c-4-122 35-213 115-281-5 116-41 210-115 281Z"
        />
        <path className="leaf leaf-mid" d="M74 737C38 663 28 600 40 548c54 53 78 116 34 189Z" />
      </g>

      <g
        className="flower flower-coral flower-tall plant-sway plant-tall"
        filter={`url(#${textureId})`}
        transform="translate(9)"
      >
        <path d="M348 214c-47-59-39-130 21-168 37 52 39 113-21 168Z" />
        <path d="M402 207c-25-72 8-130 70-145 19 65 1 118-70 145Z" />
        <path d="M359 217c12-83 60-139 110-148 3 80-33 133-110 148Z" />
        <path className="flower-highlight" d="M359 217c-22-70-1-130 53-164 32 67 17 125-53 164Z" />
      </g>

      <g
        className="flower flower-pink flower-left plant-sway plant-left"
        filter={`url(#${textureId})`}
      >
        <path d="M178 536c-55-41-66-103-27-150 45 31 63 87 27 150Z" />
        <path d="M225 534c-12-66 20-116 76-126 8 62-17 107-76 126Z" />
        <path className="flower-highlight" d="M190 535c-24-69 2-118 49-139 23 57 11 107-49 139Z" />
        <circle className="flower-center" cx="211" cy="507" r="18" />
      </g>

      <g
        className="flower flower-marigold flower-mid plant-sway plant-mid"
        filter={`url(#${textureId})`}
      >
        <circle cx="509" cy="371" r="58" />
        <circle cx="555" cy="392" r="55" />
        <circle cx="533" cy="339" r="51" />
        <circle className="flower-highlight" cx="512" cy="392" r="47" />
        <circle className="flower-center" cx="530" cy="381" r="18" />
      </g>

      <g
        className="flower flower-red flower-right plant-sway plant-right"
        filter={`url(#${textureId})`}
      >
        <path d="M582 360c-35-65-16-123 35-151 31 53 25 107-35 151Z" />
        <path d="M625 359c-7-70 30-117 82-118 7 59-21 104-82 118Z" />
        <path className="flower-highlight" d="M603 366c-14-72 12-121 62-137 18 62 2 108-62 137Z" />
      </g>

      <g className="flower flower-small plant-sway plant-small" filter={`url(#${textureId})`}>
        <ellipse cx="292" cy="327" rx="43" ry="20" transform="rotate(20 292 327)" />
        <ellipse cx="292" cy="327" rx="43" ry="20" transform="rotate(92 292 327)" />
        <ellipse cx="292" cy="327" rx="43" ry="20" transform="rotate(160 292 327)" />
        <circle className="flower-center" cx="292" cy="327" r="15" />
      </g>
    </svg>
  );
}

export function LineFlourish({ className = "" }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 520 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 37c66-28 104 25 172-2 40-16 60-28 86-10 24 17 18 37-1 35-22-2-13-34 21-37 44-4 68 28 112 16 40-11 70-29 124-17"
        pathLength="1"
      />
    </svg>
  );
}

export function BotanicalStamp({ className = "" }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 180 180"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M92 160c-2-55 7-93 35-127" />
      <path d="M104 110c-35-10-56-35-60-70 39 9 60 34 60 70Z" />
      <path d="M108 92c5-35 27-58 60-67-3 36-23 58-60 67Z" />
      <path d="M88 145c-27-5-45-20-54-45 31 2 49 17 54 45Z" />
    </svg>
  );
}
