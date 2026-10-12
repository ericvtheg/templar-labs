import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useId, useState } from "react";

type Item = { id: string; question: string; answer: readonly string[] };

type FaqAccordionProps = {
  items: readonly Item[];
  /** Class prefix, so each version can style the list its own way. */
  prefix: string;
  /** Renders one paragraph of an answer. Defaults to the plain text. */
  paragraph?: (itemId: string, index: number, text: string) => ReactNode;
  /** Drawn under each question, for versions that replace the straight rule. */
  divider?: ReactNode;
};

/**
 * The FAQ: click a question to see its answer. One answer is open at a time,
 * and a small cosmos flower blooms beside the open question.
 */
export function FaqAccordion({ items, prefix, paragraph, divider }: FaqAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);
  const base = useId();

  return (
    <div className={`${prefix}-faq`}>
      {items.map((item) => {
        const open = item.id === openId;
        const questionId = `${base}-q-${item.id}`;
        const answerId = `${base}-a-${item.id}`;
        return (
          <section key={item.id} className={`${prefix}-faq__item`}>
            <h2>
              <button
                type="button"
                id={questionId}
                aria-expanded={open}
                aria-controls={answerId}
                onClick={() => setOpenId(open ? null : item.id)}
              >
                <span className={`${prefix}-faq__flower`} aria-hidden="true" />
                <span>{item.question}</span>
                <span className={`${prefix}-faq__mark`} aria-hidden="true" />
              </button>
            </h2>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  id={answerId}
                  role="region"
                  aria-labelledby={questionId}
                  className={`${prefix}-faq__answer`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={`${prefix}-faq__body`}>
                    {item.answer.map((text, index) => (
                      <p key={text}>{paragraph ? paragraph(item.id, index, text) : text}</p>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {divider}
          </section>
        );
      })}
    </div>
  );
}
