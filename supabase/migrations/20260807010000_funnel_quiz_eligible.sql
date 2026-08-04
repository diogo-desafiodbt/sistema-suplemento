-- Se 20260807000000 já rodou sem quiz_eligible, adiciona o valor.
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'quiz_eligible';
