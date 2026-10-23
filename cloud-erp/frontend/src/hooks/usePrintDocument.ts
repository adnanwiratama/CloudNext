import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { printDocument, PrintDoc, PrintCompany } from '../utils/printDocument';

// Loads company settings once (cached) and returns a print(doc) helper that
// renders a standard transaction printout with the company header filled in.
export function usePrintDocument() {
  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => api.get('/api/settings/company').then(r => r.data.data as PrintCompany),
    staleTime: 5 * 60 * 1000,
  });

  const print = (doc: PrintDoc) => printDocument(doc, company || {});

  return { print, company };
}
