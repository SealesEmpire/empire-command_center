"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Paperclip, Mic, Link2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase";

interface DropZoneProps {
  orgId: string;
  projects: { id: string; name: string; color: string }[];
  onIngested?: (result: IngestResult) => void;
}

interface IngestResult {
  status: "ingested" | "exact_duplicate" | "error";
  document_id?: string;
  title?: string;
  classification?: {
    suggested_title: string;
    document_type: string;
    suggested_project_name: string | null;
    tags: string[];
    summary: string;
    confidence: number;
  };
  duplicate_warnings?: Array<{ document_title: string; similarity: number }>;
  message?: string;
}

export default function DropZone({ orgId, projects, onIngested }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [hintProjectId, setHintProjectId] = useState<string>("");
  const [lastResult, setLastResult] = useState<IngestResult | null>(null);
  const [activeTab, setActiveTab] = useState<"paste" | "url" | "drop">("paste");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const ingest = useCallback(async (payload: {
    source: "paste" | "url";
    content?: string;
    url?: string;
    title?: string;
  }) => {
    setIsUploading(true);
    setLastResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          org_id: orgId,
          source: payload.source,
          content: payload.content,
          url: payload.url,
          title: payload.title,
          hint_project_id: hintProjectId || undefined,
        }),
      });

      const result: IngestResult = await resp.json();
      setLastResult(result);
      if (onIngested) onIngested(result);

      // Clear inputs on success
      if (result.status === "ingested") {
        setPasteText("");
        setUrlInput("");
      }
    } catch (err) {
      setLastResult({ status: "error", message: (err as Error).message });
    } finally {
      setIsUploading(false);
    }
  }, [orgId, hintProjectId, onIngested, supabase]);

  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const items = e.dataTransfer.items;
    // Check for text first
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "string" && items[i].type === "text/plain") {
        items[i].getAsString((text) => {
          if (text.trim()) ingest({ source: "paste", content: text });
        });
        return;
      }
    }
    // Otherwise files (handled separately by file upload)
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // For now just read as text if it's a text file; full file upload in next phase
      const file = files[0];
      if (file.type.startsWith("text/") || file.name.endsWith(".md")) {
        const text = await file.text();
        ingest({ source: "paste", content: text, title: file.name });
      } else {
        alert(`File upload for ${file.type || "binary files"} is coming in Phase 2. For now, paste text or use URL.`);
      }
    }
  };

  const handleSubmit = () => {
    if (activeTab === "paste" && pasteText.trim()) {
      ingest({ source: "paste", content: pasteText });
    } else if (activeTab === "url" && urlInput.trim()) {
      ingest({ source: "url", url: urlInput });
    }
  };

  return (
    <div className="bg-empire-card border border-empire-border rounded-xl shadow-neon p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Upload size={18} className="text-empire-neon" />
          Drop Zone
        </h2>
        <select
          value={hintProjectId}
          onChange={(e) => setHintProjectId(e.target.value)}
          className="bg-empire-bg border border-empire-border rounded px-3 py-1 text-sm"
        >
          <option value="">Auto-detect project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 bg-empire-bg rounded-lg p-1">
        <TabBtn active={activeTab === "paste"} onClick={() => setActiveTab("paste")}>
          <Paperclip size={14} /> Paste
        </TabBtn>
        <TabBtn active={activeTab === "url"} onClick={() => setActiveTab("url")}>
          <Link2 size={14} /> URL
        </TabBtn>
        <TabBtn active={activeTab === "drop"} onClick={() => setActiveTab("drop")}>
          <Upload size={14} /> Drop
        </TabBtn>
      </div>

      {/* Tab content */}
      {activeTab === "paste" && (
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste anything — meeting notes, legal text, an idea, code, an article…"
          rows={8}
          className="w-full bg-empire-bg border border-empire-border rounded-lg p-3 text-sm resize-none focus:border-empire-neon"
        />
      )}

      {activeTab === "url" && (
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://example.com/article-i-want-saved"
          className="w-full bg-empire-bg border border-empire-border rounded-lg p-3 text-sm focus:border-empire-neon"
        />
      )}

      {activeTab === "drop" && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
            isDragging ? "drop-zone-active border-empire-neon bg-empire-neon/5" : "border-empire-border"
          }`}
        >
          <Upload size={32} className="mx-auto mb-3 text-empire-textMuted" />
          <p className="text-sm text-empire-textMuted mb-2">
            Drag a text file or paste content here
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-empire-neon text-sm hover:underline"
          >
            or browse files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".txt,.md,.csv,.json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                const text = await f.text();
                ingest({ source: "paste", content: text, title: f.name });
              }
            }}
          />
        </div>
      )}

      {/* Submit */}
      {(activeTab === "paste" || activeTab === "url") && (
        <button
          onClick={handleSubmit}
          disabled={isUploading || (activeTab === "paste" ? !pasteText.trim() : !urlInput.trim())}
          className="mt-3 w-full bg-empire-neon text-empire-bg font-semibold py-2.5 rounded-lg hover:shadow-neonStrong disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-shadow"
        >
          {isUploading ? (
            <><Loader2 size={16} className="animate-spin" /> Processing…</>
          ) : (
            <>Ingest</>
          )}
        </button>
      )}

      {/* Result */}
      {lastResult && (
        <div className={`mt-4 p-3 rounded-lg border text-sm ${
          lastResult.status === "ingested" ? "border-empire-green/30 bg-empire-green/5" :
          lastResult.status === "exact_duplicate" ? "border-yellow-500/30 bg-yellow-500/5" :
          "border-red-500/30 bg-red-500/5"
        }`}>
          {lastResult.status === "ingested" && lastResult.classification && (
            <>
              <div className="flex items-center gap-2 font-medium mb-1">
                <CheckCircle2 size={16} className="text-empire-green" />
                Saved as "{lastResult.title}"
              </div>
              <div className="text-empire-textMuted text-xs space-y-1">
                <div>Type: <span className="text-empire-textPrimary">{lastResult.classification.document_type}</span></div>
                {lastResult.classification.suggested_project_name && (
                  <div>Project: <span className="text-empire-textPrimary">{lastResult.classification.suggested_project_name}</span></div>
                )}
                <div>Tags: <span className="text-empire-textPrimary">{lastResult.classification.tags.join(", ")}</span></div>
                <div className="mt-2 italic">"{lastResult.classification.summary}"</div>
              </div>
              {lastResult.duplicate_warnings && lastResult.duplicate_warnings.length > 0 && (
                <div className="mt-3 pt-3 border-t border-empire-border flex items-start gap-2 text-yellow-500">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    Possible duplicate of <strong>{lastResult.duplicate_warnings[0].document_title}</strong>
                    {" "}({Math.round(lastResult.duplicate_warnings[0].similarity * 100)}% similar). Review in Documents.
                  </div>
                </div>
              )}
            </>
          )}
          {lastResult.status === "exact_duplicate" && (
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-yellow-500" />
              {lastResult.message}
            </div>
          )}
          {lastResult.status === "error" && (
            <div>Error: {lastResult.message}</div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-sm transition-colors ${
        active ? "bg-empire-card text-empire-neon" : "text-empire-textMuted hover:text-empire-textPrimary"
      }`}
    >
      {children}
    </button>
  );
}
