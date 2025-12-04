/**
 * Bolt Fleet API Client
 * Handles OAuth authentication and API requests to Bolt Fleet Portal
 */

interface BoltTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface BoltDriver {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive' | 'pending';
}

interface BoltRide {
  id: string;
  driver_id: string;
  pickup_time: string;
  dropoff_time: string;
  pickup_address: string;
  dropoff_address: string;
  distance_km: number;
  duration_minutes: number;
  fare: number;
  commission: number;
  net_earnings: number;
  currency: string;
  status: 'completed' | 'cancelled' | 'in_progress';
}

interface BoltEarningsSummary {
  period: string;
  total_rides: number;
  total_fare: number;
  total_commission: number;
  net_earnings: number;
  currency: string;
  avg_fare_per_ride: number;
  total_distance_km: number;
  total_duration_hours: number;
}

interface BoltDailyReport {
  date: string;
  rides: number;
  gross_earnings: number;
  commission: number;
  net_earnings: number;
  bonuses: number;
  currency: string;
}

interface BoltWeeklyReport {
  week_start: string;
  week_end: string;
  total_rides: number;
  gross_earnings: number;
  commission: number;
  net_earnings: number;
  bonuses: number;
  currency: string;
  daily_breakdown: BoltDailyReport[];
}

// Token cache to avoid unnecessary auth requests
let cachedToken: { token: string; expiresAt: number } | null = null;

class BoltApiClient {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;

  constructor() {
    this.clientId = process.env.BOLT_CLIENT_ID || '';
    this.clientSecret = process.env.BOLT_CLIENT_SECRET || '';
    this.baseUrl = process.env.BOLT_API_BASE_URL || 'https://node.bolt.eu/fleet-owner/v1';

    if (!this.clientId || !this.clientSecret) {
      console.warn('Bolt API credentials not configured');
    }
  }

  /**
   * Get OAuth2 access token using client credentials
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (cachedToken && cachedToken.expiresAt > Date.now() + 300000) {
      return cachedToken.token;
    }

    try {
      const response = await fetch('https://node.bolt.eu/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: 'fleet.read reports.read',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Bolt OAuth failed: ${response.status} - ${error}`);
      }

      const data: BoltTokenResponse = await response.json();
      
      // Cache the token
      cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
      };

      return data.access_token;
    } catch (error) {
      console.error('Bolt authentication error:', error);
      throw error;
    }
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Bolt API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get daily earnings report
   */
  async getDailyReport(date: string): Promise<BoltDailyReport> {
    return this.request<BoltDailyReport>(`/reports/daily?date=${date}`);
  }

  /**
   * Get weekly earnings report
   */
  async getWeeklyReport(weekStart: string): Promise<BoltWeeklyReport> {
    return this.request<BoltWeeklyReport>(`/reports/weekly?week_start=${weekStart}`);
  }

  /**
   * Get earnings summary for a date range
   */
  async getEarningsSummary(startDate: string, endDate: string): Promise<BoltEarningsSummary> {
    return this.request<BoltEarningsSummary>(
      `/reports/earnings?start_date=${startDate}&end_date=${endDate}`
    );
  }

  /**
   * Get list of rides for a date range
   */
  async getRides(startDate: string, endDate: string, page = 1, limit = 50): Promise<{
    rides: BoltRide[];
    total: number;
    page: number;
    total_pages: number;
  }> {
    return this.request(
      `/rides?start_date=${startDate}&end_date=${endDate}&page=${page}&limit=${limit}`
    );
  }

  /**
   * Get fleet drivers
   */
  async getDrivers(): Promise<BoltDriver[]> {
    return this.request<BoltDriver[]>('/drivers');
  }

  /**
   * Check if credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }
}

// Export singleton instance
export const boltClient = new BoltApiClient();

// Export types
export type {
  BoltTokenResponse,
  BoltDriver,
  BoltRide,
  BoltEarningsSummary,
  BoltDailyReport,
  BoltWeeklyReport,
};
