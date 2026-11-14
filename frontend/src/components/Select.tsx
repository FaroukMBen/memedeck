import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T | '';
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name, e.g. "Sort by" */
  label: string;
  /** Shown when value is '' */
  placeholder?: string;
  /** Open the menu above the button (for controls at the bottom of the screen) */
  placement?: 'bottom' | 'top';
  disabled?: boolean;
  className?: string;
}

/**
 * Styled replacement for a native <select>: the OS draws a native option list,
 * so it can't follow the theme. Keyboard: arrows / Home / End move, Enter or
 * Space picks, Escape closes.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder = 'Select…',
  placement = 'bottom',
  disabled = false,
  className = '',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const openMenu = () => {
    setActiveIndex(Math.max(selectedIndex, 0));
    setOpen(true);
  };

  const pick = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div className={`select ${open ? 'open' : ''} ${className}`} ref={rootRef}>
      <button
        type="button"
        className="select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${baseId}-list`}
        aria-label={label}
        aria-activedescendant={open ? `${baseId}-opt-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={`select-value ${selected ? '' : 'placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
      </button>

      {open && (
        <ul
          id={`${baseId}-list`}
          className={`select-menu ${placement}`}
          role="listbox"
          aria-label={label}
        >
          {options.length === 0 && <li className="select-empty">Nothing to choose from</li>}
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${baseId}-opt-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`select-option ${index === activeIndex ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              // mousedown keeps focus on the trigger, so the pick lands before blur
              onMouseDown={(e) => {
                e.preventDefault();
                pick(index);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
