import { Link } from "@tanstack/react-router";

function MonogramLetters() {
  return (
    <>
      <span className="monogram-letter">E</span>
      <span className="monogram-ampersand">&amp;</span>
      <span className="monogram-letter">E</span>
      <svg aria-hidden="true" className="monogram-flourish" viewBox="0 0 64 14">
        <path d="M2 10c14-8 23 3 35-3 8-4 13-5 25 0" pathLength="1" />
        <circle cx="38" cy="6.5" r="1.7" />
      </svg>
    </>
  );
}

export function WeddingMonogram({
  className,
  homeAnchor = false,
}: {
  readonly className: string;
  readonly homeAnchor?: boolean;
}) {
  const classes = `${className} wedding-monogram`;

  return homeAnchor ? (
    <a aria-label="Emma and Eric home" className={classes} href="#top">
      <MonogramLetters />
    </a>
  ) : (
    <Link aria-label="Emma and Eric wedding home" className={classes} to="/" viewTransition>
      <MonogramLetters />
    </Link>
  );
}
