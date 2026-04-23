require('dotenv').config();
const mongoose = require('mongoose');
const Business = require('./models/Business');

const seedDatabase = async () => {
  try {
    // 1 & 2: Environment setup and database connection
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in the .env file');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // 3: Clean Slate - clear existing documents
    await Business.deleteMany({});
    console.log('Cleared existing businesses from the database.');

    // 4: Dummy Data Insertion
    const mockBusinesses = [
      {
        name: "TechFix Anna Nagar",
        category: "Electronics Repair",
        location: { lat: 9.9285, lng: 78.1448 },
        rating: 3.2,
        recentReviews: [
          "Fixed my screen, but they took 4 days.",
          "A bit expensive for a simple battery swap.",
          "Customer service was quite rude."
        ]
      },
      {
        name: "Meenakshi Laptop Service",
        category: "Electronics Repair",
        location: { lat: 9.9195, lng: 78.1193 },
        rating: 4.5,
        recentReviews: [
          "Great service, very fast.",
          "Highly recommend."
        ]
      },
      {
        name: "KK Nagar Quick Repairs",
        category: "Electronics Repair",
        location: { lat: 9.9350, lng: 78.1400 },
        rating: 2.8,
        recentReviews: [
          "Didn't have parts.",
          "Store was closed.",
          "Prices keep changing."
        ]
      }
    ];

    await Business.insertMany(mockBusinesses);
    console.log('Successfully inserted 3 mock businesses!');

    // 5: Graceful Exit
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);

  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
