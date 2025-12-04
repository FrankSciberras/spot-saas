"use client";

import { useState, useEffect } from 'react';
import styles from './StatisticsDashboard.module.css';

interface DailyData {
  date: string;
  rides?: number;
  trips?: number;
  gross_earnings: number;
  commission?: number;
  service_fee?: number;
  net_earnings: number;
  bonuses?: number;
  tips?: number;
  promotions?: number;
  currency: string;
}

interface WeeklyData {
  week_start: string;
  week_end: string;
  total_rides?: number;
  total_trips?: number;
  gross_earnings: number;
  commission?: number;
  service_fee?: number;
  net_earnings: number;
  bonuses?: number;
  tips?: number;
  promotions?: number;
  currency: string;
}

interface PlatformData {
  summary: {
    period: string;
    total_rides?: number;
    total_trips?: number;
    gross_earnings: number;
    commission?: number;
    service_fee?: number;
    net_earnings: number;
    bonuses?: number;
    tips?: number;
    promotions?: number;
    avg_rides_per_day?: number;
    avg_trips_per_day?: number;
    avg_earnings_per_day: number;
    avg_earnings_per_ride?: number;
    avg_earnings_per_trip?: number;
    currency: string;
  };
  this_month: {
    rides?: number;
    trips?: number;
    net_earnings: number;
    currency: string;
  };
  last_month: {
    rides?: number;
    trips?: number;
    net_earnings: number;
    currency: string;
  };
  daily: DailyData[];
  weekly: WeeklyData[];
}

type TimePeriod = 'daily' | 'weekly' | 'monthly' | 'custom';
type Platform = 'bolt' | 'uber';

// Outlined SVG Icons
const TrendUpIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 6l-9.5 9.5-5-5L1 18" />
    <path d="M17 6h6v6" />
  </svg>
);

const TrendDownIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 18l-9.5-9.5-5 5L1 6" />
    <path d="M17 18h6v-6" />
  </svg>
);

const CarIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="7" rx="2.5" />
    <circle cx="8" cy="17" r="1.6" />
    <circle cx="16" cy="17" r="1.6" />
  </svg>
);

const MoneyIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="6" width="16" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.3" />
  </svg>
);

const ChartIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 17v-4M12 17V9M17 17v-6" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="15" rx="2.5" />
    <path d="M9 3v4M15 3v4M4 10h16" />
  </svg>
);

const BoltIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const UberIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 12h8M12 8v8" />
  </svg>
);

// Helper to get date string in YYYY-MM-DD format
const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export default function StatisticsDashboard() {
  const [platformData, setPlatformData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('daily');
  const [activePlatform, setActivePlatform] = useState<Platform>('bolt');
  const [platformConfigured, setPlatformConfigured] = useState({ bolt: true, uber: true });
  
  // Custom date range state
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return formatDateForInput(date);
  });
  const [endDate, setEndDate] = useState<string>(() => formatDateForInput(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    fetchPlatformData(activePlatform);
  }, [activePlatform]);

  const fetchPlatformData = async (platform: Platform, customStart?: string, customEnd?: string) => {
    try {
      setLoading(true);
      let url = `/api/statistics/${platform}?period=weekly`;
      
      if (customStart && customEnd) {
        url = `/api/statistics/${platform}?period=custom&start_date=${customStart}&end_date=${customEnd}`;
      }
      
      const response = await fetch(url);
      const result = await response.json();

      if (result.configured === false) {
        setPlatformConfigured(prev => ({ ...prev, [platform]: false }));
        setError(`${platform.charAt(0).toUpperCase() + platform.slice(1)} API not configured`);
      } else if (result.success) {
        setPlatformData(result.data);
        setError(null);
      } else {
        setError(result.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const getPercentChange = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  // Calculate max value for chart scaling
  const getMaxValue = (data: DailyData[] | WeeklyData[], key: 'net_earnings' | 'rides') => {
    if (!data || data.length === 0) return 100;
    const values = data.map(d => {
      if (key === 'rides') {
        // Handle both Bolt (rides/total_rides) and Uber (trips/total_trips)
        return (d as WeeklyData).total_rides ?? (d as WeeklyData).total_trips ?? 
               (d as DailyData).rides ?? (d as DailyData).trips ?? 0;
      }
      return d.net_earnings;
    });
    return Math.max(...values) * 1.1; // Add 10% padding
  };

  // Helper to get ride/trip count (handles both Bolt and Uber terminology)
  const getRideCount = (data: { rides?: number; trips?: number; total_rides?: number; total_trips?: number }) => {
    return data.rides ?? data.trips ?? data.total_rides ?? data.total_trips ?? 0;
  };

  // Helper to get fee amount (commission for Bolt, service_fee for Uber)
  const getFee = (data: { commission?: number; service_fee?: number }) => {
    return data.commission ?? data.service_fee ?? 0;
  };

  // Helper to get bonus amount (bonuses for Bolt, tips+promotions for Uber)
  const getBonus = (data: { bonuses?: number; tips?: number; promotions?: number }) => {
    return (data.bonuses ?? 0) + (data.tips ?? 0) + (data.promotions ?? 0);
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading statistics...</p>
      </div>
    );
  }

  const monthChange = platformData 
    ? getPercentChange(platformData.this_month.net_earnings, platformData.last_month.net_earnings)
    : 0;

  return (
    <div className={styles.dashboard}>
      {/* Header with Platform Tabs */}
      <div className={styles.header}>
        <div className={styles.platformTabs}>
          <button 
            className={`${styles.platformTab} ${activePlatform === 'bolt' ? styles.active : ''}`}
            onClick={() => setActivePlatform('bolt')}
          >
            <BoltIcon />
            <span>Bolt</span>
          </button>
          <button 
            className={`${styles.platformTab} ${activePlatform === 'uber' ? styles.active : ''}`}
            onClick={() => setActivePlatform('uber')}
          >
            <UberIcon />
            <span>Uber</span>
          </button>
        </div>

        <div className={styles.periodSelector}>
          <button 
            className={`${styles.periodBtn} ${timePeriod === 'daily' ? styles.active : ''}`}
            onClick={() => { setTimePeriod('daily'); setShowDatePicker(false); }}
          >
            Daily
          </button>
          <button 
            className={`${styles.periodBtn} ${timePeriod === 'weekly' ? styles.active : ''}`}
            onClick={() => { setTimePeriod('weekly'); setShowDatePicker(false); }}
          >
            Weekly
          </button>
          <button 
            className={`${styles.periodBtn} ${timePeriod === 'monthly' ? styles.active : ''}`}
            onClick={() => { setTimePeriod('monthly'); setShowDatePicker(false); }}
          >
            Monthly
          </button>
          <button 
            className={`${styles.periodBtn} ${timePeriod === 'custom' ? styles.active : ''}`}
            onClick={() => { setTimePeriod('custom'); setShowDatePicker(true); }}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {showDatePicker && (
        <div className={styles.datePickerRow}>
          <div className={styles.datePickerGroup}>
            <label htmlFor="startDate">From</label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              max={endDate}
              className={styles.dateInput}
            />
          </div>
          <div className={styles.datePickerGroup}>
            <label htmlFor="endDate">To</label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              max={formatDateForInput(new Date())}
              className={styles.dateInput}
            />
          </div>
          <button 
            className={styles.applyDateBtn}
            onClick={() => fetchPlatformData(activePlatform, startDate, endDate)}
          >
            Apply
          </button>
        </div>
      )}

      {!platformConfigured[activePlatform] && (
        <div className={styles.configWarning}>
          {activePlatform === 'bolt' ? <BoltIcon /> : <UberIcon />}
          <div>
            <h3>{activePlatform === 'bolt' ? 'Bolt' : 'Uber'} API Not Configured</h3>
            <p>Add your {activePlatform === 'bolt' ? 'Bolt' : 'Uber'} API credentials to <code>.env.local</code> to see real data.</p>
          </div>
        </div>
      )}

      {error && platformConfigured[activePlatform] && (
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={() => fetchPlatformData(activePlatform)}>Retry</button>
        </div>
      )}

      {platformData && (
        <>
          {/* Summary Stats Cards */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <MoneyIcon />
              </div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>
                  {formatCurrency(platformData.summary.net_earnings, platformData.summary.currency)}
                </span>
                <span className={styles.statLabel}>Total Earnings ({platformData.summary.period})</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <CarIcon />
              </div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>{getRideCount(platformData.summary)}</span>
                <span className={styles.statLabel}>Total {activePlatform === 'uber' ? 'Trips' : 'Rides'}</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <ChartIcon />
              </div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>
                  {formatCurrency(platformData.summary.avg_earnings_per_day, platformData.summary.currency)}
                </span>
                <span className={styles.statLabel}>Avg. Daily Earnings</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${monthChange >= 0 ? styles.positive : styles.negative}`}>
                {monthChange >= 0 ? <TrendUpIcon /> : <TrendDownIcon />}
              </div>
              <div className={styles.statContent}>
                <span className={`${styles.statValue} ${monthChange >= 0 ? styles.positive : styles.negative}`}>
                  {monthChange >= 0 ? '+' : ''}{monthChange}%
                </span>
                <span className={styles.statLabel}>vs. Last Month</span>
              </div>
            </div>
          </div>

          {/* This Month vs Last Month Comparison */}
          <div className={styles.comparisonRow}>
            <div className={styles.comparisonCard}>
              <div className={styles.comparisonHeader}>
                <CalendarIcon />
                <h3>This Month</h3>
              </div>
              <div className={styles.comparisonStats}>
                <div className={styles.comparisonStat}>
                  <span className={styles.comparisonValue}>
                    {formatCurrency(platformData.this_month.net_earnings, platformData.this_month.currency)}
                  </span>
                  <span className={styles.comparisonLabel}>Net Earnings</span>
                </div>
                <div className={styles.comparisonStat}>
                  <span className={styles.comparisonValue}>{getRideCount(platformData.this_month)}</span>
                  <span className={styles.comparisonLabel}>{activePlatform === 'uber' ? 'Trips' : 'Rides'}</span>
                </div>
              </div>
            </div>

            <div className={styles.comparisonCard}>
              <div className={styles.comparisonHeader}>
                <CalendarIcon />
                <h3>Last Month</h3>
              </div>
              <div className={styles.comparisonStats}>
                <div className={styles.comparisonStat}>
                  <span className={styles.comparisonValue}>
                    {formatCurrency(platformData.last_month.net_earnings, platformData.last_month.currency)}
                  </span>
                  <span className={styles.comparisonLabel}>Net Earnings</span>
                </div>
                <div className={styles.comparisonStat}>
                  <span className={styles.comparisonValue}>{getRideCount(platformData.last_month)}</span>
                  <span className={styles.comparisonLabel}>{activePlatform === 'uber' ? 'Trips' : 'Rides'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Earnings Chart */}
          <div className={styles.chartSection}>
            <div className={styles.chartHeader}>
              <h3>Earnings Overview</h3>
              <div className={styles.chartLegend}>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: 'var(--color-primary)' }}></span>
                  Net Earnings
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: 'var(--color-secondary)' }}></span>
                  Rides
                </span>
              </div>
            </div>

            <div className={styles.chart}>
              {timePeriod === 'daily' && platformData.daily && (
                <div className={styles.barChart}>
                  {platformData.daily.slice(-14).map((day, index) => {
                    const maxEarnings = getMaxValue(platformData.daily.slice(-14), 'net_earnings');
                    const heightPercent = (day.net_earnings / maxEarnings) * 100;
                    
                    return (
                      <div key={day.date} className={styles.barGroup}>
                        <div 
                          className={styles.bar}
                          style={{ height: `${heightPercent}%` }}
                          title={`${formatDate(day.date)}: ${formatCurrency(day.net_earnings, day.currency)}`}
                        >
                          <span className={styles.barTooltip}>
                            {formatCurrency(day.net_earnings, day.currency)}
                          </span>
                        </div>
                        <span className={styles.barLabel}>{formatDate(day.date)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {timePeriod === 'weekly' && platformData.weekly && (
                <div className={styles.barChart}>
                  {platformData.weekly.map((week, index) => {
                    const maxEarnings = getMaxValue(platformData.weekly, 'net_earnings');
                    const heightPercent = (week.net_earnings / maxEarnings) * 100;
                    
                    return (
                      <div key={week.week_start} className={styles.barGroup}>
                        <div 
                          className={styles.bar}
                          style={{ height: `${heightPercent}%` }}
                          title={`Week of ${formatDate(week.week_start)}: ${formatCurrency(week.net_earnings, week.currency)}`}
                        >
                          <span className={styles.barTooltip}>
                            {formatCurrency(week.net_earnings, week.currency)}
                          </span>
                        </div>
                        <span className={styles.barLabel}>
                          {formatDate(week.week_start)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {timePeriod === 'monthly' && (
                <div className={styles.monthlyStats}>
                  <div className={styles.monthlyCard}>
                    <h4>Current Month</h4>
                    <div className={styles.monthlyValue}>
                      {formatCurrency(platformData.this_month.net_earnings, platformData.this_month.currency)}
                    </div>
                    <div className={styles.monthlyRides}>{getRideCount(platformData.this_month)} {activePlatform === 'uber' ? 'trips' : 'rides'}</div>
                  </div>
                  <div className={styles.monthlyCard}>
                    <h4>Previous Month</h4>
                    <div className={styles.monthlyValue}>
                      {formatCurrency(platformData.last_month.net_earnings, platformData.last_month.currency)}
                    </div>
                    <div className={styles.monthlyRides}>{getRideCount(platformData.last_month)} {activePlatform === 'uber' ? 'trips' : 'rides'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Detailed Table */}
          <div className={styles.tableSection}>
            <h3>
              {timePeriod === 'daily' ? 'Daily Breakdown' : 
               timePeriod === 'weekly' ? 'Weekly Breakdown' : 'Monthly Summary'}
            </h3>
            
            {timePeriod === 'daily' && (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>{activePlatform === 'uber' ? 'Trips' : 'Rides'}</th>
                      <th>Gross</th>
                      <th>{activePlatform === 'uber' ? 'Fees' : 'Commission'}</th>
                      <th>{activePlatform === 'uber' ? 'Tips/Promos' : 'Bonuses'}</th>
                      <th>Net Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformData.daily.slice().reverse().slice(0, 14).map(day => (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td>{getRideCount(day)}</td>
                        <td>{formatCurrency(day.gross_earnings, day.currency)}</td>
                        <td className={styles.negative}>-{formatCurrency(getFee(day), day.currency)}</td>
                        <td className={styles.positive}>
                          {getBonus(day) > 0 ? `+${formatCurrency(getBonus(day), day.currency)}` : '-'}
                        </td>
                        <td className={styles.highlight}>{formatCurrency(day.net_earnings, day.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {timePeriod === 'weekly' && (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>{activePlatform === 'uber' ? 'Trips' : 'Rides'}</th>
                      <th>Gross</th>
                      <th>{activePlatform === 'uber' ? 'Fees' : 'Commission'}</th>
                      <th>{activePlatform === 'uber' ? 'Tips/Promos' : 'Bonuses'}</th>
                      <th>Net Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformData.weekly.map(week => (
                      <tr key={week.week_start}>
                        <td>{formatDate(week.week_start)} - {formatDate(week.week_end)}</td>
                        <td>{getRideCount(week)}</td>
                        <td>{formatCurrency(week.gross_earnings, week.currency)}</td>
                        <td className={styles.negative}>-{formatCurrency(getFee(week), week.currency)}</td>
                        <td className={styles.positive}>
                          {getBonus(week) > 0 ? `+${formatCurrency(getBonus(week), week.currency)}` : '-'}
                        </td>
                        <td className={styles.highlight}>{formatCurrency(week.net_earnings, week.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className={styles.quickStats}>
            <div className={styles.quickStat}>
              <span className={styles.quickStatLabel}>Avg. per {activePlatform === 'uber' ? 'Trip' : 'Ride'}</span>
              <span className={styles.quickStatValue}>
                {formatCurrency(platformData.summary.avg_earnings_per_ride ?? platformData.summary.avg_earnings_per_trip ?? 0, platformData.summary.currency)}
              </span>
            </div>
            <div className={styles.quickStat}>
              <span className={styles.quickStatLabel}>Avg. {activePlatform === 'uber' ? 'Trips' : 'Rides'}/Day</span>
              <span className={styles.quickStatValue}>{platformData.summary.avg_rides_per_day ?? platformData.summary.avg_trips_per_day ?? 0}</span>
            </div>
            <div className={styles.quickStat}>
              <span className={styles.quickStatLabel}>{activePlatform === 'uber' ? 'Total Tips' : 'Total Bonuses'}</span>
              <span className={styles.quickStatValue}>
                {formatCurrency(getBonus(platformData.summary), platformData.summary.currency)}
              </span>
            </div>
            <div className={styles.quickStat}>
              <span className={styles.quickStatLabel}>{activePlatform === 'uber' ? 'Fees Paid' : 'Commission Paid'}</span>
              <span className={styles.quickStatValue}>
                {formatCurrency(getFee(platformData.summary), platformData.summary.currency)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
