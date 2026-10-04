export function OfflineIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={compact ? "offline-illustration compact" : "offline-illustration"}
      viewBox="0 0 320 200"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M31 176C48 159 70 156 87 170c21-31 55-30 81-6 26-17 52-10 69 8 21-12 37-10 56 5"
        fill="#D3DFC0"
      />
      <path d="M167 165V70c0-41 76-41 76 0v98" fill="#E3EBCF" />
      <circle cx="217" cy="64" r="22" fill="#F1C979" />
      <path d="M67 68c3-12 19-12 24-3 6-7 18-2 19 6H67Z" fill="#F9FAEE" />
      <path d="M252 112c4-12 20-10 24 0 7-6 17-2 18 6h-46" fill="#F9FAEE" />
      <path d="M202 167c-4-12-3-24 5-36 12-1 22 3 27 12-2 16-12 24-32 24Z" fill="#99AD7D" />
      <path d="m201 169 25-29" stroke="#57704D" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M91 175c-7-19-4-32 7-41 12 4 14 19 3 36M87 160c-19-2-29-11-29-26 14-7 29 3 29 26"
        fill="#65855F"
      />
      <path d="M91 176c-1-19-7-30-22-36" stroke="#3E6449" strokeWidth="2" strokeLinecap="round" />
      <g transform="rotate(-12 149 113)">
        <rect x="112" y="58" width="65" height="115" rx="13" fill="#345544" />
        <rect x="117" y="63" width="55" height="99" rx="9" fill="#F7F8E8" />
        <rect x="132" y="65" width="25" height="5" rx="2.5" fill="#345544" />
        <path
          d="M143 133v-24m0 12c-15 0-23-9-22-22 14 0 23 7 22 22Zm1-7c0-17 9-26 22-26 0 15-8 25-22 26Z"
          fill="#83A16B"
        />
        <path d="M132 137h25l-4 15h-17l-4-15Z" fill="#D5A486" />
        <path d="M136 168h16" stroke="#A6B999" strokeWidth="2" strokeLinecap="round" />
      </g>
      <path
        d="m79 98 3 8m-14-4 7 4m-7 8 7-1M254 47l3 7m6-5-4 6"
        stroke="#7E986A"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M36 179h251"
        stroke="#8EAA7A"
        strokeOpacity=".4"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
