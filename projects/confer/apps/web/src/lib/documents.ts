import { MAX_TEXT_LENGTH } from "./model.ts";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PAGES = 200;

export function validateFile(file: Pick<File, "name" | "size">): string {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!["pdf", "docx", "txt"].includes(extension)) {
    throw new Error(
      "Choose a text-based PDF, a Word (.docx) document, or a plain-text (.txt) file.",
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("This file is larger than 10 MB. Split it into smaller discovery sets.");
  }
  if (file.size === 0) {
    throw new Error("This file is empty. Choose a document containing discovery responses.");
  }
  return extension;
}

export async function extractDocument(file: File): Promise<{ text: string; pages: number }> {
  const extension = validateFile(file);
  let text: string;
  let pages = 1;
  if (extension === "txt") {
    text = await file.text();
    pages = text.split("\f").length;
  } else if (extension === "docx") {
    const { extractRawText } = await import("mammoth");
    const result = await extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value;
  } else {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      enableXfa: false,
      useSystemFonts: true,
    });
    try {
      const pdf = await loadingTask.promise;
      pages = pdf.numPages;
      if (pages > MAX_PAGES) {
        throw new Error("Import no more than 200 PDF pages at a time.");
      }
      const chunks: string[] = [];
      let totalLength = 0;
      for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
        // eslint-disable-next-line no-await-in-loop -- Sequential extraction bounds memory and enables early size-limit checks.
        const page = await pdf.getPage(pageNumber);
        // eslint-disable-next-line no-await-in-loop -- Release each page before extracting the next one.
        const content = await page.getTextContent();
        let previousY: number | undefined;
        let pageText = "";
        for (const item of content.items) {
          if (!("str" in item)) {
            continue;
          }
          const y = item.transform[5] as number | undefined;
          if (
            previousY !== undefined &&
            y !== undefined &&
            Math.abs(previousY - y) > 2 &&
            !pageText.endsWith("\n")
          ) {
            pageText += "\n";
          }
          pageText += `${item.str}${item.hasEOL ? "\n" : " "}`;
          previousY = y;
        }
        chunks.push(pageText);
        totalLength += pageText.length;
        page.cleanup();
        if (totalLength > MAX_TEXT_LENGTH) {
          throw new Error("This PDF contains too much text. Split it into smaller discovery sets.");
        }
      }
      text = chunks.join("\f");
    } catch (error) {
      if (error instanceof Error && error.name === "PasswordException") {
        throw new Error("This PDF is password-protected. Upload an unlocked copy.", {
          cause: error,
        });
      }
      throw error;
    } finally {
      await loadingTask.destroy();
    }
  }
  if (!text.trim()) {
    throw new Error(
      "No readable text was found. Scanned PDFs need OCR before importing; Confer does not perform OCR.",
    );
  }
  if (text.length > MAX_TEXT_LENGTH || pages > MAX_PAGES) {
    throw new Error(
      "This document exceeds the 300,000-character or 200-page limit. Split it into smaller sets.",
    );
  }
  return { text, pages };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function exportWord(content: string, title: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const document = new Document({
    creator: "Confer",
    title,
    description: "Draft for attorney review; not a filing-ready document.",
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 24 },
          paragraph: { spacing: { after: 160 } },
        },
      },
    },
    sections: [
      {
        children: content
          .split("\n")
          .map((line) => new Paragraph({ children: [new TextRun(line)] })),
      },
    ],
  });
  downloadBlob(
    await Packer.toBlob(document),
    `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.docx`,
  );
}
