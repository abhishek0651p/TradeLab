import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { TradeJournalEntry } from '../types';
import { FileText, Edit2, Trash2, Plus, X, Tag } from 'lucide-react';

/* ────────────────────────────────────────────────
   Format helpers
   ──────────────────────────────────────────────── */

const formatDateTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

interface TradeJournalProps {
  /** The trade ID to scope this journal view to. Pass undefined to show all entries. */
  tradeId?: string;
  /** Optional trade symbol for display */
  tradeSymbol?: string;
  /** Optional close handler if embedded in a modal */
  onClose?: () => void;
}

export const TradeJournal: React.FC<TradeJournalProps> = ({ tradeId, tradeSymbol, onClose }) => {
  const {
    tradeJournal,
    addJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
    getJournalEntriesForTrade
  } = useTrading();

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');

  /* ── Reactive scoped entries ── */
  const entries = useMemo(() => {
    if (tradeId) {
      return getJournalEntriesForTrade(tradeId);
    }
    return tradeJournal;
  }, [tradeId, tradeJournal, getJournalEntriesForTrade]);

  /* ── Tag parsing helper ── */
  const parseTags = (raw: string): string[] =>
    raw
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0)
      .filter((t, i, arr) => arr.indexOf(t) === i);

  /* ── Form validation ── */
  const validateEntry = (title: string, content: string): string | null => {
    if (!title.trim()) return 'Title is required.';
    if (!content.trim()) return 'Content is required.';
    return null;
  };

  /* ── Handlers ── */
  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateEntry(newTitle, newContent);
    if (err) {
      alert(err);
      return;
    }
    addJournalEntry({
      tradeId: tradeId || undefined,
      title: newTitle.trim(),
      content: newContent.trim(),
      tags: parseTags(newTags)
    });
    setNewTitle('');
    setNewContent('');
    setNewTags('');
    setShowAddForm(false);
  };

  const handleStartEdit = (entry: TradeJournalEntry) => {
    setEditingId(entry.id);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditTags(entry.tags.join(', '));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const err = validateEntry(editTitle, editContent);
    if (err) {
      alert(err);
      return;
    }
    updateJournalEntry(editingId, {
      title: editTitle.trim(),
      content: editContent.trim(),
      tags: parseTags(editTags)
    });
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
    setEditTags('');
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this journal entry? This action cannot be undone.')) {
      deleteJournalEntry(id);
    }
  };

  return (
    <div className="trade-journal">
      <div className="trade-journal-header">
        <div className="trade-journal-title-wrap">
          <FileText size={18} className="trade-journal-icon" />
          <div>
            <h3 className="trade-journal-title">
              {tradeId
                ? `Trade Notes ${tradeSymbol ? `— ${tradeSymbol}` : ''}`
                : 'Trade Journal'}
            </h3>
            {tradeId && (
              <span className="trade-journal-scope-id">Trade ID: {tradeId}</span>
            )}
          </div>
        </div>

        <div className="trade-journal-header-actions">
          <button
            type="button"
            className={`btn btn-sm ${showAddForm ? 'btn-outline' : 'btn-primary'}`}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? <X size={14} /> : <Plus size={14} />}
            {showAddForm ? ' Cancel' : ' Add Note'}
          </button>
          {onClose && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onClose}
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="trade-journal-form card">
          <form onSubmit={handleAdd}>
            <div className="form-field">
              <label htmlFor="journal-new-title">Note Title *</label>
              <input
                id="journal-new-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Entry rationale, execution review, lessons learned"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="journal-new-content">Notes & Observations *</label>
              <textarea
                id="journal-new-content"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Describe setup, market conditions, emotions, and outcome..."
                rows={4}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="journal-new-tags">Tags (comma-separated)</label>
              <input
                id="journal-new-tags"
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="e.g. breakout, earnings, momentum, discipline"
              />
              <div className="field-hint">
                Add comma-separated keywords to categorize and search entries later.
              </div>
            </div>
            <div className="trade-journal-form-buttons">
              <button type="submit" className="btn btn-primary btn-sm">Save Note</button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setShowAddForm(false);
                  setNewTitle('');
                  setNewContent('');
                  setNewTags('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Form */}
      {editingId && (
        <div className="trade-journal-edit-form card">
          <form onSubmit={handleSaveEdit}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem' }}>Edit Journal Entry</h4>
            <div className="form-field">
              <label htmlFor="journal-edit-title">Title *</label>
              <input
                id="journal-edit-title"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="journal-edit-content">Content *</label>
              <textarea
                id="journal-edit-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={4}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="journal-edit-tags">Tags (comma-separated)</label>
              <input
                id="journal-edit-tags"
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="e.g. breakout, disciplined"
              />
            </div>
            <div className="trade-journal-form-buttons">
              <button type="submit" className="btn btn-primary btn-sm">Save Changes</button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setEditingId(null);
                  setEditTitle('');
                  setEditContent('');
                  setEditTags('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Entry List or Empty State */}
      {entries.length === 0 ? (
        <div className="trade-journal-empty">
          <FileText size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
          <p className="trade-journal-empty-title">
            {tradeId ? 'No notes recorded for this trade yet' : 'No journal entries yet'}
          </p>
          <p className="trade-journal-empty-sub">
            {tradeId
              ? 'Document your entry trigger, risk management, or lessons learned for this trade.'
              : 'Add your first trade journal entry using the button above.'}
          </p>
        </div>
      ) : (
        <div className="trade-journal-list">
          {entries.map(entry => (
            <div key={entry.id} className="trade-journal-entry">
              <div className="trade-journal-entry-header">
                <div className="trade-journal-entry-meta">
                  <span className="trade-journal-entry-title">{entry.title}</span>
                  <span className="trade-journal-entry-time">{formatDateTime(entry.createdAt)}</span>
                  {entry.tradeId ? (
                    <span className="trade-journal-linked-trade">Trade: {entry.tradeId}</span>
                  ) : (
                    <span className="trade-journal-general-note">General observation</span>
                  )}
                </div>
                <div className="trade-journal-entry-actions">
                  <button
                    type="button"
                    className="trade-journal-entry-btn"
                    onClick={() => handleStartEdit(entry)}
                    title="Edit entry"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    className="trade-journal-entry-btn trade-journal-entry-btn-delete"
                    onClick={() => handleDelete(entry.id)}
                    title="Delete entry"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="trade-journal-entry-content">{entry.content}</div>

              {entry.tags.length > 0 && (
                <div className="trade-journal-entry-tags">
                  <Tag size={12} className="trade-journal-tag-icon" />
                  {entry.tags.map(tag => (
                    <span key={tag} className="trade-journal-tag">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TradeJournal;

