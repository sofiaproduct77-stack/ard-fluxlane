/* Раздел «БД» в стиле phpMyAdmin */
(function () {
  const PMA_ROW_H = 19;
  const PMA_HEADER_H = 26;
  const PMA_BOX_W = 210;
  const PMA_COLS = 4;
  const PMA_GAP_X = 260;
  const PMA_GAP_Y = 28;

  let state = { tables: [], relations: [], storage: '', dialect: '', selectedTable: null };

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function nullLabel(v) {
    if (v === null || v === undefined) return '<span class="pma-null">Да</span>';
    return '<span class="pma-not-null">Нет</span>';
  }

  function keyIcons(col, tableName, relations) {
    const parts = [];
    if (col.primaryKey) parts.push('<span class="pma-ico pma-ico-pk" title="PRIMARY KEY">🔑</span>');
    const isFk =
      col.foreignKey ||
      relations.some((r) => r.toTable === tableName && r.toColumn === col.name);
    if (isFk) parts.push('<span class="pma-ico pma-ico-fk" title="FOREIGN KEY">🔗</span>');
    return parts.join(' ') || '—';
  }

  function bindTabs(root) {
    root.querySelectorAll('.pma-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-pma-tab');
        root.querySelectorAll('.pma-tab').forEach((b) => b.classList.toggle('active', b === btn));
        root.querySelectorAll('.pma-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
        if (tab === 'designer') {
          requestAnimationFrame(() => drawDesignerLines());
        }
      });
    });
  }

  function renderSidebar(nav, tables, onSelect) {
    nav.innerHTML = tables
      .map(
        (t) =>
          `<li><button type="button" class="pma-nav-item${state.selectedTable === t.tableName ? ' active' : ''}" data-table="${esc(t.tableName)}">
            <span class="pma-nav-name">${esc(t.tableName)}</span>
            <span class="pma-nav-rows">${t.count != null ? t.count.toLocaleString('ru-RU') : '?'}</span>
          </button></li>`,
      )
      .join('');
    nav.querySelectorAll('.pma-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedTable = btn.getAttribute('data-table');
        renderSidebar(nav, tables, onSelect);
        onSelect(state.selectedTable);
      });
    });
  }

  function renderDbOverview(pane, tables) {
    const totalRows = tables.reduce((s, t) => s + (Number(t.count) || 0), 0);
    const rows = tables
      .map(
        (t) => `<tr class="pma-row-link" data-table="${esc(t.tableName)}">
          <td><span class="pma-link">${esc(t.tableName)}</span></td>
          <td class="pma-num">${t.count != null ? t.count.toLocaleString('ru-RU') : '?'}</td>
          <td>${esc(t.engine)}</td>
          <td>${esc(t.collation)}</td>
          <td class="pma-num">${t.sizeKb != null ? `${t.sizeKb} КиБ` : '—'}</td>
          <td class="pma-num">${(t.columns || []).length}</td>
        </tr>`,
      )
      .join('');
    pane.innerHTML = `
      <fieldset class="pma-fieldset"><legend>Сводка</legend>
        <p>Таблиц: <strong>${tables.length}</strong> · Строк (сумма по COUNT): <strong>${totalRows.toLocaleString('ru-RU')}</strong></p>
      </fieldset>
      <div class="pma-table-wrap">
        <table class="pma-table pma-table-list">
          <thead><tr>
            <th>Таблица</th><th>Строк</th><th>Тип</th><th>Схема сравнения</th><th>Размер</th><th>Столбцов</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    pane.querySelectorAll('.pma-row-link').forEach((tr) => {
      tr.addEventListener('click', () => {
        state.selectedTable = tr.getAttribute('data-table');
        renderTableStructure(pane, tables.find((t) => t.tableName === state.selectedTable));
        const nav = document.getElementById('pma-table-nav');
        if (nav) renderSidebar(nav, tables, (name) => renderTableStructure(pane, tables.find((x) => x.tableName === name)));
      });
    });
  }

  function renderTableStructure(pane, table) {
    if (!table) {
      renderDbOverview(pane, state.tables);
      return;
    }
    const cols = table.columns || [];
    const body = cols
      .map(
        (c, i) => `<tr>
          <td class="pma-num">${i + 1}</td>
          <td><strong>${esc(c.name)}</strong></td>
          <td><code>${esc(c.type)}</code></td>
          <td>utf8mb4_unicode_ci</td>
          <td>—</td>
          <td>${nullLabel(c.allowNull)}</td>
          <td>${c.defaultValue != null ? esc(c.defaultValue) : '<i>NULL</i>'}</td>
          <td>—</td>
          <td>${esc(c.extra)}</td>
          <td>${keyIcons(c, table.tableName, state.relations)}</td>
        </tr>`,
      )
      .join('');
    pane.innerHTML = `
      <h3 class="pma-pane-title">Таблица: <code>${esc(table.tableName)}</code>
        <span class="pma-muted">(${esc(table.model)}, ${table.count != null ? table.count.toLocaleString('ru-RU') : '?'} строк)</span>
        <button type="button" class="pma-back" id="pma-back-list">← К списку таблиц</button>
      </h3>
      <div class="pma-table-wrap">
        <table class="pma-table pma-table-struct">
          <thead><tr>
            <th>#</th><th>Имя</th><th>Тип</th><th>Схема сравнения</th><th>Атрибуты</th><th>Null</th><th>По умолчанию</th><th>Комментарии</th><th>Дополнительно</th><th>Ключ</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    pane.querySelector('#pma-back-list')?.addEventListener('click', () => {
      state.selectedTable = null;
      renderDbOverview(pane, state.tables);
      const nav = document.getElementById('pma-table-nav');
      if (nav) renderSidebar(nav, state.tables, (name) => renderTableStructure(pane, state.tables.find((x) => x.tableName === name)));
    });
  }

  function boxHeight(table) {
    const n = (table.columns || []).length;
    return PMA_HEADER_H + n * PMA_ROW_H + 4;
  }

  function layoutBoxes(tables) {
    return tables.map((t, i) => {
      const col = i % PMA_COLS;
      const row = Math.floor(i / PMA_COLS);
      let y = PMA_GAP_Y;
      for (let r = 0; r < row; r++) {
        const idx = tables.slice(r * PMA_COLS, (r + 1) * PMA_COLS);
        const maxH = Math.max(...idx.map(boxHeight));
        y += maxH + PMA_GAP_Y;
      }
      return {
        table: t,
        x: PMA_GAP_Y + col * PMA_GAP_X,
        y,
        w: PMA_BOX_W,
        h: boxHeight(t),
      };
    });
  }

  function renderDesigner(canvas, tables, relations) {
    const boxes = layoutBoxes(tables);
    let maxY = 0;
    let maxX = 0;
    const html = boxes
      .map((b) => {
        maxY = Math.max(maxY, b.y + b.h);
        maxX = Math.max(maxX, b.x + b.w);
        const colRows = (b.table.columns || [])
          .map((c) => {
            const icons = [];
            if (c.primaryKey) icons.push('🔑');
            if (relations.some((r) => r.toTable === b.table.tableName && r.toColumn === c.name)) icons.push('🔗');
            return `<div class="pma-box-row" title="${esc(c.type)}"><span class="pma-box-col">${icons.join('')} ${esc(c.name)}</span></div>`;
          })
          .join('');
        return `<div class="pma-box" data-table="${esc(b.table.tableName)}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px">
          <div class="pma-box-head">${esc(b.table.tableName)}</div>
          <div class="pma-box-body">${colRows}</div>
        </div>`;
      })
      .join('');
    canvas.style.minWidth = `${maxX + PMA_GAP_Y}px`;
    canvas.style.minHeight = `${maxY + PMA_GAP_Y}px`;
    canvas.innerHTML = html;
    canvas._pmaBoxes = boxes;
    canvas._pmaRelations = relations;
  }

  function drawDesignerLines() {
    const canvas = document.getElementById('pma-designer-canvas');
    const svg = document.getElementById('pma-designer-svg');
    const wrap = canvas?.parentElement;
    if (!canvas || !svg || !wrap || !canvas._pmaBoxes) return;
    const wrapRect = wrap.getBoundingClientRect();
    svg.setAttribute('width', String(wrap.scrollWidth));
    svg.setAttribute('height', String(wrap.scrollHeight));
    svg.innerHTML = '';
    const relations = canvas._pmaRelations || [];
    const boxes = canvas._pmaBoxes;

    relations.forEach((rel, i) => {
      const parent = boxes.find((b) => b.table.tableName === rel.fromTable);
      const child = boxes.find((b) => b.table.tableName === rel.toTable);
      if (!parent || !child) return;
      const childColIdx = (child.table.columns || []).findIndex((c) => c.name === rel.toColumn);
      if (childColIdx < 0) return;
      const parentColIdx = (parent.table.columns || []).findIndex((c) => c.name === rel.fromColumn);
      const pIdx = parentColIdx >= 0 ? parentColIdx : 0;
      const x1 = parent.x + parent.w;
      const y1 = parent.y + PMA_HEADER_H + pIdx * PMA_ROW_H + PMA_ROW_H / 2;
      const x2 = child.x;
      const y2 = child.y + PMA_HEADER_H + childColIdx * PMA_ROW_H + PMA_ROW_H / 2;
      const mx = (x1 + x2) / 2;
      const path = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      svg.innerHTML += `<path class="pma-rel-line" d="${path}" data-i="${i}"/>`;
    });
  }

  function renderRelationsPane(pane, relations) {
    const rows = relations
      .map(
        (r) => `<tr>
          <td><code>${esc(r.fromTable)}</code>.<code>${esc(r.fromColumn)}</code></td>
          <td><code>${esc(r.toTable)}</code>.<code>${esc(r.toColumn)}</code></td>
          <td>${esc(r.label || 'FK')}</td>
        </tr>`,
      )
      .join('');
    pane.innerHTML = `
      <h3 class="pma-pane-title">Связи (внешние ключи и логические отношения Sequelize)</h3>
      <div class="pma-table-wrap">
        <table class="pma-table">
          <thead><tr><th>Источник (PK)</th><th>Цель (FK)</th><th>Тип</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="3">Нет связей</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  function renderSqlPane(pane, data) {
    const assoc = `// backend/models/index.js — основные связи
User.hasMany(News, { foreignKey: 'authorId', as: 'news' });
News.belongsTo(User, { foreignKey: 'authorId', as: 'author' });
User.hasMany(Document, { foreignKey: 'uploadedBy', as: 'documents' });
Document.belongsTo(User, { foreignKey: 'uploadedBy', as: 'uploader' });`;
    pane.innerHTML = `
      <h3 class="pma-pane-title">Подключение (аналог вкладки SQL в phpMyAdmin)</h3>
      <textarea class="pma-sql-area" readonly rows="14">${esc(data.configSnippet || '')}</textarea>
      <h3 class="pma-pane-title">Связи в коде Sequelize</h3>
      <textarea class="pma-sql-area" readonly rows="6">${assoc}</textarea>`;
  }

  async function renderDatabaseSection(apiBase) {
    const root = document.getElementById('pma-root');
    if (!root) return;

    let data = {};
    try {
      const res = await fetch(`${apiBase}/api/db/overview`, { cache: 'no-store' });
      data = res.ok ? await res.json() : {};
    } catch (e) {
      console.warn('[БД]', e);
    }

    const tables = Array.isArray(data.tables) ? data.tables : [];
    const relations = Array.isArray(data.relations) ? data.relations : [];
    state = { tables, relations, storage: data.storage, dialect: data.dialect, selectedTable: null };

    const crumb = document.getElementById('pma-breadcrumb');
    if (crumb) {
      crumb.innerHTML = `Сервер: <strong>${esc(data.serverLabel || data.dialect || '—')}</strong> » База данных: <strong>${esc(data.storage || '—')}</strong>`;
    }
    const meta = document.getElementById('pma-meta');
    if (meta) {
      const totalRows = tables.reduce((s, t) => s + (Number(t.count) || 0), 0);
      meta.textContent = `Таблиц: ${tables.length} · Строк: ${totalRows.toLocaleString('ru-RU')}`;
    }

    const nav = document.getElementById('pma-table-nav');
    const paneStruct = document.getElementById('pma-pane-structure');
    const paneDesigner = document.getElementById('pma-designer-canvas');
    const paneRel = document.getElementById('pma-pane-relations');
    const paneSql = document.getElementById('pma-pane-sql');

    if (!bindTabs._done) {
      bindTabs(root);
      bindTabs._done = true;
    }

    if (nav) {
      renderSidebar(nav, tables, (name) => {
        if (paneStruct) renderTableStructure(paneStruct, tables.find((t) => t.tableName === name));
      });
    }
    if (paneStruct) renderDbOverview(paneStruct, tables);
    if (paneDesigner) {
      renderDesigner(paneDesigner, tables, relations);
      requestAnimationFrame(() => drawDesignerLines());
    }
    if (paneRel) renderRelationsPane(paneRel, relations);
    if (paneSql) renderSqlPane(paneSql, data);

    window.addEventListener('resize', () => {
      if (root.querySelector('.pma-pane[data-pane="designer"]')?.classList.contains('active')) {
        drawDesignerLines();
      }
    });
  }

  window.FluxLaneAdminDbPanel = { renderDatabaseSection };
})();
