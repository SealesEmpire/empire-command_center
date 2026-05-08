#!/usr/bin/env bash
# =====================================================================
# Empire Command Center — Deploy
# =====================================================================
# Prereqs:
#   * Supabase CLI installed
#   * supabase login complete
#   * supabase link --project-ref <new-command-center-ref>
#   * .env.local populated
# =====================================================================

set -euo pipefail

if [[ -f .env.local ]]; then
    set -o allexport
    source .env.local
    set +o allexport
fi

echo "──── 1. Push migrations ────"
supabase db push

echo "──── 2. Set edge function secrets ────"
supabase secrets set \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    OPENAI_API_KEY="${OPENAI_API_KEY:-}"

echo "──── 3. Deploy edge functions ────"
supabase functions deploy ingest
supabase functions deploy extract-tasks
supabase functions deploy daily-report

echo "──── 4. Done ────"
echo ""
echo "Next:"
echo "  • npm install"
echo "  • npm run dev"
echo "  • Visit http://localhost:3000 and sign up"
echo "  • Run supabase/seed/seed.sql to pre-create your three projects"
