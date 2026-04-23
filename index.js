require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const analysisRoutes = require('./routes/analysisRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Enable CORS for all routes (frontend communication)
app.use(express.json()); // Parse JSON request bodies

// Routes
app.use('/api', analysisRoutes);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    // Start Server only after DB connection for safety, or independently.
    // For MVP we start it regardless of immediate DB success.
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.log('Ensure you have a valid MONGO_URI in your .env file.');
  });

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
