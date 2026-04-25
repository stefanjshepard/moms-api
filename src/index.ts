//Main Starting point for app

import express, { Application, Request, Response, ErrorRequestHandler } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes/index";
import bodyParser from "body-parser";
import { PrismaClient } from "@prisma/client";
import { apiLimiter } from "./middleware/rateLimit";
import { xss } from 'express-xss-sanitizer';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler';
import { startReminderDispatchScheduler, stopReminderDispatchScheduler } from './jobs/reminder.dispatcher';

// Loading env files from .env
dotenv.config();

// Initializing Express Application
const app: Application = express();
const prisma = new PrismaClient();
const PORT = process.env.NODE_ENV === 'test' ? 5002 : process.env.PORT || 5001;

// Security + Middleware
// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:3000', 'http://localhost:5001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  credentials: true,
  maxAge: 86400 // 24 hours
};
app.use(cors(corsOptions));

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
}));

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Security middleware
app.use(xss()); // Modern XSS protection
app.use(hpp()); // Prevent HTTP Parameter Pollution

// Rate limiting
app.use('/api', apiLimiter);

// Register routes
app.use("/api", routes);

//Base route check
app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "API is running" });
});

// 404 handler for non-existent routes
app.use('*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Resource not found' });
});

// Error handling middleware
app.use(errorHandler as ErrorRequestHandler);

// Graceful Shutdown for Prisma
process.on("SIGINT", async () => {
  stopReminderDispatchScheduler();
  await prisma.$disconnect();
  process.exit();
});

process.on("SIGTERM", async () => {
  stopReminderDispatchScheduler();
  await prisma.$disconnect();
  process.exit();
});

// Start express server only in non-test environment
if (process.env.NODE_ENV !== 'test') {
  startReminderDispatchScheduler();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export { app };