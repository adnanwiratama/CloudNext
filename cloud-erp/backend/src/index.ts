import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

import logger from './config/logger';
import { errorHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './modules/auth/auth.routes';
import customerRoutes from './modules/master/customers.routes';
import vendorRoutes from './modules/master/vendors.routes';
import itemRoutes from './modules/master/items.routes';
import salesRoutes from './modules/sales/sales.routes';
import purchasingRoutes from './modules/purchasing/purchasing.routes';
import manufacturingRoutes from './modules/manufacturing/manufacturing.routes';
import accountingRoutes from './modules/accounting/accounting.routes';
import reportsRoutes from './modules/reports/reports.routes';
import settingsRoutes from './modules/settings/settings.routes';
import currencyRoutes from './modules/settings/currency.routes';
import bankRoutes from './modules/bank/bank.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import employeeRoutes from './modules/employee/employee.routes';
import customFormsRoutes from './modules/customforms/customforms.routes';
import filesRoutes from './modules/files/files.routes';
import transactionsRoutes from './modules/transactions/transactions.routes';

const app = express();
const PORT = parseInt(process.env.APP_PORT || '4000');

// Security
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, error: 'Too many requests from this IP. Please try again later.' },
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: { write: (message: string) => logger.info(message.trim()) },
}));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'CloudERP',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchasing', purchasingRoutes);
app.use('/api/manufacturing', manufacturingRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/settings', currencyRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/custom-forms', customFormsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/transactions', transactionsRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.originalUrl} not found` });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`╔════════════════════════════════════════╗`);
  logger.info(`║         CloudERP Backend Started       ║`);
  logger.info(`║  Port: ${PORT}                              ║`);
  logger.info(`║  Mode: ${process.env.NODE_ENV || 'development'}                   ║`);
  logger.info(`╚════════════════════════════════════════╝`);
});

export default app;
