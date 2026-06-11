import { NextResponse } from 'next/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { boltClient } from '@/lib/bolt';

/**
 * GET /api/statistics/bolt
 * Fetch Bolt earnings data for the dashboard
 * Query params: period (daily|weekly|monthly), start_date, end_date
 */
export async function GET(request: Request) {
  // Auth check
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminOrStaff(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Check if Bolt is configured
  if (!boltClient.isConfigured()) {
    return NextResponse.json({ 
      error: 'Bolt API not configured',
      configured: false 
    }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'weekly';
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  try {
    // For now, return mock data structure that matches Bolt API
    // This will be replaced with real API calls once we confirm the exact endpoints
    const today = new Date();
    const mockData = generateMockBoltData(period, startDate, endDate, today);

    return NextResponse.json({
      success: true,
      configured: true,
      data: mockData,
    });
  } catch (error) {
    console.error('Bolt API error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch Bolt data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Seeded random number generator for consistent mock data
 * Same seed always produces the same sequence
 */
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/**
 * Generate mock data for development/testing
 * This simulates what the Bolt API would return
 */
function generateMockBoltData(
  period: string, 
  startDate: string | null, 
  endDate: string | null,
  today: Date
) {
  const currency = 'EUR';
  
  // Determine date range
  let rangeStart: Date;
  let rangeEnd: Date;
  
  if (period === 'custom' && startDate && endDate) {
    rangeStart = new Date(startDate);
    rangeEnd = new Date(endDate);
  } else {
    // Default to last 30 days
    rangeEnd = new Date(today);
    rangeStart = new Date(today);
    rangeStart.setDate(rangeStart.getDate() - 29);
  }
  
  // Calculate number of days in range
  const daysDiff = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  // Generate daily data for the date range
  const dailyData = [];
  for (let i = 0; i < daysDiff; i++) {
    const date = new Date(rangeStart);
    date.setDate(date.getDate() + i);
    
    // Use seeded random based on date for consistent data
    const dateSeed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    const random = seededRandom(dateSeed + 1); // +1 to differentiate from Uber
    
    // Randomize but keep realistic patterns (weekends have more rides)
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const baseRides = isWeekend ? 45 : 30;
    const rides = Math.floor(baseRides + random() * 20);
    const avgFare = 12 + random() * 8;
    const grossEarnings = rides * avgFare;
    const commission = grossEarnings * 0.20; // 20% Bolt commission
    const bonuses = random() > 0.7 ? Math.floor(random() * 50) : 0;
    
    dailyData.push({
      date: date.toISOString().split('T')[0],
      rides,
      gross_earnings: Math.round(grossEarnings * 100) / 100,
      commission: Math.round(commission * 100) / 100,
      net_earnings: Math.round((grossEarnings - commission + bonuses) * 100) / 100,
      bonuses,
      currency,
    });
  }

  // Calculate weekly aggregates
  const weeklyData = [];
  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - (w * 7) - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const weekDays = dailyData.filter(d => {
      const date = new Date(d.date);
      return date >= weekStart && date <= weekEnd;
    });

    if (weekDays.length > 0) {
      weeklyData.push({
        week_start: weekStart.toISOString().split('T')[0],
        week_end: weekEnd.toISOString().split('T')[0],
        total_rides: weekDays.reduce((sum, d) => sum + d.rides, 0),
        gross_earnings: Math.round(weekDays.reduce((sum, d) => sum + d.gross_earnings, 0) * 100) / 100,
        commission: Math.round(weekDays.reduce((sum, d) => sum + d.commission, 0) * 100) / 100,
        net_earnings: Math.round(weekDays.reduce((sum, d) => sum + d.net_earnings, 0) * 100) / 100,
        bonuses: weekDays.reduce((sum, d) => sum + d.bonuses, 0),
        currency,
      });
    }
  }

  // Calculate monthly aggregate
  const thisMonth = dailyData.filter(d => {
    const date = new Date(d.date);
    return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  });

  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthData = dailyData.filter(d => {
    const date = new Date(d.date);
    return date.getMonth() === lastMonth.getMonth() && date.getFullYear() === lastMonth.getFullYear();
  });

  // Summary stats
  const totalRides = dailyData.reduce((sum, d) => sum + d.rides, 0);
  const totalGross = dailyData.reduce((sum, d) => sum + d.gross_earnings, 0);
  const totalCommission = dailyData.reduce((sum, d) => sum + d.commission, 0);
  const totalNet = dailyData.reduce((sum, d) => sum + d.net_earnings, 0);
  const totalBonuses = dailyData.reduce((sum, d) => sum + d.bonuses, 0);
  const numDays = dailyData.length || 1;

  // Format period label
  const periodLabel = period === 'custom' && startDate && endDate
    ? `${startDate} to ${endDate}`
    : `${numDays} days`;

  return {
    summary: {
      period: periodLabel,
      total_rides: totalRides,
      gross_earnings: Math.round(totalGross * 100) / 100,
      commission: Math.round(totalCommission * 100) / 100,
      net_earnings: Math.round(totalNet * 100) / 100,
      bonuses: totalBonuses,
      avg_rides_per_day: Math.round(totalRides / numDays),
      avg_earnings_per_day: Math.round((totalNet / numDays) * 100) / 100,
      avg_earnings_per_ride: totalRides > 0 ? Math.round((totalNet / totalRides) * 100) / 100 : 0,
      currency,
    },
    this_month: {
      rides: thisMonth.reduce((sum, d) => sum + d.rides, 0),
      net_earnings: Math.round(thisMonth.reduce((sum, d) => sum + d.net_earnings, 0) * 100) / 100,
      currency,
    },
    last_month: {
      rides: lastMonthData.reduce((sum, d) => sum + d.rides, 0),
      net_earnings: Math.round(lastMonthData.reduce((sum, d) => sum + d.net_earnings, 0) * 100) / 100,
      currency,
    },
    daily: dailyData,
    weekly: weeklyData,
  };
}
