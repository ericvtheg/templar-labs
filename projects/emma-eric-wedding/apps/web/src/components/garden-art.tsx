import { useId } from "react";

type GardenArtworkProps = {
  readonly className?: string;
  readonly compact?: boolean;
};

type SunflowerBloomProps = {
  readonly scale?: number;
  readonly x: number;
  readonly y: number;
};

function SunflowerBloom({ scale = 1, x, y }: SunflowerBloomProps) {
  return (
    <g className="sunflower-bloom" transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="sunflower-outer-petals">
        <path d="M0-25C-13-40-14-67 1-91c16 24 14 49-1 66Z" />
        <path d="M0-25C-15-42-12-70 5-87c13 22 10 47-5 62Z" transform="rotate(23)" />
        <path d="M0-25C-12-43-15-65-2-89c18 20 18 48 2 64Z" transform="rotate(46)" />
        <path d="M0-25C-14-39-12-68 4-92c15 25 11 50-4 67Z" transform="rotate(68)" />
        <path d="M0-25C-16-43-13-69 2-86c16 20 14 45-2 61Z" transform="rotate(91)" />
        <path d="M0-25C-13-41-15-71 3-90c14 24 12 49-3 65Z" transform="rotate(113)" />
        <path d="M0-25C-15-39-11-66 6-88c13 24 8 48-6 63Z" transform="rotate(136)" />
        <path d="M0-25C-12-43-16-68 0-93c17 23 16 50 0 68Z" transform="rotate(159)" />
        <path d="M0-25C-16-41-13-70 4-87c14 22 11 46-4 62Z" transform="rotate(181)" />
        <path d="M0-25C-13-40-14-67 1-91c16 24 14 49-1 66Z" transform="rotate(204)" />
        <path d="M0-25C-15-42-12-70 5-87c13 22 10 47-5 62Z" transform="rotate(226)" />
        <path d="M0-25C-12-43-15-65-2-89c18 20 18 48 2 64Z" transform="rotate(249)" />
        <path d="M0-25C-14-39-12-68 4-92c15 25 11 50-4 67Z" transform="rotate(272)" />
        <path d="M0-25C-16-43-13-69 2-86c16 20 14 45-2 61Z" transform="rotate(294)" />
        <path d="M0-25C-13-41-15-71 3-90c14 24 12 49-3 65Z" transform="rotate(317)" />
        <path d="M0-25C-15-39-11-66 6-88c13 24 8 48-6 63Z" transform="rotate(339)" />
      </g>
      <g className="sunflower-inner-petals">
        <path d="M0-23C-11-35-10-53 2-68c13 16 11 34-2 45Z" transform="rotate(10)" />
        <path d="M0-23C-12-36-9-55 4-66c11 15 8 32-4 43Z" transform="rotate(40)" />
        <path d="M0-23C-10-38-12-54 0-70c14 15 13 35 0 47Z" transform="rotate(70)" />
        <path d="M0-23C-12-34-9-52 4-67c11 17 8 33-4 44Z" transform="rotate(100)" />
        <path d="M0-23C-11-36-11-55 2-69c12 17 10 35-2 46Z" transform="rotate(130)" />
        <path d="M0-23C-13-35-9-53 5-66c10 16 7 33-5 43Z" transform="rotate(160)" />
        <path d="M0-23C-10-37-12-54 1-68c13 16 11 34-1 45Z" transform="rotate(190)" />
        <path d="M0-23C-12-35-9-55 4-67c11 16 8 33-4 44Z" transform="rotate(220)" />
        <path d="M0-23C-11-38-11-53 1-69c13 17 11 35-1 46Z" transform="rotate(250)" />
        <path d="M0-23C-13-34-8-52 5-66c10 16 7 32-5 43Z" transform="rotate(280)" />
        <path d="M0-23C-10-36-12-55 2-68c12 16 10 34-2 45Z" transform="rotate(310)" />
        <path d="M0-23C-12-35-9-53 4-67c11 17 8 33-4 44Z" transform="rotate(340)" />
      </g>
      <circle className="sunflower-core" r="33" />
      <g className="sunflower-seeds">
        <circle cx="-8" cy="-17" r="1.8" />
        <circle cx="4" cy="-18" r="1.5" />
        <circle cx="15" cy="-12" r="1.7" />
        <circle cx="20" cy="-2" r="1.5" />
        <circle cx="16" cy="10" r="1.8" />
        <circle cx="7" cy="18" r="1.5" />
        <circle cx="-5" cy="19" r="1.8" />
        <circle cx="-16" cy="12" r="1.5" />
        <circle cx="-20" cy="1" r="1.7" />
        <circle cx="-16" cy="-10" r="1.5" />
        <circle cx="-5" cy="-7" r="1.6" />
        <circle cx="7" cy="-8" r="1.5" />
        <circle cx="12" cy="2" r="1.7" />
        <circle cx="5" cy="10" r="1.5" />
        <circle cx="-7" cy="9" r="1.7" />
        <circle cx="-11" cy="0" r="1.5" />
        <circle cx="0" cy="1" r="1.8" />
      </g>
    </g>
  );
}

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
        <path className="plant-sway plant-mid" d="M389 760C405 590 450 470 500 421" />
        <path className="plant-sway plant-right" d="M521 760C520 600 557 445 646 292" />
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
      </g>

      <g
        className="flower flower-coral flower-tall plant-sway plant-tall"
        filter={`url(#${textureId})`}
        transform="translate(9)"
      >
        <path
          className="flower-pink-accent"
          d="M348 214c-47-59-39-130 21-168 37 52 39 113-21 168Z"
        />
        <path className="flower-pink-accent" d="M402 207c-25-72 8-130 70-145 19 65 1 118-70 145Z" />
        <path d="M359 217c12-83 60-139 110-148 3 80-33 133-110 148Z" />
        <path className="flower-highlight" d="M359 217c-22-70-1-130 53-164 32 67 17 125-53 164Z" />
      </g>

      <g
        className="flower flower-sunflower flower-mid plant-sway plant-mid"
        filter={`url(#${textureId})`}
      >
        <SunflowerBloom x={500} y={380} />
      </g>

      <g
        className="flower flower-poppy flower-right plant-sway plant-right"
        filter={`url(#${textureId})`}
      >
        <g className="poppy-petals">
          <path d="M648 289c-33-2-58-22-61-48 18-22 47-12 64 22Z" />
          <path d="M648 273c-25-25-25-57-4-78 28 13 35 47 14 79Z" />
          <path d="M654 273c4-38 24-65 51-67 20 28 3 60-45 78Z" />
          <path d="M657 284c22-30 51-38 62-17-4 29-31 43-65 25Z" />
        </g>
        <path className="poppy-cup" d="M633 279c8-8 23-8 34 0-3 12-10 18-18 18-9 0-14-6-16-18Z" />
        <g className="poppy-stamens">
          <circle cx="638" cy="277" r="3.5" />
          <circle cx="645" cy="272" r="3.5" />
          <circle cx="653" cy="271" r="3.5" />
          <circle cx="661" cy="276" r="3.5" />
        </g>
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

export function StateFlowerPair({ className = "" }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 460 300"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="state-flower-stems">
        <path d="M118 298c-4-74 7-136 31-188" />
        <path d="M334 298c0-74-12-137-31-193" />
      </g>

      <path className="state-flower-leaf" d="M120 240c-47-15-69-46-66-91 46 16 69 46 66 91Z" />
      <path className="state-flower-leaf" d="M332 231c51-10 83-37 94-79-51 8-82 34-94 79Z" />

      <g className="state-poppy">
        <g className="state-poppy-petals">
          <path d="M149 112c-37-2-65-24-68-53 21-24 53-12 71 25Z" />
          <path d="M149 94c-27-29-26-66-3-89 31 15 38 53 13 90Z" />
          <path d="M156 94c5-43 28-74 58-75 22 31 4 68-51 86Z" />
          <path d="M160 106c25-34 58-42 70-19-5 32-35 48-74 27Z" />
        </g>
        <path
          className="state-poppy-cup"
          d="M132 101c10-9 28-9 40 0-3 13-12 20-21 20-10 0-17-7-19-20Z"
        />
        <g className="state-poppy-stamens">
          <circle cx="139" cy="98" r="3.5" />
          <circle cx="147" cy="93" r="3.5" />
          <circle cx="156" cy="93" r="3.5" />
          <circle cx="165" cy="98" r="3.5" />
        </g>
      </g>

      <g className="state-sunflower">
        <SunflowerBloom scale={0.78} x={303} y={105} />
      </g>
    </svg>
  );
}
