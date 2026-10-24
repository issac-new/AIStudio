/**
 * Cluster Kanban Dashboard Plugin
 *
 * Cluster task Kanban with HTML5 drag-and-drop + node/task CRUD.
 *
 * Register with: window.__HERMES_PLUGINS__.register('cluster-kanban', Component)
 */
(function () {
  'use strict';

  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) {
    console.warn('[cluster-kanban] Plugin SDK not found — skipping registration');
    return;
  }

  var React = SDK.React;
  var h = React.createElement;
  var hooks = SDK.hooks;
  var comp = SDK.components;
  var utils = SDK.utils;
  var fetchJSON = SDK.fetchJSON;

  var useState = hooks.useState;
  var useEffect = hooks.useEffect;
  var useCallback = hooks.useCallback;

  var API = '/api/plugins/cluster-kanban';
  var MIME_TASK = 'text/x-cluster-task';

  var COLORS = {
    online: '#22c55e', degraded: '#eab308', offline: '#ef4444',
    running: '#8b5cf6', ready: '#3b82f6', pending: '#64748b',
    completed: '#22c55e', failed: '#ef4444', blocked: '#eab308',
  };

  var COLUMN_CONFIG = [
    { id: 'pending', label: 'Pending', color: '#64748b' },
    { id: 'ready', label: 'Ready', color: '#3b82f6' },
    { id: 'running', label: 'Running', color: '#8b5cf6' },
    { id: 'completed', label: 'Completed', color: '#22c55e' },
    { id: 'failed', label: 'Failed', color: '#ef4444' },
    { id: 'blocked', label: 'Blocked', color: '#eab308' },
  ];

  var PRIORITY_COLORS = { 1: '#ef4444', 2: '#f97316', 3: '#3b82f6', 4: '#22c55e', 5: '#64748b' };
  var PRIORITY_LABELS = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5' };
  var CHAT_API = API + '/chat';

  // -----------------------------------------------------------------------
  // Shared Styles
  // -----------------------------------------------------------------------
  var s = {
    page: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' },
    tabBar: { display: 'flex', gap: '0px', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
    tab: { padding: '8px 16px', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '2px solid transparent', opacity: 0.5, transition: 'all 0.15s' },
    tabActive: { padding: '8px 16px', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '2px solid #3b82f6', opacity: 1, fontWeight: 600 },

    board: { display: 'flex', gap: '12px', overflowX: 'auto', padding: '4px 0 12px', minHeight: '360px' },
    column: { flex: '0 0 260px', minWidth: '260px', display: 'flex', flexDirection: 'column', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', transition: 'border-color 0.2s, background 0.2s' },
    columnDragOver: { borderColor: 'rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.05)' },
    colHeader: { padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' },
    colTitleWrap: { display: 'flex', alignItems: 'center', gap: '8px' },
    colDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
    colTitle: { fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' },
    colCount: { fontSize: '0.7rem', opacity: 0.5, background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '10px', fontWeight: 500 },
    colBody: { padding: '10px', flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' },

    card: { padding: '12px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '10px', cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative' },
    cardHover: { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)', transform: 'translateY(-1px)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' },
    cardDragging: { opacity: 0.4 },
    cardTitle: { fontSize: '0.85rem', fontWeight: 500, lineHeight: 1.35, marginBottom: '10px', wordBreak: 'break-word' },
    cardMeta: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' },
    cardCap: { fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', opacity: 0.8 },
    cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: '4px' },
    cardId: { fontFamily: 'monospace', fontSize: '0.6rem', opacity: 0.3 },
    cardPri: { fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' },
    cardNode: { fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '4px' },
    cardNodeDot: { width: '6px', height: '6px', borderRadius: '50%' },
    cardDeps: { fontSize: '0.6rem', opacity: 0.4, marginBottom: '6px' },

    toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
    toolbarTitle: { margin: 0, fontSize: '1.1rem', fontWeight: 600 },
    toolbarSub: { fontSize: '0.65rem', opacity: 0.4, marginTop: '2px' },
    toolbarActions: { display: 'flex', gap: '8px', alignItems: 'center' },

    empty: { textAlign: 'center', padding: '32px', fontSize: '0.75rem', opacity: 0.3 },
    loading: { textAlign: 'center', padding: '60px', fontSize: '0.85rem', opacity: 0.5 },
    error: { padding: '12px 16px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },

    // Form / Dialog
    dialogBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    dialog: { width: '480px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', background: '#1a1a1f', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' },
    dialogHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
    dialogTitle: { fontSize: '1rem', fontWeight: 600, margin: 0 },
    dialogClose: { background: 'none', border: 'none', color: 'inherit', fontSize: '1.2rem', cursor: 'pointer', opacity: 0.5 },
    formGroup: { marginBottom: '14px' },
    formLabel: { display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '6px', opacity: 0.7 },
    formInput: { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit', fontSize: '0.85rem', outline: 'none' },
    formSelect: { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit', fontSize: '0.85rem', outline: 'none' },
    formTags: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' },
    formTag: { padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px' },
    formTagRemove: { cursor: 'pointer', fontWeight: 700 },
    formActions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' },

    // Drawer
    drawerShade: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' },
    drawer: { width: '460px', maxWidth: '90vw', height: '100%', background: '#1a1a1f', borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' },
    drawerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
    drawerTitle: { fontSize: '1rem', fontWeight: 600, margin: 0 },
    drawerClose: { background: 'none', border: 'none', color: 'inherit', fontSize: '1.2rem', cursor: 'pointer', opacity: 0.5 },
    drawerBody: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
    drawerSection: { marginBottom: '20px' },
    drawerSectionTitle: { fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.5, marginBottom: '10px' },
    drawerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
    drawerRowLabel: { fontSize: '0.78rem', opacity: 0.6 },
    drawerRowValue: { fontSize: '0.8rem', fontWeight: 500 },
    drawerId: { fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.5, wordBreak: 'break-all' },
    drawerActions: { display: 'flex', gap: '8px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' },

    // Dashboard
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' },
    stat: { fontSize: '1.7rem', fontWeight: 600, lineHeight: 1.2 },
    statLabel: { fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.5, marginTop: '4px' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
    th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 500, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.08em', opacity: 0.5 },
    td: { padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' },
    badge: { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 500 },
    input: { width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit', fontSize: '0.8rem', outline: 'none' },
  };

  function badgeColor(value) {
    var c = COLORS[value];
    return { bg: c + '18', c: c };
  }

  function Badge(value) {
    var col = badgeColor(value);
    return h('span', { style: { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 500, background: col.bg, color: col.c } }, value || '—');
  }

  function StatCard(label, value, color) {
    return h(comp.Card, null,
      h(comp.CardContent, null,
        h('div', { style: { padding: '4px 0' } },
          h('div', { style: Object.assign({}, s.stat, color ? { color: color } : {}) },
            value === null || value === undefined ? '—' : (typeof value === 'number' ? value.toLocaleString() : String(value))
          ),
          h('div', { style: s.statLabel }, label)
        )
      )
    );
  }

  // -----------------------------------------------------------------------
  // TagInput component (for capabilities/requires)
  // -----------------------------------------------------------------------
  function TagInput(props) {
    var _s = useState('');
    var input = _s[0], setInput = _s[1];
    var tags = props.tags || [];
    var onChange = props.onChange;

    var handleKeyDown = function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        var val = input.trim();
        if (val && tags.indexOf(val) === -1) {
          onChange(tags.concat([val]));
        }
        setInput('');
      }
      if (e.key === 'Backspace' && !input && tags.length) {
        onChange(tags.slice(0, -1));
      }
    };

    return h('div', null,
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', minHeight: '36px' } },
        tags.map(function (tag) {
          return h('span', { key: tag, style: s.formTag },
            tag,
            h('span', {
              style: s.formTagRemove,
              onClick: function () { onChange(tags.filter(function (t) { return t !== tag; })); },
            }, '×'),
          );
        }),
        h('input', {
          style: { flex: 1, minWidth: '80px', background: 'transparent', border: 'none', color: 'inherit', fontSize: '0.85rem', outline: 'none' },
          value: input,
          placeholder: props.placeholder || 'Type and press Enter…',
          onChange: function (e) { setInput(e.target.value); },
          onKeyDown: handleKeyDown,
        }),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // TaskFormDialog (Create / Edit)
  // -----------------------------------------------------------------------
  function TaskFormDialog(props) {
    var mode = props.mode || 'create'; // 'create' | 'edit'
    var initial = props.initial || {};
    var onClose = props.onClose;
    var onSubmit = props.onSubmit;

    var _s = useState({
      title: initial.title || '',
      requires: initial.requires || [],
      priority: initial.priority || 3,
      depends_on: initial.depends_on || [],
      loading: false,
      error: null,
    });
    var state = _s[0], setState = _s[1];

    var handleSubmit = function () {
      if (!state.title.trim()) {
        setState(function (p) { return Object.assign({}, p, { error: 'Title is required' }); });
        return;
      }
      setState(function (p) { return Object.assign({}, p, { loading: true, error: null }); });
      onSubmit({
        title: state.title.trim(),
        requires: state.requires,
        priority: state.priority,
        depends_on: state.depends_on,
      }).then(function () {
        onClose();
      }).catch(function (err) {
        setState(function (p) { return Object.assign({}, p, { loading: false, error: String(err.message || err) }); });
      });
    };

    return h('div', { style: s.dialogBackdrop, onClick: onClose },
      h('div', { style: s.dialog, onClick: function (e) { e.stopPropagation(); } },
        h('div', { style: s.dialogHead },
          h('h3', { style: s.dialogTitle }, mode === 'create' ? '＋ New Task' : '✎ Edit Task'),
          h('button', { style: s.dialogClose, onClick: onClose }, '✕'),
        ),
        state.error ? h('div', { style: Object.assign({}, s.error, { marginBottom: '12px' }) }, state.error) : null,
        h('div', { style: s.formGroup },
          h('label', { style: s.formLabel }, 'Title *'),
          h('input', {
            style: s.formInput,
            value: state.title,
            onChange: function (e) { setState(function (p) { return Object.assign({}, p, { title: e.target.value }); }); },
            placeholder: 'e.g. Implement auth module',
          }),
        ),
        h('div', { style: s.formGroup },
          h('label', { style: s.formLabel }, 'Priority'),
          h('select', {
            style: s.formSelect,
            value: state.priority,
            onChange: function (e) { setState(function (p) { return Object.assign({}, p, { priority: parseInt(e.target.value) }); }); },
          },
            [1, 2, 3, 4, 5].map(function (p) {
              return h('option', { key: p, value: p }, 'P' + p + ' — ' + (p === 1 ? 'Critical' : p === 2 ? 'High' : p === 3 ? 'Normal' : p === 4 ? 'Low' : 'Lowest'));
            }),
          ),
        ),
        h('div', { style: s.formGroup },
          h('label', { style: s.formLabel }, 'Required Capabilities'),
          h(TagInput, {
            tags: state.requires,
            onChange: function (tags) { setState(function (p) { return Object.assign({}, p, { requires: tags }); }); },
            placeholder: 'e.g. coding, testing',
          }),
        ),
        h('div', { style: s.formGroup },
          h('label', { style: s.formLabel }, 'Dependencies (Task IDs)'),
          h(TagInput, {
            tags: state.depends_on,
            onChange: function (tags) { setState(function (p) { return Object.assign({}, p, { depends_on: tags }); }); },
            placeholder: 'Paste task IDs…',
          }),
        ),
        h('div', { style: s.formActions },
          h(comp.Button, { size: 'sm', variant: 'ghost', onClick: onClose }, 'Cancel'),
          h(comp.Button, { size: 'sm', onClick: handleSubmit, disabled: state.loading },
            state.loading ? 'Saving…' : (mode === 'create' ? 'Create Task' : 'Save Changes')
          ),
        ),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // NodeManager (side panel / dialog)
  // -----------------------------------------------------------------------
  function NodeManager(props) {
    var nodes = props.nodes || [];
    var onClose = props.onClose;
    var onRefresh = props.onRefresh;

    var _edit = useState(null);
    var editingNode = _edit[0], setEditingNode = _edit[1];

    var _s = useState({ name: '', capabilities: '', loading: false, error: null });
    var form = _s[0], setForm = _s[1];

    var handleDelete = function (nodeId) {
      if (!window.confirm('Delete node ' + nodeId + '? Assigned tasks will be unassigned.')) return;
      fetchJSON(API + '/kanban/nodes/' + encodeURIComponent(nodeId), { method: 'DELETE' })
        .then(function () { onRefresh(); })
        .catch(function (e) { alert('Delete failed: ' + e.message); });
    };

    var handleSaveEdit = function () {
      var caps = form.capabilities.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
      setForm(function (p) { return Object.assign({}, p, { loading: true }); });
      fetchJSON(API + '/kanban/nodes/' + encodeURIComponent(editingNode), {
        method: 'PATCH',
        body: JSON.stringify({ name: form.name || undefined, capabilities: caps.length ? caps : undefined }),
        headers: { 'Content-Type': 'application/json' },
      }).then(function () {
        setEditingNode(null);
        setForm(function (p) { return Object.assign({}, p, { loading: false, error: null }); });
        onRefresh();
      }).catch(function (e) {
        setForm(function (p) { return Object.assign({}, p, { loading: false, error: e.message }); });
      });
    };

    var startEdit = function (node) {
      setEditingNode(node.id);
      setForm({ name: node.name || '', capabilities: (node.capabilities || []).join(', '), loading: false, error: null });
    };

    return h('div', { style: s.dialogBackdrop, onClick: onClose },
      h('div', { style: Object.assign({}, s.dialog, { width: '520px' }), onClick: function (e) { e.stopPropagation(); } },
        h('div', { style: s.dialogHead },
          h('h3', { style: s.dialogTitle }, '🖥 Manage Nodes'),
          h('button', { style: s.dialogClose, onClick: onClose }, '✕'),
        ),
        nodes.length === 0 ? h('div', { style: s.empty }, 'No nodes registered') :
        h('div', null, nodes.map(function (node) {
          var isEditing = editingNode === node.id;
          return h('div', {
            key: node.id,
            style: { padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '10px' },
          },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
              h('div', null,
                h('div', { style: { fontSize: '0.9rem', fontWeight: 600 } }, node.name || node.id),
                h('div', { style: { fontSize: '0.65rem', opacity: 0.4, fontFamily: 'monospace' } }, node.id),
              ),
              h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                Badge(node.status),
                !isEditing ? h(comp.Button, { size: 'sm', variant: 'ghost', onClick: function () { startEdit(node); } }, '✎') : null,
                !isEditing ? h(comp.Button, { size: 'sm', variant: 'ghost', onClick: function () { handleDelete(node.id); } }, '🗑') : null,
              ),
            ),
            isEditing ? h('div', null,
              h('div', { style: s.formGroup },
                h('label', { style: s.formLabel }, 'Name'),
                h('input', {
                  style: s.formInput,
                  value: form.name,
                  onChange: function (e) { setForm(function (p) { return Object.assign({}, p, { name: e.target.value }); }); },
                }),
              ),
              h('div', { style: s.formGroup },
                h('label', { style: s.formLabel }, 'Capabilities (comma-separated)'),
                h('input', {
                  style: s.formInput,
                  value: form.capabilities,
                  onChange: function (e) { setForm(function (p) { return Object.assign({}, p, { capabilities: e.target.value }); }); },
                }),
              ),
              form.error ? h('div', { style: { color: '#ef4444', fontSize: '0.75rem', marginBottom: '8px' } }, form.error) : null,
              h('div', { style: { display: 'flex', gap: '6px' } },
                h(comp.Button, { size: 'sm', variant: 'ghost', onClick: function () { setEditingNode(null); } }, 'Cancel'),
                h(comp.Button, { size: 'sm', onClick: handleSaveEdit, disabled: form.loading }, form.loading ? 'Saving…' : 'Save'),
              ),
            ) : h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
              (node.capabilities || []).map(function (c) {
                return h('span', { key: c, style: { padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)' } }, c);
              }),
            ),
          );
        })),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // KanbanCard
  // -----------------------------------------------------------------------
  function KanbanCard(props) {
    var task = props.task;
    var isDragging = props.isDragging;
    var priColor = PRIORITY_COLORS[task.priority] || '#888';
    var priLabel = PRIORITY_LABELS[task.priority] || 'P?';
    var nodeStatus = task.node_status || 'unknown';
    var nodeColor = COLORS[nodeStatus] || '#888';

    var _hover = useState(false);
    var hover = _hover[0], setHover = _hover[1];

    var handleDragStart = useCallback(function (e) {
      e.dataTransfer.setData(MIME_TASK, task.id);
      e.dataTransfer.effectAllowed = 'move';
      var rect = e.currentTarget.getBoundingClientRect();
      e.dataTransfer.setDragImage(e.currentTarget, e.clientX - rect.left, e.clientY - rect.top);
      if (props.onDragStart) props.onDragStart(task.id);
    }, [task.id]);

    var handleDragEnd = useCallback(function () {
      if (props.onDragEnd) props.onDragEnd();
    }, []);

    var handleClick = useCallback(function () {
      if (props.onOpen) props.onOpen(task.id);
    }, [task.id]);

    var cardStyle = Object.assign({}, s.card);
    if (hover && !isDragging) Object.assign(cardStyle, s.cardHover);
    if (isDragging) Object.assign(cardStyle, s.cardDragging);

    return h('div', {
      style: cardStyle,
      draggable: true,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onClick: handleClick,
      onMouseEnter: function () { setHover(true); },
      onMouseLeave: function () { setHover(false); },
    },
      h('div', { style: { position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', borderRadius: '8px 0 0 8px', background: priColor, opacity: 0.6 } }),
      h('div', { style: Object.assign({}, s.cardTitle, { paddingLeft: '6px' }) }, task.title),
      (task.requires || []).length > 0 ? h('div', { style: s.cardMeta },
        (task.requires || []).map(function (r) { return h('span', { key: r, style: s.cardCap }, r); })
      ) : null,
      task.depends_on && task.depends_on.length > 0
        ? h('div', { style: s.cardDeps }, '⛓ ' + task.depends_on.length + ' dep' + (task.depends_on.length > 1 ? 's' : ''))
        : null,
      h('div', { style: s.cardFooter },
        h('span', { style: s.cardId }, task.id.slice(0, 12) + '…'),
        h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
          task.assigned_to
            ? h('span', { style: s.cardNode },
                h('span', { style: Object.assign({}, s.cardNodeDot, { background: nodeColor }) }),
                (task.assigned_node_name || task.assigned_to).slice(0, 12)
              )
            : null,
          h('span', { style: Object.assign({}, s.cardPri, { color: priColor, background: priColor + '15' }) }, priLabel),
        ),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // KanbanColumn
  // -----------------------------------------------------------------------
  function KanbanColumn(props) {
    var col = props.column;
    var colCfg = COLUMN_CONFIG.find(function (c) { return c.id === col.id; }) || { label: col.id, color: '#888' };
    var color = colCfg.color;
    var tasks = col.tasks || [];

    var _over = useState(false);
    var dragOver = _over[0], setDragOver = _over[1];

    var handleDragOver = useCallback(function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOver(true);
    }, []);

    var handleDragLeave = useCallback(function () { setDragOver(false); }, []);

    var handleDrop = useCallback(function (e) {
      e.preventDefault();
      setDragOver(false);
      var taskId = e.dataTransfer.getData(MIME_TASK);
      if (taskId && props.onDrop) props.onDrop(taskId, col.id);
    }, [col.id]);

    var colStyle = Object.assign({}, s.column);
    if (dragOver) {
      Object.assign(colStyle, s.columnDragOver);
      colStyle.borderLeft = '3px solid ' + color;
    } else {
      colStyle.borderLeft = '3px solid ' + color + '40';
    }

    return h('div', { style: colStyle, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop },
      h('div', { style: s.colHeader },
        h('div', { style: s.colTitleWrap },
          h('span', { style: Object.assign({}, s.colDot, { background: color }) }),
          h('span', { style: Object.assign({}, s.colTitle, { color: color }) }, colCfg.label),
        ),
        h('span', { style: s.colCount }, tasks.length),
      ),
      h('div', { style: s.colBody },
        tasks.length === 0
          ? h('div', { style: s.empty }, 'Drop tasks here')
          : tasks.map(function (task) {
              return h(KanbanCard, {
                key: task.id,
                task: task,
                isDragging: props.draggingTaskId === task.id,
                onDragStart: props.onDragStart,
                onDragEnd: props.onDragEnd,
                onOpen: props.onOpen,
              });
            }),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // TaskDetailDrawer
  // -----------------------------------------------------------------------
  function TaskDetailDrawer(props) {
    var taskId = props.taskId;
    var onClose = props.onClose;
    var onRefresh = props.onRefresh;
    var onEdit = props.onEdit;

    var _d = useState(null);
    var data = _d[0], setData = _d[1];
    var _l = useState(true);
    var loading = _l[0], setLoading = _l[1];
    var _e = useState(null);
    var err = _e[0], setErr = _e[1];

    var load = useCallback(function () {
      setLoading(true);
      fetchJSON(API + '/kanban/tasks/' + encodeURIComponent(taskId))
        .then(function (d) { setData(d); setErr(null); })
        .catch(function (e) { setErr(String(e.message || e)); })
        .finally(function () { setLoading(false); });
    }, [taskId]);

    useEffect(function () { load(); }, [load]);

    useEffect(function () {
      function onKey(e) { if (e.key === 'Escape') onClose(); }
      window.addEventListener('keydown', onKey);
      return function () { window.removeEventListener('keydown', onKey); };
    }, [onClose]);

    var handleDelete = function () {
      if (!window.confirm('Delete task ' + taskId + '?')) return;
      fetchJSON(API + '/kanban/tasks/' + encodeURIComponent(taskId), { method: 'DELETE' })
        .then(function () { onRefresh(); onClose(); })
        .catch(function (e) { setErr(String(e.message || e)); });
    };

    var handleComplete = function () {
      fetchJSON(API + '/kanban/tasks/' + encodeURIComponent(taskId) + '/move', {
        method: 'POST', body: JSON.stringify({ status: 'completed' }), headers: { 'Content-Type': 'application/json' },
      }).then(function () { onRefresh(); onClose(); }).catch(function (e) { setErr(String(e.message || e)); });
    };

    var handleFail = function () {
      fetchJSON(API + '/kanban/tasks/' + encodeURIComponent(taskId) + '/move', {
        method: 'POST', body: JSON.stringify({ status: 'failed' }), headers: { 'Content-Type': 'application/json' },
      }).then(function () { onRefresh(); onClose(); }).catch(function (e) { setErr(String(e.message || e)); });
    };

    var handleReset = function () {
      fetchJSON(API + '/kanban/tasks/' + encodeURIComponent(taskId) + '/move', {
        method: 'POST', body: JSON.stringify({ status: 'ready' }), headers: { 'Content-Type': 'application/json' },
      }).then(function () { onRefresh(); onClose(); }).catch(function (e) { setErr(String(e.message || e)); });
    };

    var priColor = data ? (PRIORITY_COLORS[data.priority] || '#888') : '#888';

    function DrawerRow(label, value) {
      return h('div', { style: s.drawerRow },
        h('span', { style: s.drawerRowLabel }, label),
        h('span', { style: s.drawerRowValue }, value || '—'),
      );
    }

    return h('div', { style: s.drawerShade, onClick: onClose },
      h('div', { style: s.drawer, onClick: function (e) { e.stopPropagation(); } },
        h('div', { style: s.drawerHead },
          h('h3', { style: s.drawerTitle }, 'Task Detail'),
          h('button', { style: s.drawerClose, onClick: onClose }, '✕'),
        ),
        h('div', { style: s.drawerBody },
          loading ? h('div', { style: s.loading }, 'Loading…') :
          err ? h('div', { style: s.error }, err) :
          !data ? h('div', { style: s.empty }, 'No data') :
          h('div', null,
            h('div', { style: s.drawerSection },
              h('div', { style: { fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.4, marginBottom: '12px' } }, data.title),
              h('div', { style: s.drawerId }, data.id),
            ),
            h('div', { style: s.drawerSection },
              h('div', { style: s.drawerSectionTitle }, 'Status'),
              DrawerRow('Status', Badge(data.status)),
              DrawerRow('Priority', h('span', { style: { color: priColor, fontWeight: 600 } }, 'P' + data.priority)),
              data.fail_reason ? DrawerRow('Fail Reason', h('span', { style: { color: '#ef4444' } }, data.fail_reason)) : null,
            ),
            h('div', { style: s.drawerSection },
              h('div', { style: s.drawerSectionTitle }, 'Assignment'),
              DrawerRow('Assigned To', data.assigned_to || 'Unassigned'),
              data.assigned_to ? DrawerRow('Node Status', Badge(data.node_status || 'unknown')) : null,
            ),
            h('div', { style: s.drawerSection },
              h('div', { style: s.drawerSectionTitle }, 'Requirements'),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
                (data.requires || []).map(function (r) {
                  return h('span', { key: r, style: { padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)' } }, r);
                }),
              ),
            ),
            h('div', { style: s.drawerSection },
              h('div', { style: s.drawerSectionTitle }, 'Dependencies'),
              (data.depends_on || []).length > 0 ? h('div', null,
                (data.depends_on || []).map(function (dep) {
                  return h('div', { key: dep, style: s.drawerDepItem },
                    h('span', { style: { fontFamily: 'monospace', fontSize: '0.7rem', opacity: 0.6 } }, dep.slice(0, 20) + '…'),
                  );
                }),
              ) : h('div', { style: { fontSize: '0.8rem', opacity: 0.4 } }, 'No dependencies'),
            ),
            data.dependents_count > 0 ? h('div', { style: s.drawerSection },
              h('div', { style: s.drawerSectionTitle }, 'Dependents (' + data.dependents_count + ')'),
              h('div', null, (data.dependents || []).map(function (dep) {
                return h('div', { key: dep, style: s.drawerDepItem },
                  h('span', { style: { fontFamily: 'monospace', fontSize: '0.7rem', opacity: 0.6 } }, dep.slice(0, 20) + '…'),
                );
              })),
            ) : null,
            h('div', { style: s.drawerSection },
              h('div', { style: s.drawerSectionTitle }, 'Timeline'),
              DrawerRow('Created', data.created_at ? new Date(data.created_at).toLocaleString() : '—'),
              DrawerRow('Updated', data.updated_at ? new Date(data.updated_at).toLocaleString() : '—'),
              DrawerRow('Version', String(data.version || 1)),
            ),
            h('div', { style: s.drawerActions },
              data.status !== 'completed' ? h(comp.Button, { size: 'sm', onClick: handleComplete }, '✓ Complete') : null,
              data.status !== 'failed' ? h(comp.Button, { size: 'sm', variant: 'ghost', onClick: handleFail }, '✕ Fail') : null,
              data.status !== 'ready' && data.status !== 'pending' ? h(comp.Button, { size: 'sm', variant: 'ghost', onClick: handleReset }, '↺ Reset') : null,
              h(comp.Button, { size: 'sm', variant: 'ghost', onClick: function () { onEdit(data); } }, '✎ Edit'),
              h(comp.Button, { size: 'sm', variant: 'ghost', onClick: handleDelete }, '🗑 Delete'),
            ),
          ),
        ),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // KanbanBoard
  // -----------------------------------------------------------------------
  function KanbanBoard(props) {
    var columns = props.columns || [];
    var nodes = props.nodes || [];
    var loading = props.loading;
    var onRefresh = props.onRefresh;
    var onMove = props.onMove;

    var _drag = useState(null);
    var draggingTaskId = _drag[0], setDraggingTaskId = _drag[1];

    var _open = useState(null);
    var openTaskId = _open[0], setOpenTaskId = _open[1];

    var _form = useState(null);
    var formMode = _form[0], setFormMode = _form[1];

    var _editTask = useState(null);
    var editTask = _editTask[0], setEditTask = _editTask[1];

    var _showNodes = useState(false);
    var showNodes = _showNodes[0], setShowNodes = _showNodes[1];

    var handleDragStart = useCallback(function (taskId) { setDraggingTaskId(taskId); }, []);
    var handleDragEnd = useCallback(function () { setDraggingTaskId(null); }, []);
    var handleDrop = useCallback(function (taskId, newStatus) {
      setDraggingTaskId(null);
      if (onMove) onMove(taskId, newStatus);
    }, [onMove]);

    var handleOpen = useCallback(function (taskId) { setOpenTaskId(taskId); }, []);
    var handleClose = useCallback(function () { setOpenTaskId(null); }, []);

    var handleCreate = function (data) {
      return fetchJSON(API + '/kanban/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }).then(function () { onRefresh(); });
    };

    var handleEdit = function (data) {
      return fetchJSON(API + '/kanban/tasks/' + encodeURIComponent(editTask.id), {
        method: 'PATCH',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }).then(function () { onRefresh(); });
    };

    var openEditFromDrawer = useCallback(function (task) {
      setOpenTaskId(null);
      setEditTask(task);
      setFormMode('edit');
    }, []);

    if (loading) {
      return h('div', { style: s.loading }, 'Loading kanban board…');
    }

    return h('div', null,
      h('div', { style: s.toolbar },
        h('div', null,
          h('h2', { style: s.toolbarTitle }, 'Cluster Kanban'),
          h('div', { style: s.toolbarSub }, 'Click card for details. Drag to change status.'),
        ),
        h('div', { style: s.toolbarActions },
          h(comp.Button, { size: 'sm', variant: 'ghost', onClick: function () { setShowNodes(true); } }, '🖥 Nodes'),
          h(comp.Button, { size: 'sm', onClick: function () { setFormMode('create'); } }, '＋ New Task'),
          h(comp.Button, { size: 'sm', variant: 'ghost', onClick: onRefresh }, '↻ Refresh'),
        ),
      ),
      h('div', { style: s.board },
        columns.map(function (col) {
          return h(KanbanColumn, {
            key: col.id,
            column: col,
            draggingTaskId: draggingTaskId,
            onDragStart: handleDragStart,
            onDragEnd: handleDragEnd,
            onDrop: handleDrop,
            onOpen: handleOpen,
          });
        }),
      ),
      openTaskId ? h(TaskDetailDrawer, {
        taskId: openTaskId,
        onClose: handleClose,
        onRefresh: onRefresh,
        onEdit: openEditFromDrawer,
      }) : null,
      formMode === 'create' ? h(TaskFormDialog, {
        mode: 'create',
        onClose: function () { setFormMode(null); },
        onSubmit: handleCreate,
      }) : null,
      formMode === 'edit' && editTask ? h(TaskFormDialog, {
        mode: 'edit',
        initial: editTask,
        onClose: function () { setFormMode(null); setEditTask(null); },
        onSubmit: handleEdit,
      }) : null,
      showNodes ? h(NodeManager, {
        nodes: nodes,
        onClose: function () { setShowNodes(false); },
        onRefresh: onRefresh,
      }) : null,
    );
  }

  // -----------------------------------------------------------------------
  // DashboardView
  // -----------------------------------------------------------------------
  function DashboardView(props) {
    var state = props.state;
    var isConnected = state.status && state.status.ok !== false;

    if (!isConnected) {
      return h(comp.Card, null,
        h(comp.CardContent, { style: { textAlign: 'center', padding: '40px' } },
          h('div', { style: { fontSize: '2rem', marginBottom: '12px' } }, '🌐'),
          h('div', { style: { fontSize: '0.9rem', fontWeight: 600 } }, 'Cluster Service Not Connected'),
        ),
      );
    }

    var tasks = state.tasks || [];
    var nodes = state.nodes || [];

    return h('div', null,
      h('div', { style: s.grid },
        StatCard('Nodes Online', nodes.filter(function(n){ return n.status === 'online'; }).length + ' / ' + nodes.length, COLORS.online),
        StatCard('Total Tasks', tasks.length, COLORS.ready),
        StatCard('Running', tasks.filter(function(t){ return t.status === 'running'; }).length, COLORS.running),
        StatCard('Completed', tasks.filter(function(t){ return t.status === 'completed'; }).length, COLORS.completed),
        StatCard('Ready', tasks.filter(function(t){ return t.status === 'ready'; }).length, COLORS.ready),
        StatCard('Failed', tasks.filter(function(t){ return t.status === 'failed'; }).length, COLORS.failed),
      ),
      nodes.length > 0 ? h(comp.Card, null,
        h(comp.CardHeader, null, h(comp.CardTitle, { style: { fontSize: '0.9rem' } }, 'Nodes (', nodes.length, ')')),
        h(comp.CardContent, { style: { padding: 0, overflowX: 'auto' } },
          h('table', { style: s.table },
            h('thead', null, h('tr', null,
              h('th', { style: s.th }, 'Name'),
              h('th', { style: s.th }, 'Status'),
              h('th', { style: s.th }, 'Capabilities'),
              h('th', { style: s.th }, 'Load'),
              h('th', { style: s.th }, 'Heartbeat'),
            )),
            h('tbody', null, nodes.map(function (node) {
              var hb = node.last_heartbeat
                ? (utils.isoTimeAgo ? utils.isoTimeAgo(node.last_heartbeat) : new Date(node.last_heartbeat).toLocaleString())
                : '—';
              return h('tr', { key: node.id },
                h('td', { style: s.td },
                  h('div', null, node.name || node.id),
                  h('div', { style: { fontSize: '0.65rem', opacity: 0.4 } }, node.id),
                ),
                h('td', { style: s.td }, Badge(node.status)),
                h('td', { style: s.td },
                  h('span', { style: { display: 'flex', flexWrap: 'wrap' } },
                    (node.capabilities || []).map(function (c) {
                      return h('span', { key: c, style: { padding: '1px 6px', margin: '1px 4px 1px 0', borderRadius: '3px', fontSize: '0.65rem', background: 'rgba(255,255,255,0.06)' } }, c);
                    }),
                  ),
                ),
                h('td', { style: Object.assign({}, s.td, { fontSize: '0.75rem' }) },
                  node.load !== undefined ? (node.load * 100).toFixed(0) + '%' : '—',
                ),
                h('td', { style: Object.assign({}, s.td, { fontSize: '0.7rem', opacity: 0.6 }) }, hb),
              );
            })),
          ),
        ),
      ) : null,
      tasks.length > 0 ? h(comp.Card, null,
        h(comp.CardHeader, null, h(comp.CardTitle, { style: { fontSize: '0.9rem' } }, 'Tasks (', tasks.length, ')')),
        h(comp.CardContent, { style: { padding: 0, overflowX: 'auto' } },
          h('table', { style: s.table },
            h('thead', null, h('tr', null,
              h('th', { style: s.th }, 'ID'),
              h('th', { style: s.th }, 'Title'),
              h('th', { style: s.th }, 'Status'),
              h('th', { style: s.th }, 'Assigned'),
              h('th', { style: s.th }, 'Requires'),
              h('th', { style: s.th }, 'Deps'),
            )),
            h('tbody', null, tasks.map(function (task) {
              return h('tr', { key: task.id },
                h('td', { style: Object.assign({}, s.td, { fontFamily: 'monospace', fontSize: '0.7rem' }) }, task.id.slice(0, 16) + '…'),
                h('td', { style: s.td }, task.title || '—'),
                h('td', { style: s.td }, Badge(task.status)),
                h('td', { style: Object.assign({}, s.td, { fontSize: '0.75rem' }) }, task.assigned_to || '—'),
                h('td', { style: s.td },
                  h('span', { style: { display: 'flex', flexWrap: 'wrap' } },
                    (task.requires || []).map(function (r) {
                      return h('span', { key: r, style: { padding: '1px 6px', margin: '1px 4px 1px 0', borderRadius: '3px', fontSize: '0.65rem', background: 'rgba(255,255,255,0.06)' } }, r);
                    }),
                  ),
                ),
                h('td', { style: Object.assign({}, s.td, { fontSize: '0.7rem', opacity: 0.7 }) },
                  task.depends_on && task.depends_on.length > 0 ? task.depends_on.length + ' deps' : '—'
                ),
              );
            })),
          ),
        ),
      ) : null,
    );
  }

  // -----------------------------------------------------------------------
  // ConfigPanel
  // -----------------------------------------------------------------------
  function ConfigPanel(props) {
    var _s = useState({ endpoint: '', saved: false, loading: false });
    var state = _s[0], setState = _s[1];

    useEffect(function () {
      fetchJSON(API + '/config')
        .then(function (d) { setState(function (p) { return Object.assign({}, p, { endpoint: d.endpoint || 'http://127.0.0.1:8787' }); }); })
        .catch(function () {});
    }, []);

    var save = function () {
      setState(function (p) { return Object.assign({}, p, { loading: true }); });
      fetchJSON(API + '/config', {
        method: 'POST',
        body: JSON.stringify({ endpoint: state.endpoint }),
        headers: { 'Content-Type': 'application/json' },
      }).then(function () {
        setState(function (p) { return Object.assign({}, p, { saved: true, loading: false }); });
        setTimeout(function () { setState(function (p) { return Object.assign({}, p, { saved: false }); }); }, 2000);
        props.onRefresh();
      }).catch(function () {
        setState(function (p) { return Object.assign({}, p, { loading: false }); });
      });
    };

    return h('div', { style: { maxWidth: '500px' } },
      h('h3', { style: { margin: '0 0 16px', fontSize: '1rem' } }, 'Cluster Endpoint'),
      h('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
        h('input', {
          style: Object.assign({}, s.input, { flex: 1 }),
          value: state.endpoint,
          onChange: function (e) { setState(function (p) { return Object.assign({}, p, { endpoint: e.target.value }); }); },
          placeholder: 'http://host:port',
        }),
        h(comp.Button, { size: 'sm', onClick: save, disabled: state.loading }, state.loading ? 'Saving…' : 'Save'),
      ),
      state.saved ? h('div', { style: { color: '#22c55e', fontSize: '0.75rem' } }, '✓ Saved') : null,
    );
  }

  // -----------------------------------------------------------------------
  // Chat Components
  // -----------------------------------------------------------------------

  function ChatPanel(props) {
    var nodes = props.nodes || [];
    var currentNodeId = props.currentNodeId || '';

    var _st = useState({ peers: [], sessions: [], messages: [], loading: true, error: null });
    var chatState = _st[0], setChatState = _st[1];

    var _active = useState(null);
    var activeChat = _active[0], setActiveChat = _active[1];

    var _input = useState('');
    var inputText = _input[0], setInputText = _input[1];

    var refreshChat = useCallback(function () {
      setChatState(function (p) { return Object.assign({}, p, { loading: true }); });
      Promise.all([
        fetchJSON(CHAT_API + '/peers').catch(function () { return { peers: [] }; }),
        fetchJSON(CHAT_API + '/sessions?node_id=' + currentNodeId).catch(function () { return { sessions: [] }; }),
      ]).then(function (results) {
        setChatState(function (p) {
          return Object.assign({}, p, {
            peers: results[0].peers || [],
            sessions: results[1].sessions || [],
            loading: false,
            error: null,
          });
        });
      });
    }, [currentNodeId]);

    useEffect(function () { refreshChat(); }, [refreshChat]);

    useEffect(function () {
      var id = setInterval(refreshChat, 10000);
      return function () { clearInterval(id); };
    }, [refreshChat]);

    var loadMessages = useCallback(function () {
      if (!activeChat) return;
      var url;
      if (activeChat.type === 'direct') {
        url = CHAT_API + '/conversation/' + currentNodeId + '/' + activeChat.peerId;
      } else {
        url = CHAT_API + '/sessions/' + activeChat.sessionId;
      }
      fetchJSON(url).then(function (data) {
        var msgs = data.messages || [];
        setChatState(function (p) { return Object.assign({}, p, { messages: msgs }); });
      });
    }, [activeChat, currentNodeId]);

    useEffect(function () {
      loadMessages();
      var id = setInterval(loadMessages, 3000);
      return function () { clearInterval(id); };
    }, [loadMessages]);

    var sendMessage = useCallback(function () {
      if (!inputText.trim() || !activeChat) return;
      var payload;
      if (activeChat.type === 'direct') {
        payload = {
          sender_node: currentNodeId,
          target_node: activeChat.peerId,
          content: inputText.trim(),
          msg_type: 'direct',
        };
      } else {
        payload = {
          sender_node: currentNodeId,
          content: inputText.trim(),
          msg_type: 'group',
          session_id: activeChat.sessionId,
        };
      }
      fetchJSON(CHAT_API + '/send', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      }).then(function () {
        setInputText('');
        loadMessages();
      }).catch(function (err) {
        setChatState(function (p) { return Object.assign({}, p, { error: 'Send failed: ' + err.message }); });
      });
    }, [inputText, activeChat, currentNodeId, loadMessages]);

    var createGroupSession = useCallback(function () {
      var name = prompt('Session name:');
      if (!name) return;
      var peerIds = chatState.peers.map(function (p) { return p.id; }).filter(function (id) { return id !== currentNodeId; });
      if (peerIds.length === 0) {
        alert('No other nodes to invite');
        return;
      }
      var selected = prompt('Invite nodes (comma-separated IDs):\nAvailable: ' + peerIds.join(', '));
      if (!selected) return;
      var participants = selected.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      participants.push(currentNodeId);
      fetchJSON(CHAT_API + '/sessions', {
        method: 'POST',
        body: JSON.stringify({ name: name, participants: participants }),
        headers: { 'Content-Type': 'application/json' },
      }).then(function () {
        refreshChat();
      });
    }, [chatState.peers, currentNodeId, refreshChat]);

    var activeTitle = '';
    if (activeChat) {
      if (activeChat.type === 'direct') {
        var peer = chatState.peers.find(function (p) { return p.id === activeChat.peerId; });
        activeTitle = peer ? peer.name + ' (' + peer.id + ')' : activeChat.peerId;
      } else {
        var sess = chatState.sessions.find(function (s) { return s.id === activeChat.sessionId; });
        activeTitle = sess ? (sess.name || sess.id) : activeChat.sessionId;
      }
    }

    return h('div', { style: { display: 'flex', gap: '12px', height: 'calc(100vh - 180px)' } },
      h('div', { style: { flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('span', { style: { fontSize: '0.8rem', fontWeight: 600 } }, 'Peers'),
          h('button', {
            style: { fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer' },
            onClick: createGroupSession,
          }, '+ Group'),
        ),
        chatState.peers.map(function (peer) {
          return h('div', {
            key: peer.id,
            style: {
              padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
              background: activeChat && activeChat.type === 'direct' && activeChat.peerId === peer.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.04)',
            },
            onClick: function () { setActiveChat({ type: 'direct', peerId: peer.id }); },
          },
            h('div', { style: { fontSize: '0.78rem', fontWeight: 500 } }, peer.name || peer.id),
            h('div', { style: { fontSize: '0.6rem', opacity: 0.4 } }, peer.id),
          );
        }),
        chatState.sessions.length > 0 ? h('div', { style: { marginTop: '8px', fontSize: '0.8rem', fontWeight: 600 } }, 'Groups') : null,
        chatState.sessions.map(function (sess) {
          return h('div', {
            key: sess.id,
            style: {
              padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
              background: activeChat && activeChat.type === 'group' && activeChat.sessionId === sess.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.04)',
            },
            onClick: function () { setActiveChat({ type: 'group', sessionId: sess.id }); },
          },
            h('div', { style: { fontSize: '0.78rem', fontWeight: 500 } }, sess.name || sess.id),
            h('div', { style: { fontSize: '0.6rem', opacity: 0.4 } }, sess.participants.length + ' members'),
          );
        }),
      ),
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', background: 'rgba(0,0,0,0.15)' } },
        h('div', { style: { padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('span', { style: { fontSize: '0.85rem', fontWeight: 600 } }, activeChat ? activeTitle : 'Select a peer or group'),
          activeChat && activeChat.type === 'group' ? h('button', {
            style: { fontSize: '0.6rem', padding: '2px 8px', borderRadius: '4px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' },
            onClick: function () {
              if (!confirm('Leave this session?')) return;
              fetchJSON(CHAT_API + '/sessions/' + activeChat.sessionId + '/leave', {
                method: 'POST',
                body: JSON.stringify({ node_id: currentNodeId }),
                headers: { 'Content-Type': 'application/json' },
              }).then(function () { refreshChat(); setActiveChat(null); });
            },
          }, 'Leave') : null,
        ),
        h('div', { style: { flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
          !activeChat ? h('div', { style: { textAlign: 'center', padding: '40px', opacity: 0.3, fontSize: '0.8rem' } }, 'Select a peer or group to start chatting') :
          chatState.messages.length === 0 ? h('div', { style: { textAlign: 'center', padding: '40px', opacity: 0.3, fontSize: '0.8rem' } }, 'No messages yet') :
          chatState.messages.map(function (msg) {
            var isMe = msg.sender_node === currentNodeId;
            return h('div', {
              key: msg.id,
              style: {
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '70%',
                padding: '8px 12px',
                borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: isMe ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                fontSize: '0.8rem',
              },
            },
              h('div', { style: { fontSize: '0.6rem', opacity: 0.5, marginBottom: '2px' } }, msg.sender_node),
              msg.content,
              h('div', { style: { fontSize: '0.55rem', opacity: 0.3, marginTop: '4px', textAlign: 'right' } },
                msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '',
              ),
            );
          }),
        ),
        activeChat ? h('div', { style: { padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px' } },
          h('input', {
            style: Object.assign({}, s.formInput, { flex: 1 }),
            placeholder: 'Type a message...',
            value: inputText,
            onChange: function (e) { setInputText(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter') sendMessage(); },
          }),
          h(comp.Button, { size: 'sm', onClick: sendMessage }, 'Send'),
        ) : null,
      ),
    );
  }

  // -----------------------------------------------------------------------
  // Main App
  // -----------------------------------------------------------------------
  function ClusterDashboard() {
    var _t = useState('kanban');
    var tab = _t[0], setTab = _t[1];

    var _s = useState({
      status: null, nodes: null, tasks: null, leases: null,
      kanban: null, loading: true, error: null,
    });
    var state = _s[0], setState = _s[1];

    var refresh = useCallback(function () {
      setState(function (p) { return Object.assign({}, p, { loading: true, error: null }); });
      Promise.all([
        fetchJSON(API + '/status').catch(function () { return null; }),
        fetchJSON(API + '/nodes').catch(function () { return null; }),
        fetchJSON(API + '/tasks').catch(function () { return null; }),
        fetchJSON(API + '/leases').catch(function () { return null; }),
        fetchJSON(API + '/kanban/columns').catch(function () { return null; }),
      ]).then(function (results) {
        setState(function (p) {
          return Object.assign({}, p, {
            status: results[0], nodes: results[1], tasks: results[2],
            leases: results[3], kanban: results[4],
            loading: false, error: null,
          });
        });
      }).catch(function (err) {
        setState(function (p) { return Object.assign({}, p, { loading: false, error: err.message }); });
      });
    }, []);

    useEffect(function () { refresh(); }, []);

    useEffect(function () {
      if (tab !== 'kanban') return;
      var id = setInterval(refresh, 5000);
      return function () { clearInterval(id); };
    }, [tab, refresh]);

    var handleMove = useCallback(function (taskId, newStatus) {
      fetchJSON(API + '/kanban/tasks/' + taskId + '/move', {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
        headers: { 'Content-Type': 'application/json' },
      }).then(function () { refresh(); }).catch(function (err) {
        setState(function (p) { return Object.assign({}, p, { error: 'Move failed: ' + err.message }); });
      });
    }, [refresh]);

    return h('div', { style: s.page },
      h('div', { style: s.tabBar },
        h('div', { style: tab === 'kanban' ? s.tabActive : s.tab, onClick: function () { setTab('kanban'); } }, '📋 Kanban'),
        h('div', { style: tab === 'chat' ? s.tabActive : s.tab, onClick: function () { setTab('chat'); } }, '💬 Chat'),
        h('div', { style: tab === 'dashboard' ? s.tabActive : s.tab, onClick: function () { setTab('dashboard'); } }, '📊 Dashboard'),
        h('div', { style: tab === 'config' ? s.tabActive : s.tab, onClick: function () { setTab('config'); } }, '⚙ Config'),
      ),
      state.error ? h('div', { style: s.error },
        h('span', null, '⚠ ', state.error),
        h(comp.Button, { size: 'sm', variant: 'ghost', onClick: function () { setState(function (p) { return Object.assign({}, p, { error: null }); }); } }, '✕'),
      ) : null,
      tab === 'config' ? h(ConfigPanel, { onRefresh: refresh }) :
      tab === 'chat' ? h(ChatPanel, {
        nodes: state.nodes || [],
        currentNodeId: state.status && state.status.node_id ? state.status.node_id : '',
      }) :
      tab === 'kanban' ? h(KanbanBoard, {
        columns: state.kanban && state.kanban.columns ? state.kanban.columns : [],
        nodes: state.nodes || [],
        loading: state.loading && !state.kanban,
        onRefresh: refresh,
        onMove: handleMove,
      }) :
      h(DashboardView, { state: state }),
    );
  }

  // -----------------------------------------------------------------------
  // Register
  // -----------------------------------------------------------------------
  window.__HERMES_PLUGINS__.register('cluster-kanban', ClusterDashboard);
  console.log('[cluster-kanban] Dashboard plugin registered (Kanban CRUD v3)');
})();
