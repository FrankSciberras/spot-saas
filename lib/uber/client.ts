/**
 * Uber Fleet API Client
 * Handles OAuth authentication and API requests to Uber Fleet/Partner API
 */

interface UberTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface UberDriver {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'pending';
  rating: number;
}

interface UberTrip {
  id: string;
  driver_id: string;
  request_time: string;
  start_time: string;
  end_time: string;
  pickup_address: string;
  dropoff_address: string;
  distance_miles: number;
  duration_minutes: number;
  fare: number;
  surge_multiplier: number;
  service_fee: number;
  net_earnings: number;
  currency: string;
  status: 'completed' | 'cancelled' | 'rider_cancelled';
  product_type: string; // UberX, UberXL, etc.
}

interface UberEarningsSummary {
  period: string;
  total_trips: number;
  total_fare: number;
  total_service_fee: number;
  net_earnings: number;
  currency: string;
  avg_fare_per_trip: number;
  total_distance_miles: number;
  total_duration_hours: number;
  tips: number;
  promotions: number;
}

interface UberDailyReport {
  date: string;
  trips: number;
  gross_earnings: number;
  service_fee: number;
  net_earnings: number;
  tips: number;
  promotions: number;
  currency: string;
}

interface UberWeeklyReport {
  week_start: string;
  week_end: string;
  total_trips: number;
  gross_earnings: number;
  service_fee: number;
  net_earnings: number;
  tips: number;
  promotions: number;
  currency: string;
  daily_breakdown: UberDailyReport[];
}

// Token cache to avoid unnecessary auth requests
let cachedToken: { token: string; expiresAt: number } | null = null;

class UberApiClient {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;

  constructor() {
    this.clientId = process.env.UBER_APP_ID || '';
    this.clientSecret = process.env.UBER_SECRET || '';
    this.baseUrl = process.env.UBER_API_BASE_URL || 'https://api.uber.com/v1';

    if (!this.clientId || !this.clientSecret) {
      console.warn('Uber API credentials not configured');
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
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await fetch('https://login.uber.com/oauth/v2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'fleet.read partner.payments partner.trips',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Uber OAuth failed: ${response.status} - ${error}`);
      }

      const data: UberTokenResponse = await response.json();
      
      // Cache the token
      cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
      };

      return data.access_token;
    } catch (error) {
      console.error('Uber authentication error:', error);
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
      throw new Error(`Uber API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get daily earnings report
   */
  async getDailyReport(date: string): Promise<UberDailyReport> {
    return this.request<UberDailyReport>(`/partners/payments/daily?date=${date}`);
  }

  /**
   * Get weekly earnings report
   */
  async getWeeklyReport(weekStart: string): Promise<UberWeeklyReport> {
    return this.request<UberWeeklyReport>(`/partners/payments/weekly?week_start=${weekStart}`);
  }

  /**
   * Get earnings summary for a date range
   */
  async getEarningsSummary(startDate: string, endDate: string): Promise<UberEarningsSummary> {
    return this.request<UberEarningsSummary>(
      `/partners/payments?start_date=${startDate}&end_date=${endDate}`
    );
  }

  /**
   * Get list of trips for a date range
   */
  async getTrips(startDate: string, endDate: string, page = 1, limit = 50): Promise<{
    trips: UberTrip[];
    total: number;
    page: number;
    total_pages: number;
  }> {
    return this.request(
      `/partners/trips?start_date=${startDate}&end_date=${endDate}&offset=${(page - 1) * limit}&limit=${limit}`
    );
  }

  /**
   * Get fleet drivers
   */
  async getDrivers(): Promise<UberDriver[]> {
    return this.request<UberDriver[]>('/partners/drivers');
  }

  /**
   * Check if credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }
}

// Export singleton instance
export const uberClient = new UberApiClient();

// Export types
export type {
  UberTokenResponse,
  UberDriver,
  UberTrip,
  UberEarningsSummary,
  UberDailyReport,
  UberWeeklyReport,
};
