import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import { useToast } from "@/context/ToastContext";
import { EmptyState } from "./primitives";

export interface Column<T> {
  key: string;
  header: string;
  /** Raw value for sorting, searching and CSV export. */
  value: (row: T) => string | number | null;
  render?: (row: T) => ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  /** Excluded from the free-text search. */
  noSearch?: boolean;
  width?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  pageSize?: number;
  exportName?: string;
  onRowClick?: (row: T) => void;
  rowActionLabel?: (row: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyTitle?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
}

export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="search">
      <Search size={16} strokeWidth={1.75} aria-hidden="true" className="search__icon" />
      <input type="search" className="search__input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
      {value && (
        <button type="button" className="search__clear" onClick={() => onChange("")} aria-label="Clear search">
          <X size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

export function ExportButton<T>({ name, columns, rows, label = "Export CSV" }: { name: string; columns: { header: string; value: (r: T) => string | number | null }[]; rows: T[]; label?: string }) {
  const { notify } = useToast();
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      disabled={!rows.length}
      onClick={() => {
        downloadCsv(
          `${name}-demo`,
          columns.filter((c) => c.header),
          rows,
        );
        notify(`Exported ${rows.length} ${rows.length === 1 ? "row" : "rows"} of demo data`, "positive");
      }}
    >
      <Download size={14} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  );
}

export function DataTable<T>({ rows, columns, rowKey, caption, searchPlaceholder = "Search", searchable = true, pageSize = 10, exportName, onRowClick, rowActionLabel, initialSort, emptyTitle = "No matching rows", toolbar, footer }: Props<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) out = rows.filter((r) => columns.some((c) => !c.noSearch && String(c.value(r) ?? "").toLowerCase().includes(q)));
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const va = col.value(a);
          const vb = col.value(b);
          if (va === vb) return 0;
          if (va === null) return 1;
          if (vb === null) return -1;
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, columns, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) => (!s || s.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null));
  };

  return (
    <div className="table-wrap">
      {(searchable || exportName || toolbar) && (
        <div className="table-toolbar">
          {searchable && (
            <SearchInput
              value={query}
              onChange={(v) => {
                setQuery(v);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              label={`Search ${caption}`}
            />
          )}
          <div className="table-toolbar__right">
            {toolbar}
            {exportName && <ExportButton name={exportName} columns={columns} rows={filtered} />}
          </div>
        </div>
      )}
      <div className="table-scroll">
        <table className="table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const sortable = c.sortable !== false;
                return (
                  <th key={c.key} scope="col" className={c.align === "right" ? "is-right" : ""} style={{ width: c.width }} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {sortable ? (
                      <button type="button" className={`th-sort ${active ? "is-active" : ""}`} onClick={() => toggleSort(c.key)}>
                        {c.header}
                        {active ? sort!.dir === "asc" ? <ArrowUp size={12} strokeWidth={2} aria-hidden="true" /> : <ArrowDown size={12} strokeWidth={2} aria-hidden="true" /> : <ArrowUpDown size={12} strokeWidth={1.75} aria-hidden="true" className="th-sort__idle" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? "is-clickable" : ""}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick && rowActionLabel ? rowActionLabel(row) : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "is-right num" : ""}>
                    {c.render ? c.render(row) : (c.value(row) ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
        {!visible.length && <EmptyState title={emptyTitle} compact>{query ? "Try a different search term" : "Nothing to show for the selected filters"}</EmptyState>}
      </div>
      {filtered.length > pageSize && (
        <div className="pager">
          <span className="pager__info num">
            {current * pageSize + 1}–{Math.min(filtered.length, (current + 1) * pageSize)} of {filtered.length}
          </span>
          <div className="pager__btns">
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous page">
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Next page">
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
