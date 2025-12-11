'use client';

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import styles from './DatePicker.module.css';

interface DatePickerProps {
  value: string; // ISO date string (YYYY-MM-DD)
  onChange: (date: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  className?: string;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Format date as YYYY-MM-DD without timezone conversion
function formatAsISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parse various date formats
function parseDate(input: string): Date | null {
  if (!input.trim()) return null;
  
  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  const euMatch = input.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (euMatch) {
    const date = new Date(parseInt(euMatch[3]), parseInt(euMatch[2]) - 1, parseInt(euMatch[1]));
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try MM/DD/YYYY or MM-DD-YYYY
  const usMatch = input.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usMatch) {
    const date = new Date(parseInt(usMatch[3]), parseInt(usMatch[1]) - 1, parseInt(usMatch[2]));
    if (!isNaN(date.getTime())) return date;
  }
  
  return null;
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date or type (DD/MM/YYYY)',
  minDate,
  maxDate,
  disabled = false,
  className = '',
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    return value ? new Date(value) : new Date();
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse the current value
  const selectedDate = value ? new Date(value) : null;

  // Sync input value with prop value when not typing
  useEffect(() => {
    if (!isTyping && value) {
      const date = new Date(value);
      setInputValue(date.toLocaleDateString('en-GB')); // DD/MM/YYYY format
    } else if (!isTyping && !value) {
      setInputValue('');
    }
  }, [value, isTyping]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Update view date when value changes
  useEffect(() => {
    if (value) {
      setViewDate(new Date(value));
    }
  }, [value]);

  // Get days in month
  const getDaysInMonth = useCallback((year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  }, []);

  // Get first day of month (0 = Sunday)
  const getFirstDayOfMonth = useCallback((year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  }, []);

  // Navigate months
  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Check if date is disabled
  const isDateDisabled = (date: Date) => {
    if (minDate && date < new Date(minDate)) return true;
    if (maxDate && date > new Date(maxDate)) return true;
    return false;
  };

  // Check if date is selected
  const isDateSelected = (date: Date) => {
    if (!selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Handle date selection
  const handleDateSelect = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    if (isDateDisabled(newDate)) return;
    
    const isoDate = formatAsISODate(newDate);
    onChange(isoDate);
    setIsOpen(false);
  };

  // Format display value
  const formatDisplayValue = () => {
    if (!selectedDate) return '';
    return selectedDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Generate calendar days
  const renderCalendarDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const daysInPrevMonth = getDaysInMonth(year, month - 1);

    const days: ReactNode[] = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      days.push(
        <button
          key={`prev-${day}`}
          type="button"
          className={`${styles.day} ${styles.otherMonth}`}
          disabled
        >
          {day}
        </button>
      );
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const disabled = isDateDisabled(date);
      const selected = isDateSelected(date);
      const today = isToday(date);

      days.push(
        <button
          key={day}
          type="button"
          className={`${styles.day} ${selected ? styles.selected : ''} ${today ? styles.today : ''} ${disabled ? styles.disabled : ''}`}
          onClick={() => handleDateSelect(day)}
          disabled={disabled}
        >
          {day}
        </button>
      );
    }

    // Next month days
    const remainingDays = 42 - days.length; // 6 rows * 7 days
    for (let day = 1; day <= remainingDays; day++) {
      days.push(
        <button
          key={`next-${day}`}
          type="button"
          className={`${styles.day} ${styles.otherMonth}`}
          disabled
        >
          {day}
        </button>
      );
    }

    return days;
  };

  // Quick actions
  const setToday = () => {
    const today = new Date();
    const isoDate = formatAsISODate(today);
    onChange(isoDate);
    setViewDate(today);
    setIsTyping(false);
    setIsOpen(false);
  };

  const clearDate = () => {
    onChange('');
    setInputValue('');
    setIsTyping(false);
    setIsOpen(false);
  };

  // Handle text input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setIsTyping(true);
    
    // Try to parse the date
    const parsed = parseDate(val);
    if (parsed) {
      const isoDate = formatAsISODate(parsed);
      onChange(isoDate);
      setViewDate(parsed);
    }
  };

  // Handle input blur
  const handleInputBlur = () => {
    setIsTyping(false);
    // If we have a valid value, format it properly
    if (value) {
      const date = new Date(value);
      setInputValue(date.toLocaleDateString('en-GB'));
    } else if (inputValue) {
      // Invalid input, clear it
      setInputValue('');
    }
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Enter') {
      const parsed = parseDate(inputValue);
      if (parsed) {
        const isoDate = formatAsISODate(parsed);
        onChange(isoDate);
        setViewDate(parsed);
        setIsOpen(false);
      }
    }
  };

  return (
    <div ref={containerRef} className={`${styles.container} ${className}`}>
      {/* Input Field */}
      <div className={`${styles.inputWrapper} ${isOpen ? styles.focused : ''} ${disabled ? styles.disabled : ''}`}>
        <span className={styles.icon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          className={styles.textInput}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          className={`${styles.chevron} ${isOpen ? styles.open : ''}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          tabIndex={-1}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div className={styles.dropdown}>
          {/* Header */}
          <div className={styles.header}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={prevMonth}
              aria-label="Previous month"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className={styles.monthYearSelectors}>
              <select
                value={viewDate.getMonth()}
                onChange={(e) => setViewDate(new Date(viewDate.getFullYear(), parseInt(e.target.value), 1))}
                className={styles.monthSelect}
              >
                {MONTHS.map((month, idx) => (
                  <option key={month} value={idx}>{month}</option>
                ))}
              </select>
              <select
                value={viewDate.getFullYear()}
                onChange={(e) => setViewDate(new Date(parseInt(e.target.value), viewDate.getMonth(), 1))}
                className={styles.yearSelect}
              >
                {Array.from({ length: 50 }, (_, i) => new Date().getFullYear() - 10 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={styles.navBtn}
              onClick={nextMonth}
              aria-label="Next month"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Day Names */}
          <div className={styles.dayNames}>
            {DAYS.map(day => (
              <span key={day} className={styles.dayName}>{day}</span>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className={styles.grid}>
            {renderCalendarDays()}
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.footerBtn}
              onClick={clearDate}
            >
              Clear
            </button>
            <button
              type="button"
              className={`${styles.footerBtn} ${styles.primary}`}
              onClick={setToday}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
