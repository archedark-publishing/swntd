import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { X, Download } from "lucide-react";
import { Button } from "./ui/button";
import { loadAttachmentObjectUrl, type Attachment } from "../api";

export function AttachmentViewer({ attachment, onClose, onDownload }: {
  attachment: Attachment | null; onClose: () => void; onDownload: (attachment: Attachment) => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const mime = attachment?.mimeType ?? "";
  const kind = mime.startsWith("image/") ? "image" : mime === "application/pdf" ? "pdf"
    : mime.startsWith("audio/") ? "audio" : "unsupported";
  useEffect(() => {
    setUrl(null); setError(false);
    if (!attachment?.downloadUrl || kind === "unsupported") return;
    let active = true;
    let objectUrl: string | null = null;
    void loadAttachmentObjectUrl(attachment.downloadUrl).then((result) => {
      if (!active) { URL.revokeObjectURL(result); return; }
      objectUrl = result; setUrl(result);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment?.id, attachment?.downloadUrl, kind]);
  return <Dialog.Root open={attachment !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="attachment-viewer-overlay" />
      <Dialog.Content className="attachment-viewer">
        <header><Dialog.Title>{attachment?.originalName}</Dialog.Title>
          <Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="Close attachment preview"><X /></Button></Dialog.Close>
        </header>
        <Dialog.Description className="sr-only">Attachment preview. Download the original file using the button below.</Dialog.Description>
        <div className="attachment-viewer-content">
          {error ? <p>Preview unavailable. You can still download the original file.</p>
            : kind === "unsupported" ? <p>This file type has no browser preview. Download it to open in its app.</p>
            : !url ? <p role="status">Loading preview…</p>
            : kind === "image" ? <img src={url} alt={attachment?.originalName} onError={() => setError(true)} />
            : kind === "pdf" ? <iframe src={url} title={attachment?.originalName} sandbox="allow-same-origin allow-scripts" />
            : <audio src={url} controls onError={() => setError(true)} />}
        </div>
        <footer><Button variant="outline" onClick={() => { if (attachment) void onDownload(attachment); }}><Download className="size-4" />Download original</Button></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function PendingFilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const next = URL.createObjectURL(file); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img className="pending-file-preview" alt={file.name} src={url} /> : null;
}
