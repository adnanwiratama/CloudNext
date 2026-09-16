import db from '../config/database';

interface AuditParams {
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityNumber?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  trx?: any;
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  const query = params.trx ? params.trx : db;
  try {
    await query('audit_logs').insert({
      company_id: params.companyId,
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      entity_number: params.entityNumber,
      old_values: params.oldValues ? JSON.stringify(params.oldValues) : null,
      new_values: params.newValues ? JSON.stringify(params.newValues) : null,
      ip_address: params.ipAddress,
    });
  } catch (e) {
    // Audit log failure should not break the main transaction
    console.error('Audit log failed:', e);
  }
}
