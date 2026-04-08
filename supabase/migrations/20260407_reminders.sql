-- Reminders / To-Do system
-- Supports: priority, due dates, timed notifications, recurring (daily/weekly/monthly/yearly),
-- assignment to staff, completion tracking

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date timestamptz,
  remind_at timestamptz,                    -- when to fire a notification
  reminder_sent boolean NOT NULL DEFAULT false,
  recurring text CHECK (recurring IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurring_end_date timestamptz,           -- stop recurring after this date (null = forever)
  parent_id uuid REFERENCES reminders(id) ON DELETE SET NULL,  -- links recurring children to original
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_created_by ON reminders(created_by);
CREATE INDEX idx_reminders_assigned_to ON reminders(assigned_to);
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_due_date ON reminders(due_date);
CREATE INDEX idx_reminders_remind_at ON reminders(remind_at) WHERE NOT reminder_sent;

-- RLS
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to reminders"
  ON reminders FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Staff can see reminders assigned to them or created by them
CREATE POLICY "Staff can view own reminders"
  ON reminders FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR assigned_to = auth.uid()
  );

-- Staff can update reminders assigned to them (mark complete etc)
CREATE POLICY "Staff can update assigned reminders"
  ON reminders FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());
