require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const morgan = require("morgan");
const authRoutes = require("./routes/authRoutes");
const roomRoutes = require("./routes/roomRoutes");

const app = express();

// =====================
// Security Middleware
// =====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://*.example.com"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// =====================
// Rate Limiting
// =====================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for better UX
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later"
});
app.use(limiter);

// =====================
// Database Connection
// =====================
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
};

const connectWithRetry = () => {
  console.log('Attempting MongoDB connection...');
  mongoose.connect(process.env.MONGO_URI, mongooseOptions)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => {
      console.error(`MongoDB connection error (retrying in 5s): ${err.message}`);
      setTimeout(connectWithRetry, 5000);
    });
};
connectWithRetry();

// =====================
// Application Middleware
// =====================
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(morgan('combined')); // HTTP request logger

// =====================
// Routes
// =====================
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/rooms", roomRoutes);

// =====================
// Health Checks
// =====================
app.get("/health", (req, res) => res.json({ 
  status: "ok",
  timestamp: new Date().toISOString(),
  uptime: process.uptime()
}));

// =====================
// Error Handling
// =====================
app.use((req, res, next) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((err, req, res, next) => {
  const errorResponse = {
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  console.error(`[${errorResponse.timestamp}] Error:`, errorResponse);
  res.status(err.statusCode || 500).json(errorResponse);
});

// =====================
// Server Initialization
// =====================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing server');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});
