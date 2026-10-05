-- =============================================================================
-- MEMBERSHIP INVITES — a fleet can't add an existing Rovora user without consent
-- =============================================================================
-- Before this, "Add driver" with an email that already had a Rovora account
-- (e.g. a driver at another fleet) silently created a membership in the new
-- fleet: no email, no way to say no, and the person started receiving that
-- fleet's shift reminders and roster emails.
--
-- Now /api/members/invite records a PENDING invite for existing accounts and
-- emails them. Nothing is created in the fleet until they accept at /invites:
-- no membership and — deliberately — no drivers row either, because
-- driver_id_for_org() trusts drivers.user_id alone, so a pre-created row would
-- let the person's phone write location into a fleet they never agreed to join.
-- The fleet's form values wait in driver_details and become the drivers row on
-- acceptance (lib/actions/invites.ts).
--
-- Brand-new people are unaffected: their invite email (set your password)
-- already is the consent step.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.membership_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  role            user_role NOT NULL DEFAULT 'driver',
  -- Whitelisted driver form fields (phone, employment type, licence numbers…)
  -- applied when the drivers row is created on acceptance.
  driver_details  JSONB NOT NULL DEFAULT '{}'::jsonb,
  invited_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at    TIMESTAMPTZ
);

-- At most one open invite per person per fleet.
CREATE UNIQUE INDEX IF NOT EXISTS membership_invites_one_pending
  ON public.membership_invites (organization_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_membership_invites_user_pending
  ON public.membership_invites (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_membership_invites_org
  ON public.membership_invites (organization_id, created_at DESC);

-- Reads only; every write goes through the server (service role) after its own
-- checks — the invitee for accept/decline, a fleet admin for invite/cancel.
ALTER TABLE public.membership_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invitees see their own invites" ON public.membership_invites;
CREATE POLICY "Invitees see their own invites"
  ON public.membership_invites FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Fleet admins see their fleet's invites" ON public.membership_invites;
CREATE POLICY "Fleet admins see their fleet's invites"
  ON public.membership_invites FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id));

SELECT 'Membership invites installed.' AS message;
