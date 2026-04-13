import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Checking team_members is_primary_payer...');
  const { data, error } = await supabase.from('team_members').select('id, name, is_primary_payer').order('name');
  if (error) {
    console.error('Error querying DB:', error.message);
  } else {
    // find 張恩碩 and 張恩愷
    const target = data.filter(r => r.name.includes('張恩'));
    console.log('Target players:', target);
  }
}

main();
