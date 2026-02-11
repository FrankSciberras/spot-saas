-- =============================================================================
-- Add front/back variants for ID Card and Driving License document types
-- =============================================================================

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'ID_CARD_FRONT';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'ID_CARD_BACK';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'DRIVING_LICENSE_FRONT';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'DRIVING_LICENSE_BACK';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'TAG_LICENSE';
