import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "./ui/button";
GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false); setPageNumber(1); setDocument(null);
    const task = getDocument({ url });
    let active = true;
    void task.promise.then((pdf) => { if (active) setDocument(pdf); }).catch(() => { if (active) setError(true); });
    return () => { active = false; void task.destroy(); };
  }, [url]);
  useEffect(() => {
    if (!document) return;
    let active = true;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;
    void document.getPage(pageNumber).then(async (page) => {
      if (!active || !canvas.current) return;
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      renderTask = page.render({ canvas: canvas.current, viewport });
      await renderTask.promise;
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; renderTask?.cancel(); };
  }, [document, pageNumber]);
  if (error) return <p>PDF preview unavailable. Download the original to open it.</p>;
  return <div className="pdf-preview">
    {!document ? <p role="status">Loading PDF…</p> : <div className="pdf-page-controls">
      <Button variant="outline" disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => page - 1)}>Previous page</Button>
      <span>Page {pageNumber} of {document.numPages}</span>
      <Button variant="outline" disabled={pageNumber >= document.numPages} onClick={() => setPageNumber((page) => page + 1)}>Next page</Button>
    </div>}
    <canvas ref={canvas} aria-label={`PDF page ${pageNumber}`} role="img" />
  </div>;
}
