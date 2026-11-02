import { useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

// Spike: render a local .docx in the browser with docx-preview (no server, no Microsoft cloud).
export default function DocxTest() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');

  const onFile = async (file: File | undefined) => {
    if (!file || !bodyRef.current) return;
    setStatus('...');
    try {
      bodyRef.current.innerHTML = '';
      await renderAsync(await file.arrayBuffer(), bodyRef.current, undefined, {
        className: 'docx',
        inWrapper: true,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
      });
      setStatus(`${file.name} — ${bodyRef.current.querySelectorAll('h1,h2,h3,h4').length} headings`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">docx-preview</h1>
      <input type="file" accept=".docx" onChange={(e) => void onFile(e.target.files?.[0])} />
      <div className="text-sm text-tx-soft">{status}</div>
      <div ref={bodyRef} className="overflow-auto bg-paper-2" />
    </div>
  );
}
