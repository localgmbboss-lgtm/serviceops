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

  return (
    <div className="kb">
      <header className="kb-header">
        <div>
          <h1>Knowledge Base & Macros</h1>
          <p>Pre-approved answers and playbooks that dispatchers and vendors can reuse instantly.</p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => setShowComposer((prev) => !prev)}
        >
          {showComposer ? "Close composer" : "New article"}
        </button>
      </header>

      <section className="kb-toolbar">
        <div className="kb-search">
          <input
            placeholder="Search articles or canned responses"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="kb-audience">
          <label>
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
      </section>

      {error ? <div className="kb-error">{error}</div> : null}

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
                rows={6}
                value={composer.body}
                onChange={(event) => setComposer((prev) => ({ ...prev, body: event.target.value }))}
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

      <section className="kb-layout">
        <aside className="kb-list">
          {loading ? (
            <p className="muted">Loading…</p>
          ) : articles.length === 0 ? (
            <p className="muted">No articles found. Try expanding your search.</p>
          ) : (
            <ul>
              {articles.map((article) => (
                <li
                  key={article._id}
                  className={article._id === selectedId ? "active" : ""}
                  onClick={() => setSelectedId(article._id)}
                >
                  <strong>{article.title}</strong>
                  <span>{article.summary || article.body.slice(0, 80)}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <article className="kb-article">
          {selected ? (
            <>
              <header>
                <h2>{selected.title}</h2>
                <div className="kb-article__meta">
                  <span className="kb-tag">{selected.audience}</span>
                  <span>
                    Updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : "—"}
                  </span>
                </div>
              </header>
              {selected.summary ? <p className="kb-summary">{selected.summary}</p> : null}
              <div className="kb-body">
                {selected.body.split(/\n{2,}/).map((para, index) => (
                  <p key={index}>{para}</p>
                ))}
              </div>
              {Array.isArray(selected.cannedResponses) && selected.cannedResponses.length > 0 ? (
                <section className="kb-macros">
                  <h3>Canned responses</h3>
                  <ul>
                    {selected.cannedResponses.map((macro, index) => (
                      <li key={`${selected._id}-macro-${index}`}>
                        <header>
                          <strong>{macro.title}</strong>
                          <span className="kb-tag">{macro.channel}</span>
                        </header>
                        <pre>{macro.body}</pre>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <p className="muted">Select an article to preview the playbook.</p>
          )}
        </article>
      </section>
    </div>
  );
}
