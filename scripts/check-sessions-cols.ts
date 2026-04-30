import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await supabase.from('sessions').select('*').limit(1);
  if (data?.[0]) console.log('Columns:', Object.keys(data[0]).join(', '));
}
main().catch(console.error);
