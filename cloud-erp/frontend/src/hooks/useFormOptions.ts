import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

// Reusable hook to load dropdown options for forms
export function useFormOptions() {
  const customers = useQuery({
    queryKey: ['options-customers'],
    queryFn: () => api.get('/api/customers', { params: { limit: 500 } }).then(r => r.data.data || []),
    staleTime: 60000,
  });

  const vendors = useQuery({
    queryKey: ['options-vendors'],
    queryFn: () => api.get('/api/vendors', { params: { limit: 500 } }).then(r => r.data.data || []),
    staleTime: 60000,
  });

  const items = useQuery({
    queryKey: ['options-items'],
    queryFn: () => api.get('/api/items', { params: { limit: 500 } }).then(r => r.data.data || []),
    staleTime: 60000,
  });

  const accounts = useQuery({
    queryKey: ['options-accounts'],
    // Dropdowns are for selecting a postable account, so exclude Summary (parent/
    // header) accounts and Inactive accounts. The backend already omits inactive
    // ones by default; we additionally drop summary accounts here.
    queryFn: () => api.get('/api/accounting/accounts').then(r =>
      (r.data.data || []).filter((a: any) => !a.is_summary && a.is_active !== false)),
    staleTime: 60000,
  });

  const locations = useQuery({
    queryKey: ['options-locations'],
    queryFn: () => api.get('/api/settings/locations').then(r => r.data.data || []),
    staleTime: 60000,
  });

  const departments = useQuery({
    queryKey: ['options-departments'],
    queryFn: () => api.get('/api/settings/departments').then(r => r.data.data || []),
    staleTime: 60000,
  });

  // Employees are stored as users (same source as the Employees list page).
  const employees = useQuery({
    queryKey: ['options-employees'],
    queryFn: () => api.get('/api/settings/users', { params: { limit: 500 } }).then(r => r.data.data || []),
    staleTime: 60000,
  });

  const taxCodes = useQuery({
    queryKey: ['options-tax-codes'],
    queryFn: () => api.get('/api/settings/tax-codes').then(r => r.data.data || []),
    staleTime: 60000,
  });

  // All active units of measure (with uom_type_id) — used to filter the line "Unit" dropdown by the item's unit type
  const uomUnits = useQuery({
    queryKey: ['options-uom-units'],
    queryFn: () => api.get('/api/settings/uom').then(r => r.data.data || []),
    staleTime: 60000,
  });

  const currencies = ['IDR', 'USD', 'EUR', 'SGD', 'MYR'];
  const paymentTerms = ['Net7', 'Net14', 'Net30', 'Net45', 'Net60', 'COD', 'CIA'];

  return {
    customers: customers.data || [],
    vendors: vendors.data || [],
    items: items.data || [],
    accounts: accounts.data || [],
    locations: locations.data || [],
    departments: departments.data || [],
    employees: employees.data || [],
    taxCodes: taxCodes.data || [],
    uomUnits: uomUnits.data || [],
    currencies,
    paymentTerms,
    isLoading: customers.isLoading || vendors.isLoading || items.isLoading,
  };
}
