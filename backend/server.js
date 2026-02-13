const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Validate required environment variables
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET not set. Using default secret is insecure for production!');
}

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Routes
const corporationRoutes = require('./routes/corporationRoutes');
const regionRoutes = require('./routes/regionRoutes');
const circleRoutes = require('./routes/circleRoutes');
const divisionRoutes = require('./routes/divisionRoutes');
const kraRoutes = require('./routes/kraRoutes');
const kraEntryRoutes = require('./routes/kraEntryRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/api/corporations', corporationRoutes);
app.use('/api/regions', regionRoutes);
app.use('/api/circles', circleRoutes);
app.use('/api/divisions', divisionRoutes);
app.use('/api/kras', kraRoutes);
app.use('/api/kra-entries', kraEntryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'KRA Monitoring API is running' });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
