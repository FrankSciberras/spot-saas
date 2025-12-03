/**
 * Events Service - Gozo Events API Integration (Future)
 * 
 * This service is designed to integrate with the Gozo Events API.
 * Currently stubbed with mock data. Replace with actual API calls when ready.
 * 
 * EXTENSION POINT: Update the fetchEvents function to call the real Gozo API
 */

// =============================================================================
// Types for Gozo Events API
// =============================================================================

export interface GozoEvent {
  id: string;
  externalEventId: string;
  title: string;
  description: string;
  location: string;
  eventDate: Date;
  endDate?: Date;
  category: string;
  rawJson?: Record<string, unknown>;
}

export interface GozoEventsResponse {
  events: GozoEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GozoEventFilters {
  startDate?: Date;
  endDate?: Date;
  category?: string;
  location?: string;
  page?: number;
  pageSize?: number;
}

// =============================================================================
// Mock Data (Replace with actual API calls)
// =============================================================================

const MOCK_EVENTS: GozoEvent[] = [
  {
    id: '1',
    externalEventId: 'gozo-evt-001',
    title: 'Gozo Carnival',
    description: 'Annual carnival celebration in Victoria',
    location: 'Victoria, Gozo',
    eventDate: new Date('2024-02-10'),
    endDate: new Date('2024-02-14'),
    category: 'Festival',
  },
  {
    id: '2',
    externalEventId: 'gozo-evt-002',
    title: 'Easter Processions',
    description: 'Traditional Easter processions across Gozo villages',
    location: 'Various locations, Gozo',
    eventDate: new Date('2024-03-29'),
    endDate: new Date('2024-03-31'),
    category: 'Religious',
  },
  {
    id: '3',
    externalEventId: 'gozo-evt-003',
    title: 'Gozo Music Festival',
    description: 'Live music performances at the Citadel',
    location: 'Citadel, Victoria',
    eventDate: new Date('2024-07-15'),
    endDate: new Date('2024-07-17'),
    category: 'Music',
  },
];

// =============================================================================
// Service Functions
// =============================================================================

/**
 * Fetch events from Gozo Events API
 * 
 * TODO: Replace mock implementation with actual API call
 * Example:
 * ```
 * const response = await fetch(`${GOZO_API_URL}/events`, {
 *   headers: { 'Authorization': `Bearer ${GOZO_API_KEY}` }
 * });
 * const data = await response.json();
 * return transformGozoResponse(data);
 * ```
 */
export async function fetchEvents(
  filters?: GozoEventFilters
): Promise<GozoEventsResponse> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  let events = [...MOCK_EVENTS];

  // Apply filters
  if (filters?.startDate) {
    events = events.filter((e) => e.eventDate >= filters.startDate!);
  }
  if (filters?.endDate) {
    events = events.filter((e) => e.eventDate <= filters.endDate!);
  }
  if (filters?.category) {
    events = events.filter((e) => e.category === filters.category);
  }
  if (filters?.location) {
    events = events.filter((e) =>
      e.location.toLowerCase().includes(filters.location!.toLowerCase())
    );
  }

  // Pagination
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 10;
  const start = (page - 1) * pageSize;
  const paginatedEvents = events.slice(start, start + pageSize);

  return {
    events: paginatedEvents,
    total: events.length,
    page,
    pageSize,
  };
}

/**
 * Fetch a single event by ID
 */
export async function fetchEventById(id: string): Promise<GozoEvent | null> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return MOCK_EVENTS.find((e) => e.id === id || e.externalEventId === id) || null;
}

/**
 * Sync events from Gozo API to local database
 * 
 * TODO: Implement actual sync logic
 * This should:
 * 1. Fetch events from Gozo API
 * 2. Transform to local format
 * 3. Upsert into Supabase events table
 */
export async function syncEventsFromApi(): Promise<{
  added: number;
  updated: number;
  errors: string[];
}> {
  console.log('syncEventsFromApi: Not yet implemented');
  
  // Placeholder return
  return {
    added: 0,
    updated: 0,
    errors: ['Gozo API integration not yet configured'],
  };
}

/**
 * Transform raw Gozo API response to our event format
 * 
 * TODO: Update when actual API schema is known
 */
export function transformGozoEvent(rawEvent: Record<string, unknown>): GozoEvent {
  return {
    id: String(rawEvent.id || ''),
    externalEventId: String(rawEvent.external_id || rawEvent.id || ''),
    title: String(rawEvent.title || rawEvent.name || ''),
    description: String(rawEvent.description || ''),
    location: String(rawEvent.location || rawEvent.venue || ''),
    eventDate: new Date(String(rawEvent.date || rawEvent.start_date || '')),
    endDate: rawEvent.end_date ? new Date(String(rawEvent.end_date)) : undefined,
    category: String(rawEvent.category || rawEvent.type || 'Other'),
    rawJson: rawEvent,
  };
}
