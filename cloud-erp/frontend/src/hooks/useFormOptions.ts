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
    queryFn: () => api.get('/api/accounting/accounts').then(r => r.data.data || []),
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

  const taxCodes = useQuery({
    queryKey: ['options-tax-codes'],
    queryFn: () => api.get('/api/settings/tax-codes').then(r => r.data.data || []),
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
    taxCodes: taxCodes.data || [],
    currencies,
    paymentTerms,
    isLoading: customers.isLoading || vendors.isLoading || items.isLoading,
  };
}
