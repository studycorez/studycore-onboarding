import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export type ContractType = 'tutor' | 'tutor-student' | 'student';

export interface CreateContractParams {
  type: ContractType;
  recipientName: string;
  recipientEmail: string;
  contractData: Record<string, unknown>;
}

export async function createSigningContract({
  type,
  recipientName,
  recipientEmail,
  contractData,
}: CreateContractParams): Promise<string> {
  const supabase = getSupabase();
  const token = randomUUID();

  const { error } = await supabase.from('signing_contracts').insert([{
    token,
    type,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    contract_data: contractData,
    status: 'pending',
  }]);

  if (error) throw error;
  return token;
}

export async function getSigningContractByToken(token: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('signing_contracts')
    .select('*')
    .eq('token', token)
    .single();

  if (error) throw error;
  return data;
}

export async function markSigningContractSigned(
  token: string,
  { signedName }: { signedName: string },
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('signing_contracts')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_name: signedName,
    })
    .eq('token', token);

  if (error) throw error;
}

export async function listSigningContracts({
  type,
  status,
}: { type?: ContractType; status?: string } = {}) {
  const supabase = getSupabase();
  let q = supabase
    .from('signing_contracts')
    .select('*')
    .order('created_at', { ascending: false });
  if (type) q = q.eq('type', type);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
