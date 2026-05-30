import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

// ─── Baseline category list ────────────────────────────────────────────────────
// These seed the dropdown. Users can still type anything custom — the final
// string is forwarded to the backend exactly as typed/selected.
const CATEGORY_SUGGESTIONS = [
  'pharmacy',
  'fitness centre',
  'cafe',
  'auto repair',
  'boutique',
  'restaurant',
  'grocery store',
  'salon',
  'bakery',
  'electronics shop',
  'supermarket',
  'clothing store',
  'bookshop',
  'hardware store',
  'jewellery shop',
  'pet shop',
  'florist',
  'optician',
  'laundry',
  'hotel',
];

/**
 * CategoryCombobox
 *
 * Props:
 *  - value        {string}   Controlled value from parent
 *  - onChange     {fn}       Called with the new string whenever the value changes
 *  - placeholder  {string}   Input placeholder text
 *  - disabled     {boolean}  Whether the field is interactive
 */
export default function CategoryCombobox({
  value,
  onChange,
  placeholder = 'Category (type or choose\u2026)',
  disabled = false,
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState(value || '');
  const containerRef      = useRef(null);

  // Keep local query in sync if the parent resets the value (e.g. mode switch)
  useEffect(() => { setQuery(value || ''); }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filtered =
    query.trim().length === 0
      ? CATEGORY_SUGGESTIONS
      : CATEGORY_SUGGESTIONS.filter((c) =>
          c.toLowerCase().includes(query.trim().toLowerCase())
        );

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val); // forward raw text to parent immediately
    setOpen(true);
  };

  const handleSelect = (suggestion) => {
    setQuery(suggestion);
    onChange(suggestion);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter' && filtered.length === 1) {
      e.preventDefault();
      handleSelect(filtered[0]);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div
        className={[
          'flex items-center border bg-white transition-all',
          open
            ? 'border-blue-600 ring-1 ring-blue-600'
            : 'border-slate-300 hover:border-slate-400',
          disabled ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
      >
        <div className="pl-3 text-slate-400 flex-shrink-0">
          <Search size={16} />
        </div>
        <input
          id="category-combobox"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="w-full px-2 py-2 bg-transparent text-sm outline-none text-slate-900 placeholder:text-slate-400"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((o) => !o)}
          className="pr-3 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
          aria-label="Toggle category list"
        >
          <ChevronDown
            size={16}
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* ── Floating dropdown ──────────────────────────────────────────────── */}
      {open && (
        <ul
          role="listbox"
          aria-label="Category suggestions"
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-lg max-h-56 overflow-y-auto text-sm"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-2.5 text-slate-400 italic select-none">
              No matches &mdash; your custom term will be used
            </li>
          ) : (
            filtered.map((suggestion) => (
              <li
                key={suggestion}
                role="option"
                aria-selected={suggestion === query}
                onMouseDown={(e) => {
                  // mousedown fires before input blur, so the click registers
                  // correctly before the dropdown is hidden by the blur handler.
                  e.preventDefault();
                  handleSelect(suggestion);
                }}
                className={[
                  'px-4 py-2.5 cursor-pointer capitalize transition-colors',
                  suggestion === query
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                {suggestion}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
