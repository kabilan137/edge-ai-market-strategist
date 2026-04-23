const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: {
    lat: { type: Number },
    lng: { type: Number }
  },
  searchLocation: { type: String },
  category: { type: String },
  rating: { type: Number },
  recentReviews: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Business', businessSchema);
