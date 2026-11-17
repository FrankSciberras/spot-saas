-- =============================================================================
-- MESSAGING — in-app chat between a fleet's managers and drivers
-- =============================================================================
-- Replaces the WhatsApp groups fleets run today:
--   * direct chats   — one person to one person inside the same fleet
--   * group chats    — created by managers, with a title and chosen members
--   * "Everyone"     — one auto-managed group per fleet. Whoever joins the
--                      fleet joins it; whoever leaves the fleet leaves it.
--   * announcement   — a group flag: only managers can post, the rest read.
--
-- Tables
--   conversations         one row per chat (direct or group)
--   conversation_members  who is in each chat + their read position + mute
--   messages              the messages (text, photo, file, or a system line
--                         like "Frank added Ali")
--   push_devices          phone push tokens (Expo) for the driver app
--
-- SECURITY
--   * Writes are SERVICE-ROLE ONLY: every insert / update / delete goes
--     through the app's /api/messages routes, which check the caller's role
--     and membership first. No browser session can write these tables.
--   * Reads are allowed to the browser ONLY for chats the caller is a member
--     of (and only while they still belong to that fleet). That is what lets
--     Supabase Realtime push new messages straight to open chats — Realtime
--     checks these same policies per subscriber.
--   * Leaving a fleet (memberships row deleted) removes the person from every
--     chat in that fleet immediately (trigger below), so ex-drivers lose
--     access to the fleet's conversations.
--   * Attachments live in the existing PRIVATE `documents` bucket under
--     chat/<org>/<conversation>/…, served only through a membership-checked
--     API route that hands out a short-lived signed URL.
--
-- IDEMPOTENT: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Fleet setting: may drivers start private chats with OTHER drivers?
--    Off by default — drivers can always message managers, and chat with each
--    other in groups the managers create.
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS chat_driver_dms BOOLEAN NOT NULL DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- 1. conversations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind                   text NOT NULL CHECK (kind IN ('direct', 'group')),
  -- Groups only. Direct chats are titled with the other person's name.
  title                  text CHECK (title IS NULL OR char_length(title) <= 80),
  -- Announcement groups: only managers (admin/staff) may post.
  announcement           boolean NOT NULL DEFAULT false,
  -- 'everyone' = membership is managed automatically from the fleet's members.
  auto_members           text CHECK (auto_members IS NULL OR auto_members IN ('everyone')),
  -- Direct chats only: the two user ids, sorted, joined by ':'. Makes "one
  -- direct chat per pair per fleet" a unique index, and still tells us who the
  -- other person was after they leave the fleet.
  direct_key             text,
  created_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- Denormalised by the messages trigger so the inbox is one cheap query.
  last_message_at        timestamptz,
  last_message_preview   text,
  last_message_sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  archived_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_direct_key_matches_kind CHECK ((kind = 'direct') = (direct_key IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_uniq
  ON public.conversations (organization_id, direct_key) WHERE direct_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_auto_uniq
  ON public.conversations (organization_id, auto_members) WHERE auto_members IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversations_org_recent
  ON public.conversations (organization_id, last_message_at DESC);

-- -----------------------------------------------------------------------------
-- 2. conversation_members
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Group admin (may rename / add / remove). Fleet managers can always do so.
  is_admin        boolean NOT NULL DEFAULT false,
  -- Muted chats send no notifications and don't count toward the menu badge.
  muted           boolean NOT NULL DEFAULT false,
  -- Everything after this is unread for this member. Defaults to "now" so a
  -- person added to an old group isn't greeted with 300 unread messages.
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS conversation_members_user_org
  ON public.conversation_members (user_id, organization_id);

-- -----------------------------------------------------------------------------
-- 3. messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- NULL for system lines ("Frank added Ali") and for senders whose account
  -- was deleted.
  sender_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  kind            text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'image', 'file', 'system')),
  body            text CHECK (body IS NULL OR char_length(body) <= 4000),
  -- Object path in the private `documents` bucket. Never a public URL.
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size integer,
  -- Random id the sender's browser generates, so a retried send can't post
  -- the same message twice and the sender's own copy can be matched up.
  client_id       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  -- "Deleted for everyone": body + attachment are wiped, the row stays so the
  -- thread shows "This message was deleted".
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_uniq
  ON public.messages (sender_id, client_id) WHERE client_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. push_devices — Expo push tokens for the driver phone app.
--    Service-role only. Filled by the app once it registers for push.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_devices (
  token        text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform     text CHECK (platform IS NULL OR platform IN ('android', 'ios')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_devices_user ON public.push_devices (user_id);

-- -----------------------------------------------------------------------------
-- 5. Row level security
-- -----------------------------------------------------------------------------
-- Is the caller a member of this chat? SECURITY DEFINER so the policies below
-- don't recurse into conversation_members' own policy.
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conversation AND user_id = auth.uid()
  );
$$;

ALTER TABLE public.conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_devices         ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.conversations        FROM anon, authenticated;
REVOKE ALL ON public.conversation_members FROM anon, authenticated;
REVOKE ALL ON public.messages             FROM anon, authenticated;
REVOKE ALL ON public.push_devices         FROM anon, authenticated;

GRANT SELECT ON public.conversations        TO authenticated;
GRANT SELECT ON public.conversation_members TO authenticated;
GRANT SELECT ON public.messages             TO authenticated;
-- push_devices: no grants at all (service role only).

DROP POLICY IF EXISTS "Members read their conversations" ON public.conversations;
CREATE POLICY "Members read their conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id) AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Members read co-members" ON public.conversation_members;
CREATE POLICY "Members read co-members"
  ON public.conversation_members FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id) AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Members read messages" ON public.messages;
CREATE POLICY "Members read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id) AND public.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- 6. Keep the inbox summary on conversations up to date
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.messages_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_preview text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_preview := CASE
      WHEN NEW.kind = 'image' THEN COALESCE(NULLIF(left(NEW.body, 140), ''), 'Photo')
      WHEN NEW.kind = 'file'  THEN COALESCE(NULLIF(left(NEW.body, 140), ''), COALESCE(NEW.attachment_name, 'File'))
      ELSE left(COALESCE(NEW.body, ''), 140)
    END;
    UPDATE public.conversations
       SET last_message_at        = NEW.created_at,
           last_message_preview   = v_preview,
           last_message_sender_id = NEW.sender_id,
           updated_at             = now()
     WHERE id = NEW.conversation_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    -- Deleting the newest message must not leave its text in the inbox.
    UPDATE public.conversations
       SET last_message_preview = 'Message deleted',
           updated_at           = now()
     WHERE id = NEW.conversation_id
       AND last_message_at = NEW.created_at;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation
  AFTER INSERT OR UPDATE OF deleted_at ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_touch_conversation();

-- -----------------------------------------------------------------------------
-- 7. Fleet membership drives chat membership
--    * joining a fleet  → added to its "Everyone" group (if it exists yet)
--    * leaving a fleet  → removed from every chat in that fleet
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.memberships_sync_chat()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.conversation_members (conversation_id, user_id, organization_id)
    SELECT c.id, NEW.user_id, NEW.organization_id
      FROM public.conversations c
     WHERE c.organization_id = NEW.organization_id
       AND c.auto_members = 'everyone'
       AND c.archived_at IS NULL
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.conversation_members
     WHERE user_id = OLD.user_id
       AND organization_id = OLD.organization_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS memberships_sync_chat ON public.memberships;
CREATE TRIGGER memberships_sync_chat
  AFTER INSERT OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.memberships_sync_chat();

-- Creates the fleet's "Everyone" group on first use and fills it with every
-- current member. Service role only (called by the app's inbox route).
CREATE OR REPLACE FUNCTION public.chat_ensure_everyone(p_org uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.conversations
   WHERE organization_id = p_org AND auto_members = 'everyone';
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.conversations (organization_id, kind, title, auto_members)
  VALUES (p_org, 'group', 'Everyone', 'everyone')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Another request created it a moment ago.
    SELECT id INTO v_id FROM public.conversations
     WHERE organization_id = p_org AND auto_members = 'everyone';
    RETURN v_id;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, organization_id, is_admin)
  SELECT v_id, m.user_id, p_org, (m.role = 'admin')
    FROM public.memberships m
   WHERE m.organization_id = p_org
  ON CONFLICT DO NOTHING;

  INSERT INTO public.messages (conversation_id, organization_id, kind, body)
  VALUES (v_id, p_org, 'system', 'Everyone in the fleet is in this group. New drivers join automatically, and anyone who leaves the fleet is removed.');

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_ensure_everyone(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Inbox + unread counts for the CALLER (auth.uid()), one fleet at a time
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_inbox(p_org uuid)
RETURNS TABLE (
  id                     uuid,
  kind                   text,
  title                  text,
  announcement           boolean,
  auto_members           text,
  created_by             uuid,
  created_at             timestamptz,
  last_message_at        timestamptz,
  last_message_preview   text,
  last_message_sender_id uuid,
  muted                  boolean,
  is_admin               boolean,
  last_read_at           timestamptz,
  unread                 integer,
  member_count           integer,
  other_user_id          uuid,
  other_name             text,
  other_avatar_url       text,
  other_role             text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (
    SELECT cm.*
      FROM public.conversation_members cm
     WHERE cm.user_id = auth.uid()
       AND cm.organization_id = p_org
  ),
  convs AS (
    SELECT c.*, me.muted, me.is_admin, me.last_read_at, me.user_id AS me_id,
           CASE WHEN c.kind = 'direct' THEN
             CASE WHEN split_part(c.direct_key, ':', 1) = me.user_id::text
                  THEN split_part(c.direct_key, ':', 2)
                  ELSE split_part(c.direct_key, ':', 1) END
           END AS other_id_text
      FROM mine me
      JOIN public.conversations c ON c.id = me.conversation_id
     WHERE c.archived_at IS NULL
       -- An empty direct chat only shows for the person who opened it.
       AND (c.kind = 'group' OR c.last_message_at IS NOT NULL OR c.created_by = me.user_id)
  )
  SELECT c.id, c.kind, c.title, c.announcement, c.auto_members, c.created_by, c.created_at,
         c.last_message_at, c.last_message_preview, c.last_message_sender_id,
         c.muted, c.is_admin, c.last_read_at,
         (SELECT COUNT(*)::int FROM public.messages m
           WHERE m.conversation_id = c.id
             AND m.created_at > c.last_read_at
             AND m.sender_id IS DISTINCT FROM c.me_id
             AND m.kind <> 'system'
             AND m.deleted_at IS NULL) AS unread,
         (SELECT COUNT(*)::int FROM public.conversation_members x
           WHERE x.conversation_id = c.id) AS member_count,
         c.other_id_text::uuid,
         ou.full_name,
         ou.avatar_url,
         om.role::text
    FROM convs c
    LEFT JOIN public.users ou ON ou.id = c.other_id_text::uuid
    LEFT JOIN public.memberships om ON om.user_id = c.other_id_text::uuid AND om.organization_id = p_org
   ORDER BY COALESCE(c.last_message_at, c.created_at) DESC;
$$;

-- Total unread for the menu badge. Muted chats don't count.
CREATE OR REPLACE FUNCTION public.chat_unread_total(p_org uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int
    FROM public.conversation_members cm
    JOIN public.conversations c ON c.id = cm.conversation_id AND c.archived_at IS NULL
    JOIN public.messages m ON m.conversation_id = cm.conversation_id
   WHERE cm.user_id = auth.uid()
     AND (p_org IS NULL OR cm.organization_id = p_org)
     AND NOT cm.muted
     AND m.created_at > cm.last_read_at
     AND m.sender_id IS DISTINCT FROM auth.uid()
     AND m.kind <> 'system'
     AND m.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.chat_inbox(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_unread_total(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_inbox(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_unread_total(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. Realtime: push new / changed messages and read positions to open chats
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
  END IF;
END $$;

SELECT 'Messaging ready: conversations, conversation_members, messages (realtime), push_devices.' AS message;
