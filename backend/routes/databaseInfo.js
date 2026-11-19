const express = require('express');
const { sequelize } = require('../models');
const { readFileSync } = require('fs');
const path = require('path');

const router = express.Router();

const LOGICAL_RELATIONS = [
  { fromTable: 'users', fromColumn: 'id', toTable: 'news', toColumn: 'author_id', label: '1 → N' },
  { fromTable: 'users', fromColumn: 'id', toTable: 'documents', toColumn: 'uploaded_by', label: '1 → N' },
  { fromTable: 'Detectors', fromColumn: 'id', toTable: 'Edges', toColumn: 'from_detector_id', label: '1 → N' },
  { fromTable: 'Detectors', fromColumn: 'id', toTable: 'Edges', toColumn: 'to_detector_id', label: '1 → N' },
  { fromTable: 'Detectors', fromColumn: 'id', toTable: 'VehiclePassages', toColumn: 'detector_id', label: '1 → N' },
];

function formatColumnType(def) {
  const t = def.type;
  if (!t) return 'unknown';
  const key = t.key || String(t);
  const len = t._length || t.options?.length;
  switch (key) {
    case 'STRING':
      return len ? `varchar(${len})` : 'varchar(255)';
    case 'TEXT':
      return 'text';
    case 'INTEGER':
      return 'int(11)';
    case 'BIGINT':
      return 'bigint(20)';
    case 'FLOAT':
    case 'DOUBLE':
      return 'double';
    case 'DECIMAL':
      return len ? `decimal(${len})` : 'decimal(10,2)';
    case 'BOOLEAN':
      return 'tinyint(1)';
    case 'DATE':
      return 'datetime';
    case 'DATEONLY':
      return 'date';
    case 'TIME':
      return 'time';
    case 'ENUM':
      return `enum(${(t.values || []).map((v) => `'${v}'`).join(',')})`;
    case 'JSON':
      return 'json';
    default:
      return key.toLowerCase();
  }
}

function columnFromAttr(attr, def) {
  const name = def.field || attr;
  let foreignKey = null;
  if (def.references) {
    const refModel = def.references.model || def.references.tableName;
    foreignKey = {
      table: typeof refModel === 'string' ? refModel : refModel?.tableName || String(refModel),
      column: def.references.key || 'id',
    };
  }
  const extra = [];
  if (def.autoIncrement) extra.push('auto_increment');
  if (def.primaryKey && !def.autoIncrement) extra.push('PRIMARY KEY');

  return {
    name,
    type: formatColumnType(def),
    allowNull: def.allowNull !== false,
    defaultValue:
      def.defaultValue === undefined || def.defaultValue === null
        ? null
        : typeof def.defaultValue === 'object'
          ? JSON.stringify(def.defaultValue)
          : String(def.defaultValue),
    primaryKey: Boolean(def.primaryKey),
    autoIncrement: Boolean(def.autoIncrement),
    foreignKey,
    extra: extra.join(', ') || '—',
  };
}

async function fetchMysqlTableMeta() {
  try {
    const [rows] = await sequelize.query(
      `SELECT TABLE_NAME AS tableName, ENGINE AS engine, TABLE_ROWS AS tableRows,
              DATA_LENGTH AS dataLength, TABLE_COLLATION AS collation
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()`
    );
    const map = {};
    for (const r of rows) map[r.tableName] = r;
    return map;
  } catch (_) {
    return {};
  }
}

async function fetchMysqlForeignKeys() {
  try {
    const [rows] = await sequelize.query(
      `SELECT TABLE_NAME AS fromTable, COLUMN_NAME AS fromColumn,
              REFERENCED_TABLE_NAME AS toTable, REFERENCED_COLUMN_NAME AS toColumn
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`
    );
    return rows.map((r) => ({ ...r, label: 'FK (MySQL)' }));
  } catch (_) {
    return [];
  }
}

router.get('/overview', async (req, res) => {
  try {
    const dialect = sequelize.getDialect();
    const storage =
      dialect === 'mysql'
        ? process.env.MYSQL_DATABASE || 'MySQL (см. .env)'
        : path.join(__dirname, '../../database.sqlite');

    const mysqlMeta = dialect === 'mysql' ? await fetchMysqlTableMeta() : {};
    const mysqlFks = dialect === 'mysql' ? await fetchMysqlForeignKeys() : [];

    const tables = [];
    for (const name of Object.keys(sequelize.models).sort()) {
      const M = sequelize.models[name];
      let count = null;
      try {
        count = await M.count();
      } catch (_) {}
      const columns = Object.entries(M.rawAttributes).map(([attr, def]) => columnFromAttr(attr, def));
      const meta = mysqlMeta[M.tableName] || {};
      const sizeKb = meta.dataLength != null ? Math.max(1, Math.round(Number(meta.dataLength) / 1024)) : null;

      tables.push({
        model: name,
        tableName: M.tableName,
        count,
        engine: meta.engine || (dialect === 'mysql' ? 'InnoDB' : 'SQLite'),
        collation: meta.collation || (dialect === 'mysql' ? 'utf8mb4_unicode_ci' : '—'),
        sizeKb,
        columns,
      });
    }

    const relations = [...LOGICAL_RELATIONS];
    for (const fk of mysqlFks) {
      const dup = relations.some(
        (r) => r.fromTable === fk.toTable && r.toTable === fk.fromTable && r.toColumn === fk.fromColumn
      );
      if (!dup) {
        relations.push({
          fromTable: fk.toTable,
          fromColumn: fk.toColumn,
          toTable: fk.fromTable,
          toColumn: fk.fromColumn,
          label: fk.label,
        });
      }
    }

    let configSnippet = '';
    try {
      const cfgPath = path.join(__dirname, '../config/database.js');
      const raw = readFileSync(cfgPath, 'utf8');
      configSnippet = raw.split('\n').slice(0, 40).join('\n');
    } catch (_) {}

    const associations = relations.map((r) => ({
      from: r.fromTable,
      to: r.toTable,
      cardinality: r.label || 'FK',
      field: `${r.toColumn} → ${r.fromTable}.${r.fromColumn}`,
    }));

    res.json({
      dialect,
      storage,
      serverLabel: dialect === 'mysql' ? 'MySQL / MariaDB' : 'SQLite',
      tables,
      relations,
      associations,
      configSnippet,
    });
  } catch (error) {
    console.error('database overview:', error);
    res.status(500).json({ error: 'Не удалось собрать сведения о БД' });
  }
});

module.exports = router;
