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
        <path className="plant-sway plant-mid" d="M389 760C405 590 466 470 530 421" />
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
        className="flower flower-sunflower flower-mid plant-sway plant-mid"
        filter={`url(#${textureId})`}
      >
        <g className="sunflower-petals">
          <ellipse cx="530" cy="320" rx="17" ry="39" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(30 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(60 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(90 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(120 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(150 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(180 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(210 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(240 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(270 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(300 530 380)" />
          <ellipse cx="530" cy="320" rx="17" ry="39" transform="rotate(330 530 380)" />
        </g>
        <circle className="sunflower-seed-ring" cx="530" cy="380" r="43" />
        <circle className="sunflower-seeds" cx="530" cy="380" r="30" />
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
        <g className="state-sunflower-petals">
          <ellipse cx="303" cy="39" rx="17" ry="39" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(30 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(60 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(90 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(120 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(150 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(180 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(210 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(240 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(270 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(300 303 105)" />
          <ellipse cx="303" cy="39" rx="17" ry="39" transform="rotate(330 303 105)" />
        </g>
        <circle className="state-sunflower-center" cx="303" cy="105" r="45" />
        <circle className="state-sunflower-core" cx="303" cy="105" r="27" />
      </g>
    </svg>
  );
}
