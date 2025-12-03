# SPOT Dashboard - Cab Fleet Management System

A comprehensive Next.js 14 application for managing a taxi/cab fleet. Built with TypeScript, Supabase (auth + database), and CSS modules.

## Features

### Current Features
- **Role-Based Access Control**: Admin, Staff, and Driver roles with different permissions
- **Driver Management**: CRUD operations for drivers with document tracking
- **Vehicle Management**: CRUD operations for vehicles with maintenance tracking
- **Go Online System**: Drivers can start shifts with vehicle photos and mileage recording
- **Document Expiry Tracking**: Automatic highlighting of expiring documents (ID, license, insurance)
- **Responsive Dashboard**: Modern, clean UI using CSS modules (no Tailwind)

### Future Features (Stubs Included)
- **Earnings & Payslips**: Track driver earnings and generate payslips
- **Gozo Events API**: Integration with external events API
- **Push Notifications**: Send notifications to drivers
- **Chat System**: Real-time messaging between admin and drivers

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: CSS Modules (no Tailwind)
- **Backend**: Next.js API Routes, Server Components
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (for shift images)

## Project Structure

```
spot-dashboard/
├── app/
│   ├── admin/                 # Admin dashboard pages
│   │   ├── drivers/           # Driver management
│   │   ├── vehicles/          # Vehicle management
│   │   └── shifts/            # Shift records
│   ├── driver/                # Driver portal pages
│   │   ├── go-online/         # Go online form
│   │   └── shifts/            # Driver's shift history
│   ├── api/                   # API route handlers
│   │   ├── drivers/
│   │   └── vehicles/
│   ├── auth/                  # Auth callback
│   └── login/                 # Login page
├── components/
│   └── shared/                # Shared components
│       ├── Sidebar.tsx
│       ├── Header.tsx
│       └── DashboardLayout.tsx
├── lib/
│   ├── auth/                  # Auth utilities
│   ├── supabase/              # Supabase client setup
│   ├── services/              # Service modules (future features)
│   │   ├── eventsService.ts   # Gozo Events API stub
│   │   ├── notificationService.ts
│   │   └── chatService.ts
│   └── types/                 # TypeScript types
│       └── database.ts
├── supabase/
│   └── schema.sql             # Database schema
└── middleware.ts              # Auth middleware
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account (free tier works)

### 1. Clone and Install

```bash
git clone <repository-url>
cd spot-dashboard
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings > API** and copy your project URL and anon key
3. Create `.env.local` file (copy from `.env.local.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 3. Run Database Migrations

1. Go to your Supabase project's **SQL Editor**
2. Copy the contents of `supabase/schema.sql`
3. Run the SQL to create all tables, indexes, and RLS policies

### 4. Set Up Storage Buckets

In Supabase Dashboard > Storage:

1. Create a bucket named `shift-images` (public)
2. Create a bucket named `documents` (private)

Add storage policies to allow authenticated uploads.

### 5. Create Initial Admin User

1. Go to Supabase **Authentication > Users**
2. Click "Add user" and create your admin account
3. Run in SQL Editor:

```sql
INSERT INTO users (id, email, role, full_name)
VALUES (
  'your-auth-user-uuid-here',
  'admin@yourdomain.com',
  'admin',
  'Admin User'
);
```

### 6. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## User Roles

### Admin
- Full access to all features
- Manage drivers and vehicles (CRUD)
- View all shifts
- Access future features (earnings, notifications)

### Staff
- View-only access to most features
- Can view drivers, vehicles, shifts
- Cannot delete core entities

### Driver
- Access to driver portal only
- Can go online (start shifts)
- View own shifts and profile
- Update contact details

## Extending the Application

### Adding Earnings & Payslips

1. The `earnings` and `payslips` tables are already created
2. Add admin pages in `app/admin/earnings/`
3. Add driver pages in `app/driver/earnings/`
4. Use the existing API pattern from `app/api/drivers/`

### Integrating Gozo Events API

1. Update `lib/services/eventsService.ts`
2. Replace mock data with actual API calls
3. Add environment variables for API credentials
4. Create events display page in admin dashboard

### Adding Push Notifications

1. Update `lib/services/notificationService.ts`
2. Integrate with Firebase Cloud Messaging or OneSignal
3. Add FCM token storage to driver profiles
4. Create notification UI in `app/admin/notifications/`

### Implementing Real-time Chat

1. Update `lib/services/chatService.ts`
2. Enable Supabase Realtime for `chat_messages` table
3. Create chat UI components
4. Add WebSocket subscriptions for live updates

## API Routes

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| GET | `/api/drivers` | List all drivers | admin, staff |
| POST | `/api/drivers` | Create driver | admin |
| GET | `/api/vehicles` | List all vehicles | authenticated |
| POST | `/api/vehicles` | Create vehicle | admin |

## Database Schema

See `supabase/schema.sql` for the complete schema including:

- `users` - User profiles linked to Supabase Auth
- `drivers` - Driver information and documents
- `vehicles` - Vehicle details and maintenance
- `driver_shifts` - Go online records
- `files` - Document storage metadata
- `earnings`, `payslips` - Financial records (future)
- `events` - External events (future)
- `notifications` - Push notifications (future)
- `chat_messages` - Messaging system (future)

## Security

- Row Level Security (RLS) enabled on all tables
- Role-based permissions enforced at database level
- API routes include server-side auth checks
- Environment variables for sensitive config

## Contributing

1. Follow the existing code patterns
2. Use TypeScript for all new code
3. Use CSS modules for styling (no Tailwind)
4. Add proper types in `lib/types/database.ts`
5. Document extension points clearly

## License

Private - All rights reserved
