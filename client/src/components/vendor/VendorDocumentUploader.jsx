import { useEffect, useMemo, useRef, useState } from "react";
import { vendorApi } from "../../lib/vendorApi";
import { API_BASE_URL } from "../../config/env.js";

const toAbsoluteUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const prefix = API_BASE_URL.replace(/\/$/, "");
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${prefix}${normalized}`;
};

const humanize = (value) =>
  (value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

function normalizeAccepts(accepts) {
  if (!Array.isArray(accepts) || accepts.length === 0) {
    return ".pdf,.jpg,.jpeg,.png";
  }
  const normalized = accepts
    .map((entry) => `.${String(entry).replace(/^\./, "").toLowerCase()}`)
    .map((entry) => (entry === ".jpeg" ? ".jpg" : entry));
  return Array.from(new Set(normalized)).join(",");
}

export default function VendorDocumentUploader({
  requirement,
  existingDocument,
  onUploaded,
}) {
  const [file, setFile] = useState(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const lastPrefilledId = useRef(null);

  useEffect(() => {
    const doc = existingDocument || null;
    const docId = (doc && (doc._id || doc.id)) || null;
    if (docId === lastPrefilledId.current) {
      return;
    }
    if (!docId) {
      setDocumentNumber("");
      setExpiresAt("");
      setNotes("");
      setConfirmation(false);
      lastPrefilledId.current = null;
      return;
    }
    setDocumentNumber(doc.metadata?.documentNumber || "");
    if (doc.expiresAt) {
      const parsed = new Date(doc.expiresAt);
      setExpiresAt(!Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "");
    } else {
      setExpiresAt("");
    }
    setNotes(doc.notes || "");
    setConfirmation(false);
    lastPrefilledId.current = docId;
  }, [existingDocument]);

  const accept = useMemo(
    () => normalizeAccepts(requirement.accepts),
    [requirement.accepts]
  );

  const existingUrl = existingDocument?.url
    ? toAbsoluteUrl(existingDocument.url)
    : "";
  const uploadedAtLabel = existingDocument?.uploadedAt
    ? new Date(existingDocument.uploadedAt).toLocaleString()
    : "";

  const statusLabel = requirement?.status
    ? requirement.status.valid
      ? "Verified"
      : requirement.status.uploaded
      ? humanize(requirement.status.reason || "submitted")
      : humanize(requirement.status.reason || "missing")
    : "Not uploaded";

  const resetForm = () => {
    setFile(null);
    setDocumentNumber("");
    setExpiresAt("");
    setNotes("");
    setConfirmation(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0];
    setFile(selected || null);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;

    if (!file) {
      setError("Select a document to upload.");
      return;
    }
    if (!documentNumber.trim()) {
      setError("Enter the document or certificate number.");
      return;
    }
    if (requirement.expires && !expiresAt) {
      setError("Provide the expiration date for this document.");
      return;
    }
    if (!confirmation) {
      setError("Confirm that the uploaded file matches the details supplied.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const formData = new FormData();
      formData.append("document", file);
      formData.append("requirementKey", requirement.key || requirement.kind);
      formData.append("documentNumber", documentNumber.trim());
      formData.append("title", requirement.label || file.name);
      if (notes.trim()) {
        formData.append("notes", notes.trim());
      }
      if (expiresAt) {
        formData.append("expiresAt", expiresAt);
      }

      await vendorApi.post("/api/vendor/documents", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      resetForm();
      if (typeof onUploaded === "function") {
        await onUploaded("Document uploaded for review.");
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to upload document."
      );
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    file &&
    documentNumber.trim() &&
    (!requirement.expires || expiresAt) &&
    confirmation;

  return (
    <div className="vendor-docs__uploader">
      <form onSubmit={handleSubmit} className="vendor-docs__upload-form">
        <div className="vendor-docs__upload-fields">
          <div className="vendor-docs__file-control">
            <label className="field-label" htmlFor={`doc-upload-${requirement.key}`}>
              Upload file
            </label>
            <input
              id={`doc-upload-${requirement.key}`}
              ref={fileInputRef}
              type="file"
              accept={accept}
              onChange={handleFileChange}
              disabled={busy}
            />
            <p className="vendor-docs__file-hint">
              Accepted types: {accept.replace(/\./g, "").replace(/,/g, ", ")}
            </p>
            {file && (
              <p className="vendor-docs__helper">
                Selected: {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>

          <div className="vendor-docs__upload-row">
            <label className="field">
              <span className="field-label">Document number</span>
              <input
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                placeholder="e.g. W-9 #12345"
                disabled={busy}
              />
            </label>
            {requirement.expires && (
              <label className="field">
                <span className="field-label">Expiration date</span>
                <input
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  type="date"
                  disabled={busy}
                />
              </label>
            )}
          </div>

          <label className="field">
            <span className="field-label">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="Anything we should know about this document"
              disabled={busy}
            />
          </label>

          <label className="vendor-docs__confirm">
            <input
              type="checkbox"
              checked={confirmation}
              onChange={(event) => setConfirmation(event.target.checked)}
              disabled={busy}
            />
            <span>
              I confirm the file accurately matches the details entered above.
            </span>
          </label>
        </div>

        {error && <div className="vendor-docs__error">{error}</div>}

        <div className="vendor-docs__actions">
          <button type="submit" className="btn primary" disabled={!canSubmit}>
            {busy ? "Uploading..." : "Submit for review"}
          </button>
        </div>
      </form>

      <div className="vendor-docs__current">
        <span>Current status: {statusLabel}</span>
        {uploadedAtLabel && <span>Uploaded: {uploadedAtLabel}</span>}
        {existingUrl && (
          <a href={existingUrl} target="_blank" rel="noreferrer">
            View latest file
          </a>
        )}
      </div>
    </div>
  );
}









