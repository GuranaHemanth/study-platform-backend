require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const morgan = require("morgan");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { validate } = require("express-validation");
const authRoutes = require("./routes/authRoutes");
const roomRoutes = require("./routes/roomRoutes");
const { jwtVerify } = require("./middleware/authMiddleware");
const roomValidation = require("./validation/roomValidation");

const app = express();
const httpServer = createServer(app);

// =====================
// WebSocket Setup
// =====================
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL 
      : 'http://localhost:3000',
    methods: ["GET", "POST"]
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000 // 2 minutes
  }
});

// =====================
// Security Middleware
// =====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL]
    }
  }
}));

// =====================
// Rate Limiting
// =====================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many login attempts, please try again later"
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});

// =====================
// Database Connection
// =====================
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connection established');
});

mongoose.connection.on('error', (err) => {
  console.error(`MongoDB connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB connection lost');
});

const connectWithRetry = () => {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  }).catch(err => {
    console.error(`MongoDB connection failed: ${err.message}`);
    setTimeout(connectWithRetry, 5000);
  });
};
connectWithRetry();

// =====================
// Application Middleware
// =====================
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

// =====================
// Routes
// =====================
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/rooms", apiLimiter, jwtVerify, validate(roomValidation), roomRoutes);

// =====================
// WebSocket Handlers
// =====================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  jwtVerify({ headers: { authorization: `Bearer ${token}` } }, {}, next);
});

io.on('connection', (socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);
  
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`🚪 User joined room: ${roomId}`);
    
    socket.on('webrtc-signal', (signal) => {
      socket.to(roomId).emit('webrtc-signal', signal);
    });
  });

  socket.on('disconnect', () => {
    console.log(`⚠️ Client disconnected: ${socket.id}`);
  });
});

// =====================
// Server Initialization
// =====================
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS Origin: ${process.env.FRONTEND_URL}`);
});

// =====================
// Additional Features
// =====================
app.get('/ping', (req, res) => res.send('pong'));

// =====================
// Error Handling
// =====================
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err);
  httpServer.close(() => process.exit(1));
});