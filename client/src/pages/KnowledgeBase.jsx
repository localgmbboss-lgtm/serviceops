import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useNotifications } from "../contexts/NotificationsContext";
import "./KnowledgeBase.css";

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "dispatcher", label: "Dispatchers" },
  { value: "admin", label: "Admins" },
  { value: "vendor", label: "Vendors" },
  { value: "customer", label: "Customers" },
];

export default function KnowledgeBase() {
  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [audience, setAudience] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [composer, setComposer] = useState({
    title: "",
    audience: "dispatcher",
    body: "",
    summary: "",
  });
  const { publish } = useNotifications();

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const params = {};
      if (audience !== "all") params.audience = audience;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get("/api/knowledge", { params });
      setArticles(data?.results || []);
      if (data?.results?.length && !selectedId) {
        setSelectedId(data.results[0]._id);
      }
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(fetchArticles, 250);
    return () => clearTimeout(debounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, audience]);

  const selected = useMemo(
    () => articles.find((article) => article._id === selectedId) || null,
    [articles, selectedId]
  );

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!composer.title.trim() || !composer.body.trim()) return;
    try {
      await api.post("/api/knowledge", composer);
      publish({
        title: "Article published",
        body: "Knowledge base refreshed for dispatchers.",
        severity: "success",
      });
      setShowComposer(false);
      setComposer({
        title: "",
        audience: "dispatcher",
        body: "",
        summary: "",
      });
      fetchArticles();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to publish article");
    }
  };

  const metrics = useMemo(() => {
    const total = articles.length;
    const canned = articles.reduce(
      (sum, article) =>
        sum + (Array.isArray(article.cannedResponses) ? article.cannedResponses.length : 0),
      0
    );
    const latestStamp = articles.reduce((latest, article) => {
      const stamp = article.updatedAt || article.createdAt;
      if (!stamp) return latest;
      const time = new Date(stamp).getTime();
      return time > latest ? time : latest;
    }, 0);
    return {
      total,
      canned,
      lastUpdated: latestStamp ? new Date(latestStamp) : null,
    };
  }, [articles]);

  const lastUpdatedLabel = metrics.lastUpdated
    ? metrics.lastUpdated.toLocaleString()
    : "Awaiting first article";

  return (
    <div className="kb">
      <header className="kb-hero">
        <div className="kb-hero__intro">
          <div>
            <span className="kb-eyebrow">Playbooks & canned replies</span>
            <h1>Knowledge Base</h1>
            <p>
              Curate reusable answers, escalation guides, and macros for dispatchers, vendors, and
              customer care. Everyone stays on-message, every time.
            </p>
          </div>
          <div className="kb-hero__actions">
            <button
              type="button"
              className="btn primary kb-hero__cta"
              onClick={() => setShowComposer((prev) => !prev)}
            >
              {showComposer ? "Close composer" : "New article"}
            </button>
          </div>
        </div>
        <div className="kb-hero__controls">
          <div className="kb-search">
            <input
              placeholder="Search titles, summaries, or canned responses…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <label className="kb-audience">
            <span>Audience</span>
            <select value={audience} onChange={(event) => setAudience(event.target.value)}>
              {AUDIENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="kb-hero__metrics">
          <div className="kb-metric">
            <span className="kb-metric__label">Articles</span>
            <strong className="kb-metric__value">{metrics.total}</strong>
            <span className="kb-metric__hint">Matching current filters</span>
          </div>
          <div className="kb-metric">
            <span className="kb-metric__label">Canned responses</span>
            <strong className="kb-metric__value">{metrics.canned}</strong>
            <span className="kb-metric__hint">Ready to reuse snippets</span>
          </div>
          <div className="kb-metric">
            <span className="kb-metric__label">Last update</span>
            <strong className="kb-metric__value">{lastUpdatedLabel}</strong>
            <span className="kb-metric__hint">Most recent publish or edit</span>
          </div>
        </div>
      </header>

      {error ? <div className="kb-banner kb-banner--error">{error}</div> : null}

      {showComposer ? (
        <section className="kb-composer">
          <form onSubmit={handleCreate}>
            <div className="kb-composer__grid">
              <label>
                <span>Title</span>
                <input
                  value={composer.title}
                  onChange={(event) =>
                    setComposer((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                <span>Summary</span>
                <input
                  value={composer.summary}
                  onChange={(event) =>
                    setComposer((prev) => ({ ...prev, summary: event.target.value }))
                  }
                  placeholder="Short recap for the list view (optional)"
                />
              </label>
              <label>
                <span>Audience</span>
                <select
                  value={composer.audience}
                  onChange={(event) =>
                    setComposer((prev) => ({ ...prev, audience: event.target.value }))
                  }
                >
                  {AUDIENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="kb-composer__body">
              <span>Article body</span>
              <textarea
                rows={8}
                value={composer.body}
                onChange={(event) => setComposer((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Document the steps, links, and talking points people should follow."
                required
              />
            </label>
            <div className="kb-composer__actions">
              <button type="submit" className="btn primary">
                Publish article
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="kb-body">
        <aside className="kb-panel kb-list-panel">
          <div className="kb-panel__head">
            <h2>Articles</h2>
            <span className="kb-chip">{metrics.total}</span>
          </div>
          <div className="kb-list-panel__items">
            {loading ? (
              <div className="kb-empty">Loading knowledge base…</div>
            ) : articles.length === 0 ? (
              <div className="kb-empty">
                No articles found. Adjust filters or create a new playbook.
              </div>
            ) : (
              articles.map((article) => (
                <div
                  key={article._id}
                  className={`kb-list-item${article._id === selectedId ? " active" : ""}`}
                  onClick={() => setSelectedId(article._id)}
                >
                  <strong>{article.title}</strong>
                  <span>{article.summary || article.body.slice(0, 90)}</span>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="kb-panel kb-article-panel">
          {selected ? (
            <>
              <div className="kb-article__header">
                <div>
                  <h2>{selected.title}</h2>
                  <div className="kb-article__meta">
                    <span className="kb-chip">{selected.audience}</span>
                    <span>
                      Updated{" "}
                      {selected.updatedAt
                        ? new Date(selected.updatedAt).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
              {selected.summary ? <p className="kb-summary">{selected.summary}</p> : null}
              <div className="kb-article__body">
                {selected.body.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
              {Array.isArray(selected.cannedResponses) && selected.cannedResponses.length > 0 ? (
                <div className="kb-macros">
                  <h3>Canned responses</h3>
                  <ul className="kb-macro-list">
                    {selected.cannedResponses.map((macro, index) => (
                      <li key={`${selected._id}-macro-${index}`}>
                        <header>
                          <strong>{macro.title}</strong>
                          <span className="kb-chip">{macro.channel}</span>
                        </header>
                        <pre>{macro.body}</pre>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <div className="kb-empty">
              Select an article to preview the playbook, or create a new one to get started.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
